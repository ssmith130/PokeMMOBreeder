// PokeMMO breeding planner.
// Builds the breeding tree with the fewest breeds (or lowest cost) that turns
// the Pokémon you own into the Pokémon you want, under PokeMMO's rules:
//  - both parents are consumed, each parent holds at most one item
//  - a Power item ("brace") guarantees that parent's IV for its stat
//  - a stat both parents share is guaranteed too (inherited from one, or the
//    average of both, which is never below the lower parent)
//  - an Everstone passes the holder's nature (and takes the brace slot)
//  - the egg is the mother's species (or the non-Ditto parent's species); the incense babies
//    (Azurill, Happiny, ...) only hatch when a parent holds their incense, which takes its item slot
//  - Nidoran♀/Nidoran♂ and Illumise/Volbeat eggs hatch as either species, decided by the egg's gender
//  - genderless Pokémon breed with Ditto or with any Pokémon of their own line (Beldum x Metang),
//    and Ditto can't be bred
//  - abilities pass from the mother (or the non-Ditto parent) with a chance; a hidden ability also passes from a
//    father of the egg's own line, since PokeMMO checks the species for it, not the gender (changelog 15/10/2022:
//    "species checks used for Hidden Ability breeding"; forum Hidden Ability Breeding Guide: a HA male with a
//    regular female of the same evolution line)
//  - egg moves pass from either parent (PokeMMO, unlike Gen 5 where only the father passed them)
//  - picking the egg's gender costs the 1:1 price for the common gender, more for the rare one
//  - a costume (Royal Charizard, Pirate Gible, ...) passes to the egg when the egg is the costumed parent's
//    own line (so from the mother, the non-Ditto parent, or a father of the same line); two different
//    costumes can't breed together. It passes on every breed (Sean, from players in game, 2026-11-20).
//  - your OT on a shiny you caught (target.ot, pool p.ot) carries to the egg the same way: when the egg is that
//    shiny's species, so from an OT mother or non-Ditto parent, or an OT father with a mother of his line
//    (PokeMMO Wiki, Breeding: Maintaining Original Trainer). The planner treats the whole line as one species.
(function (root) {
  const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const BRACES = ['Power Weight', 'Power Bracer', 'Power Belt', 'Power Lens', 'Power Band', 'Power Anklet'];
  const NO_BREED = new Set(['Undiscovered', 'Ditto']);
  // Babies that only hatch when a parent holds an incense: [what the egg is without it, the incense].
  const INCENSE = {
    Azurill: ['Marill', 'Sea Incense'], Wynaut: ['Wobbuffet', 'Lax Incense'], Munchlax: ['Snorlax', 'Full Incense'],
    'Mime Jr.': ['Mr. Mime', 'Odd Incense'], Bonsly: ['Sudowoodo', 'Rock Incense'], Budew: ['Roselia', 'Rose Incense'],
    Chingling: ['Chimecho', 'Pure Incense'], Happiny: ['Chansey', 'Luck Incense'], Mantyke: ['Mantine', 'Wave Incense'],
  };
  // Male species whose eggs come from the same line as a female species: the egg's gender picks which one hatches.
  const COUNTERPART = { 'Nidoran-M': 'Nidoran-F', Volbeat: 'Illumise' };
  // Babies with more than one evolution that can breed; the rest evolve into the first one by dex number.
  const EVOLVES_INTO = { Tyrogue: ['Hitmonlee', 'Hitmonchan', 'Hitmontop'] };
  // PokeMMO's costumes and the line that wears each one (Shiny Wars 2026 and Halloween 2026). Codes store a
  // costume as its place in this list, so only ever add to the end.
  const COSTUMES = [['Royal', 'Charmander'], ['Ninja', 'Meowth'], ['Vampire', 'Sneasel'], ['Pirate', 'Gible'], ['Pharaoh', 'Riolu']];

  // Whether an IV meets a goal: 0 means exactly 0 (a Trick Room 0 Spe, a special attacker's 0 Atk), any other
  // number is a minimum. An unknown IV (null) never meets one.
  function meets(v, want) { return v != null && want != null && (want === 0 ? v === 0 : v >= want); }

  function popcount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }
  function bitsOf(m) { const r = []; for (let i = 0; i < 6; i++) if (m & (1 << i)) r.push(i); return r; }

  // species: [{n, g (male ratio | 'M' | 'F' | 'N'), e: eggGroups, a: abilities, h: hidden, b: base, m: eggMoves}]
  function buildDex(species) {
    const byName = new Map();
    for (const s of species) byName.set(s.n.toLowerCase(), s);
    // A line is named after what its eggs hatch as: the first stage, or the stage after an incense baby.
    // Nidoran♂ and Volbeat join their female counterpart's line, which then hatches either gender.
    const lineName = (s) => {
      const first = COUNTERPART[s.b || s.n] || s.b || s.n;
      return INCENSE[first] ? INCENSE[first][0] : first;
    };
    const lines = new Map(); // line name -> {name, groups:Set, ratio}
    for (const s of species) {
      const base = lineName(s);
      if (!lines.has(base)) lines.set(base, { name: base, groups: new Set(), all: new Set(), ratio: null });
      const L = lines.get(base);
      for (const g of s.e) L.all.add(g);
      if (s.n === base) L.ratio = s.g;
      if (COUNTERPART[s.n]) L.male = s.n;
      // egg moves are listed on the first stage; a shared line keeps the male species' list apart
      if (!s.b) L[COUNTERPART[s.n] ? 'movesM' : 'moves'] = new Set(s.m || []);
    }
    for (const L of lines.values()) {
      for (const g of L.all) if (!NO_BREED.has(g)) L.groups.add(g);
      if (L.ratio === null || L.male) L.ratio = 0.5;
    }
    const get = (name) => byName.get(String(name).toLowerCase());
    // A baby (Pichu, Riolu, Happiny, ...) can't breed, but the Pokémon it evolves into can, with the same IVs,
    // nature, ability and moves. Returns what it can evolve into to breed, or null for anything else
    // (a Pokémon that breeds already, or one that never can, like Nidorina or a legendary).
    const evolveCache = new Map();
    function evolveInto(name) {
      const s = get(name);
      if (!s || !s.e.includes('Undiscovered') || s.b) return null;
      if (evolveCache.has(s.n)) return evolveCache.get(s.n);
      const line = lineName(s), L = lines.get(line);
      let out = null;
      if (L && L.groups.size) {
        const breeders = species.filter((x) => x !== s && lineName(x) === line && !x.e.includes('Undiscovered')).sort((a, b) => a.i - b.i);
        out = EVOLVES_INTO[s.n] || (breeders.length ? [breeders[0].n] : null);
      }
      evolveCache.set(s.n, out);
      return out;
    }
    return { byName, lines, evolveInto, lineOf: (name) => { const s = get(name); return s ? lineName(s) : null; },
      // The costumes a species can wear: the ones made for its line.
      costumesOf: (name) => { const s = get(name); return s ? COSTUMES.filter(([, l]) => l === lineName(s)).map(([c]) => c) : []; },
      incenseOf: (name) => { const s = get(name); return s && INCENSE[s.n] ? INCENSE[s.n][1] : null; },
      // What an egg of this line hatches as: Nidoran-M for a male Nidoran egg, the line's own name otherwise.
      hatchName: (line, gender) => { const L = lines.get(line); return L && L.male && gender === 'M' ? L.male : line; } };
  }

  function hasMales(r) { return r !== 'F' && r !== 'N'; }
  function hasFemales(r) { return r !== 'M' && r !== 'N'; }

  function plan(input) {
    const { dex, target, pool: rawPool, prices, opts } = input;
    const tLine = dex.lineOf(target.species);
    if (!tLine) return { error: `Unknown species "${target.species}".` };
    if (tLine === 'Ditto') return { error: "Ditto can't be bred, so the planner can't make one. Look for one with the IVs you want on the GTL." };
    if (dex.lines.get(tLine).groups.size === 0)
      return { error: `${target.species} can't breed (Undiscovered egg group), so it can't be bred for IVs.` };

    const tIV = target.ivs; // per stat: required minimum, 0 for exactly 0, or null
    let needAll = 0, zeros = 0;
    for (let i = 0; i < 6; i++) if (tIV[i] != null) { needAll |= 1 << i; if (tIV[i] === 0) zeros |= 1 << i; }
    const tMoves = target.moves || [];
    // A baby goal that needs an incense: the last breed has a parent hold it, and the egg's gender
    // follows the baby's ratio.
    const tSpecies = dex.byName.get(String(target.species).toLowerCase());
    const incense = dex.incenseOf(target.species) || '';
    // A costume goal: the costume has to come down from a parent of this line wearing it.
    const tCostume = target.costume && dex.costumesOf(target.species).includes(target.costume) ? target.costume : '';

    const pool = rawPool.map((p, i) => {
      const line = p.isDitto ? 'Ditto' : dex.lineOf(p.species);
      const s = dex.byName.get(String(p.species).toLowerCase());
      let mask = 0;
      for (let s = 0; s < 6; s++) if (meets(p.ivs[s], tIV[s])) mask |= 1 << s;
      return {
        i, src: p, line, isDitto: !!p.isDitto, gender: p.gender, mask, name: s ? s.n : '',
        // Pokémon that never breed (Nidorina, ...) only count if they already are the Pokémon you want.
        // A baby counts as what it evolves into; the plan says to evolve it first.
        baby: !p.isDitto && !!s && s.e.includes('Undiscovered') && !dex.evolveInto(s.n),
        evolve: !p.isDitto && !!s && !!dex.evolveInto(s.n),
        iv: p.ivs.map((v) => (v == null ? 0 : v)),
        natured: !!target.nature && p.nature === target.nature,
        abil: !!target.ability && p.ability === target.ability,
        moves: tMoves.length > 0 && tMoves.every((m) => (p.moves || []).includes(m)),
        // wears the goal's costume (only its own line can pass it on)
        cos: !!tCostume && p.costume === tCostume && line === tLine,
        // a shiny you caught yourself, of the goal's line: an OT shiny goal keeps your OT only through one of these
        ot: !!target.ot && !!p.ot && line === tLine,
      };
    // Other costumes stay out: two different costumes can't breed together, and a plain goal shouldn't use one up.
    }).filter((p) => p.line && (!p.src.costume || p.cos));
    if (pool.length > 63) return { error: 'The planner handles up to 63 Pokémon at a time.' };
    // Identical Pokémon are interchangeable, so the search tracks how many of each
    // kind are left (6 bits per kind packed in a BigInt, plus a spare bit) instead of which ones.
    const kinds = [];
    const bySig = new Map();
    for (const p of pool) {
      // Only the IVs that meet the goal show in the plan, so the others don't split kinds.
      const ivs = p.iv.map((v, s) => (p.mask & (1 << s) ? v : '')).join(',');
      const sig = [p.line, p.gender, p.mask, p.natured, p.abil, p.moves, p.cos, p.ot, ivs, p.baby || p.evolve ? p.name : ''].join('|');
      let c = bySig.get(sig);
      if (!c) { c = { ...p, members: [], shift: BigInt(kinds.length * 7) }; c.bit = 1n << c.shift; bySig.set(sig, c); kinds.push(c); }
      c.members.push(p);
    }
    // cheapest first: the ones worth least (opts.protect), then the fewest 31s, so those get used up first
    const cheap = (m) => (opts.protect ? Number(m.src.worth) || 0 : 0) * 100 + m.iv.filter((v) => v >= 31).length;
    for (const c of kinds) c.members.sort((a, b) => cheap(a) - cheap(b) || a.i - b.i);
    const has = (avail, c) => ((avail >> c.shift) & 63n) > 0n;
    // within(x, y): every count in x is at most the one in y. The spare bit in each field stops
    // one count's subtraction from borrowing from the next.
    let SPARE = 0n;
    for (const c of kinds) SPARE |= 64n << c.shift;
    const within = (x, y) => (((y | SPARE) - x) & SPARE) === SPARE;

    const lineInfo = (l) => dex.lines.get(l);
    function compat(a, b) {
      const A = lineInfo(a), B = lineInfo(b);
      if (!A || !B) return false;
      for (const g of A.groups) if (B.groups.has(g)) return true;
      return false;
    }
    // A Nidoran or Volbeat/Illumise egg gets the egg moves of the species its gender makes it.
    function movesOf(L, g) {
      if (!L.male) return L.moves;
      return g === 'M' ? L.movesM : g === 'F' ? L.moves : new Set([...L.moves].filter((m) => L.movesM.has(m)));
    }
    function lineOk(req, line) { return req.kind === 'L' ? line === req.line : compat(req.line, line); }
    // The price goes by how rare the picked gender is: a male Charmander (7 in 8 are male) costs the
    // 1:1 price, a female one the 7:1 price.
    function genderCost(line, g, r = lineInfo(line).ratio) {
      if (g === 'A') return 0;
      if (typeof r !== 'number') return 0; // single-gender or genderless: nothing to pick
      const share = g === 'M' ? r : 1 - r;
      if (share >= 0.5) return prices.gender11;
      if (share >= 0.25) return prices.gender31;
      return prices.gender71;
    }
    const abilityIsHidden = target.abilityHidden;
    const abilityChance = abilityIsHidden ? prices.haChance : prices.abilityChance;

    // Ties go to the plan that uses up less of your Pokémon (value: their 31s and natures). With opts.protect
    // each Pokémon you own also has a price (pool item's worth: half its rough GTL worth, about what selling it
    // brings, so buying one is never cheaper than using your own), and the plan with the lowest cost plus worth
    // used wins. A Pokémon you own that fits a step is still used as is (breeding a stand-in instead made big
    // boxes run out of search work).
    const protect = !!opts.protect, costFirst = opts.mode === 'cost' || protect;
    const total = (r) => r.cost + (protect ? r.worth || 0 : 0);
    const better = costFirst
      ? (a, b) => (total(a) - total(b)) || (a.breeds - b.breeds) || (a.value - b.value)
      : (a, b) => (a.breeds - b.breeds) || (a.cost - b.cost) || (a.value - b.value);
    function pick(a, b) { if (!a) return b; if (!b) return a; return better(b, a) < 0 ? b : a; }

    // A requirement: which line(s), which gender, which stats, nature/ability/egg moves.
    // kind 'L' = exactly this line; kind 'C' = any line that can breed with this line.
    function rank(req) { return (req.kind === 'C' ? 4 : 0) + (req.gender === 'M' ? 2 : req.gender === 'F' ? 1 : 0); }
    // Every request a breed splits into must be smaller, so the search ends. Only the goal needs an
    // incense, so anything without one is smaller than it. Dropping the egg moves (the mother's side)
    // or the ability (the father's side) also counts, so a parent can carry the goal's one IV.
    function size(req) {
      return (req.incense ? 1e6 : 0) + ((popcount(req.need) * 2 + (req.nat ? 1 : 0)) * 16 + (req.mv ? 8 : 0) + (req.cos ? 4 : 0) + (req.ot ? 2 : 0) + (req.abil ? 1 : 0)) * 8 + rank(req);
    }
    function key(req) { return `${req.kind}${req.line}|${req.gender}|${req.need}|${+req.nat}|${+req.abil}|${+req.mv}|${+!!req.cos}|${+!!req.ot}|${req.incense || ''}|${+!!req.top}`; }

    let calls = 0, truncated = false, work = 0, timedOut = false;
    const LIMIT = opts.limit || 600000;
    // A fixed amount of work (every Pokémon looked at and every breed tried counts one) gives the same
    // answer on every computer, unlike a time limit. Without one, only the clock stops the search.
    const WORK = opts.work || Infinity;
    // A safety cut-off: stop after this long and show the best plan found so far (timedOut says so,
    // since that answer can then differ between computers).
    const deadline = Date.now() + (opts.timeLimit || 6000);
    const memo = new Map(); // request -> [{avail, best}]
    const dittoMemo = new Map();

    // Pokémon of one kind are handed out cheapest first (members are sorted), so the next one used is the
    // cheapest still left. value: every 31 it has (not only the goal's) and a goal nature, which using it
    // up spends; worth: its price with opts.protect.
    const ownValue = (m) => m.iv.filter((v) => v >= 31).length + (m.natured ? 1 : 0);
    const ownWorth = (m) => (protect ? Number(m.src.worth) || 0 : 0);
    function leafOwned(p, avail) {
      const m = p.members[Math.max(0, p.members.length - Number((avail >> p.shift) & 63n))] || p;
      return { breeds: 0, cost: 0, worth: ownWorth(m), value: ownValue(m), used: p.bit, chance: 1,
        iv: p.iv, node: { t: 'own', p } };
    }

    // What can be bought off the GTL: Pokémon with 1, 2 or 3 IVs at 31, each with or without your
    // nature (opts.buyIV / opts.buyNat list the counts that are allowed). Plain opts.buy alone means
    // 1x31 only, as before.
    const BUY_KEYS = { plain: ['buy', 'buy2', 'buy3'], nat: ['buyNatured', 'buyNatured2', 'buyNatured3'], ditto: ['buyDitto', 'buyDitto2', 'buyDitto3'] };
    const buyCounts = (list) => (Array.isArray(list) ? list : [1]).filter((k) => k >= 1 && k <= 3);
    // Natured ones only count when the goal has a nature.
    const buyPlain = opts.buy ? buyCounts(opts.buyIV) : [], buyNat = opts.buy && target.nature ? buyCounts(opts.buyNat) : [];
    const maxPlain = Math.max(0, ...buyPlain), maxNat = Math.max(0, ...buyNat);
    // The cheapest Pokémon on offer with at least c IVs at 31 (and your nature if nat): { cost, k } or null.
    function offer(c, nat, ditto) {
      let best = null;
      const look = (counts, keys) => {
        for (const k of counts) {
          const cost = prices[keys[k - 1]];
          if (k < c || typeof cost !== 'number' || !isFinite(cost)) continue;
          if (!best || cost < best.cost || (cost === best.cost && k < best.k)) best = { cost, k, nat: keys === BUY_KEYS.nat };
        }
      };
      if (ditto) { if (!nat) look(buyPlain, BUY_KEYS.ditto); return best; }
      look(buyNat, BUY_KEYS.nat);
      if (!nat) look(buyPlain, BUY_KEYS.plain);
      return best;
    }

    // kind 'L' = must be this line (it passes on the species); 'C' = any line it can breed with.
    // The GTL prices are for 31s, so a parent that has to have a 0 IV is never bought: it comes from your Pokémon.
    function buyLeaf(line, gender, need, nat, ditto, kind) {
      if (need & zeros) return null;
      const o = offer(popcount(need), nat, ditto);
      if (!o) return null;
      const stats = bitsOf(need);
      const iv = [0, 0, 0, 0, 0, 0];
      for (const s of stats) iv[s] = tIV[s];
      // count: how many 31s the one to buy has (a 2x31 can fill a spot that needs one); nat: it has your
      // nature, which a plain spot can also use when only natured ones are ticked.
      return { breeds: 0, cost: o.cost, value: 0, used: 0n, chance: 1, iv, bought: 1,
        node: { t: 'buy', line, gender, stat: stats[0], stats, count: o.k, nat: nat || o.nat, ditto, kind } };
    }

    function solveDitto(need, nat, avail) {
      const k = need + '|' + nat + '|' + avail;
      if (dittoMemo.has(k)) return dittoMemo.get(k);
      let best = null;
      for (const p of kinds) {
        if (!p.isDitto || !has(avail, p)) continue;
        if ((p.mask & need) !== need || (nat && !p.natured)) continue;
        best = pick(best, leafOwned(p, avail));
      }
      if (!nat && popcount(need) <= maxPlain) best = pick(best, buyLeaf('Ditto', 'N', need, false, true, 'L'));
      dittoMemo.set(k, best);
      return best;
    }

    // relaxed: a quick pass that may use each Pokémon you own any number of times. It can't need more
    // breeds or cost more than the real plan, so the real search skips breeds it shows can't win.
    function solve(req, avail, relaxed) {
      const k = (relaxed ? 'R' : '') + key(req);
      let seen = memo.get(k);
      if (!seen) memo.set(k, seen = { exact: new Map(), recent: [] });
      if (seen.exact.has(avail)) return seen.exact.get(avail);
      // A plan found with more Pokémon to spare is still the best one if it only uses Pokémon still
      // left (and no plan with more means none with fewer). Only the latest few are checked.
      for (let i = seen.recent.length - 1; i >= 0 && i >= seen.recent.length - 24; i--) {
        const e = seen.recent[i];
        if (within(avail, e.avail) && (!e.best || within(e.best.used, avail))) return e.best;
      }
      const remember = (best) => { seen.exact.set(avail, best); seen.recent.push({ avail, best }); return best; };
      // Out of time: every search still running gives up, the unlimited pass included.
      if (calls > LIMIT || work > WORK) { calls = LIMIT + 1; truncated = true; return null; }
      work++;
      const bound = relaxed ? null : solve(req, full, true);
      if (!relaxed && !bound) return remember(null);
      if (!relaxed && (++calls > LIMIT || ((calls & 1023) === 0 && Date.now() > deadline && (timedOut = true)))) calls = LIMIT + 1;
      if (!relaxed && calls > LIMIT) { truncated = true; return null; }

      // 1-2. A Pokémon you own, or one to buy. Nothing beats a Pokémon you already have.
      let best = leaf(req, avail);
      if (best && !best.bought) return remember(best);
      return remember(breed(req, avail, relaxed, bound, best));
    }

    // A Pokémon that meets the request without breeding: one you own, or one off the GTL.
    function leaf(req, avail) {
      let best = null;

      // 1. A Pokémon you already own.
      work += kinds.length;
      for (const p of kinds) {
        if (p.isDitto || !has(avail, p)) continue;
        if (!lineOk(req, p.line)) continue;
        if (req.gender !== 'A' && p.gender !== req.gender) continue;
        if ((p.mask & req.need) !== req.need) continue;
        if (req.nat && !p.natured) continue;
        if (req.abil && !p.abil) continue;
        if (req.mv && !p.moves) continue;
        if (req.cos && !p.cos) continue;
        if (req.ot && !p.ot) continue;
        if (p.baby && !req.top) continue;
        if (req.incense && p.name !== tSpecies.n) continue;
        best = pick(best, leafOwned(p, avail));
      }
      if (best) return best;

      // 2. Buy one off the GTL to fill a gap (1x31, or 2x31 and 3x31 when those are ticked).
      if (popcount(req.need) <= (req.nat ? maxNat : Math.max(maxPlain, maxNat)) && !req.abil && !req.mv && !req.cos && !req.ot && !req.incense) {
        const L = lineInfo(req.line);
        const g = req.gender;
        if (L && L.groups.size && (g === 'A' || (g === 'M' ? hasMales(L.ratio) : hasFemales(L.ratio))))
          best = pick(best, buyLeaf(req.line, g, req.need, req.nat, false, req.kind));
      }
      return best;
    }

    // 3. Breed it.
    function breed(req, avail, relaxed, bound, best) {
      const lines = new Set();
      if (req.kind === 'L') lines.add(req.line);
      else {
        for (const p of kinds) if (!p.isDitto && has(avail, p) && compat(req.line, p.line)) lines.add(p.line);
        if ((maxPlain || maxNat) && compat(req.line, req.line)) lines.add(req.line);
      }
      const R = bitsOf(req.need);
      const mySize = size(req);
      const beats = (lb) => !best || (costFirst ? total(lb) <= total(best) : lb.breeds <= best.breeds);
      search: for (const m of lines) {
        const L = lineInfo(m);
        if (!L || L.groups.size === 0) continue;
        const ratio = req.incense ? tSpecies.g : L.ratio; // what hatches: the baby, or the line
        if (req.gender === 'M' && !hasMales(ratio)) continue;
        if (req.gender === 'F' && !hasFemales(ratio)) continue;
        if (req.gender !== 'A' && ratio === 'N') continue;
        // an egg move only hatches onto species that have it as an egg move
        const eggMoves = movesOf(L, req.gender);
        if (req.mv && !tMoves.every((mv) => eggMoves && eggMoves.has(mv))) continue;
        const gCost = genderCost(m, req.gender, ratio);

        // mf: a mother of this line and a father of any line it shares an egg group with; gl: two
        // genderless Pokémon of this line; ditto: one parent
        // of this line and a Ditto.
        const pairings = [];
        if (hasFemales(L.ratio)) pairings.push('mf');
        // Which of two genderless parents passes the ability is unconfirmed, so a goal with an ability
        // uses Ditto for that breed.
        if (L.ratio === 'N' && !req.abil) pairings.push('gl');
        pairings.push('ditto');
        for (const pairing of pairings) {
          const combos = braceCombos(R, req.nat, !!req.incense);
          // Which parent knows the egg moves: either one can pass them on, but Ditto never knows them.
          const mvSides = !req.mv || pairing === 'ditto' ? ['A'] : ['B', 'A'];
          // Which parent wears the costume: the one of this line (A), or a father of this line too (B).
          const cosSides = !req.cos || pairing === 'ditto' ? ['A'] : ['B', 'A'];
          // Your OT carries on the same way (PokeMMO Wiki, Maintaining Original Trainer): from your caught shiny
          // when the egg is its species, so from the parent of this line (A), or a father of this line (B).
          const otSides = !req.ot || pairing === 'ditto' ? ['A'] : ['B', 'A'];
          // Which parent has the ability: the mother (A). A hidden ability can also come from a father of this
          // line (B), as PokeMMO checks species, not gender, for it; a regular one can't.
          const abSides = req.abil && abilityIsHidden && pairing === 'mf' ? ['A', 'B'] : ['A'];
          for (const [bA, bB, holder, inc, fewer] of combos) for (const mvSide of mvSides) for (const cosSide of cosSides) for (const otSide of otSides) for (const abSide of abSides) {
            if (++work > WORK) { calls = LIMIT + 1; truncated = true; }
            if (calls > LIMIT) break search;
            const needA = req.need & ~(bB >= 0 ? 1 << bB : 0);
            const needB = req.need & ~(bA >= 0 ? 1 << bA : 0);
            const reqA = { kind: 'L', line: m, gender: pairing === 'mf' ? 'F' : 'A',
              need: needA, nat: holder === 'A', abil: req.abil && abSide === 'A', mv: req.mv && mvSide === 'A', cos: req.cos && cosSide === 'A', ot: req.ot && otSide === 'A' };
            // A parent that must be as good as this request can't be bred for it (the search would never
            // end). With fewer braces it can still be one you own or buy: two 6x31 parents need no brace.
            // With opts.swap (a second run, when the first finds no plan) a one-stat parent can also come from
            // one you own of the other gender (or another line): bred with anyone, braced, a 31 Atk male gives a
            // 31 Atk female. Every run allowing it made big searches run out of work sooner.
            const asLeaf = (r) => size(r) >= mySize || (fewer && r.need === req.need);
            const leafA = asLeaf(reqA);
            if (leafA && !fewer && (!opts.swap || R.length > 1 || !leaf(reqA, avail))) continue;
            let reqB = null, leafB = false;
            if (pairing !== 'ditto') {
              // a father wearing the costume has to be of this line to pass it on
              // (and so does one with the hidden ability)
              const cosB = req.cos && cosSide === 'B', otB = req.ot && otSide === 'B', abB = req.abil && abSide === 'B';
              reqB = { kind: pairing === 'mf' && !cosB && !otB && !abB ? 'C' : 'L', line: m, gender: pairing === 'mf' ? 'M' : 'A',
                need: needB, nat: holder === 'B', abil: abB, mv: req.mv && mvSide === 'B', cos: cosB, ot: otB };
              leafB = asLeaf(reqB);
              if (leafB && !fewer && (!opts.swap || R.length > 1 || !leaf(reqB, avail))) continue;
            }
            const items = (bA >= 0 ? 1 : 0) + (bB >= 0 ? 1 : 0);
            const stepCost = items * prices.brace + (req.nat ? prices.everstone : 0) + (inc ? prices.incense || 0 : 0) + gCost;
            const solveA = (av, r) => leafA ? leaf(reqA, av) : solve(reqA, av, r);
            const solveB = (av, r) => pairing === 'ditto' ? solveDitto(needB, holder === 'B', av) : leafB ? leaf(reqB, av) : solve(reqB, av, r);
            // The best each side could do with unlimited Pokémon: skip the breed if even that can't win.
            const lbA = relaxed ? null : solveA(full, true);
            const lbB = relaxed ? null : solveB(full, true);
            if (!relaxed && (!lbA || !lbB || !beats(sum(lbA, lbB, stepCost)))) continue;
            // Solve the mother's side first. If the father's side then runs short, or the two together
            // do worse than each could alone (the mother took a Pokémon the father needed), try the
            // other way round.
            for (const order of relaxed ? [0] : [0, 1]) {
              let a, b;
              if (order === 0) {
                a = solveA(avail, relaxed); if (!a) break;
                if (!relaxed && !beats(sum(a, lbB, stepCost))) break;
                b = solveB(relaxed ? avail : avail - a.used, relaxed); if (!b) continue;
              } else {
                b = solveB(avail); if (!b) break;
                if (!beats(sum(lbA, b, stepCost))) break;
                a = solveA(avail - b.used); if (!a) continue;
              }
              const iv = [];
              for (let s = 0; s < 6; s++) iv.push(s === bA ? a.iv[s] : s === bB ? b.iv[s] : Math.min(a.iv[s], b.iv[s]));
              const res = {
                breeds: a.breeds + b.breeds + 1, cost: a.cost + b.cost + stepCost, worth: (a.worth || 0) + (b.worth || 0), value: a.value + b.value,
                used: a.used + b.used, chance: a.chance * (b.chance == null ? 1 : b.chance) * (req.abil ? abilityChance : 1), iv,
                node: { t: 'breed', line: m, gender: req.gender, pairing, a, b, bA, bB, holder,
                  stepCost, gCost, nat: req.nat, abil: req.abil, mv: req.mv, cos: !!req.cos, ot: !!req.ot,
                  // what each parent's spot asks for, so a card can say what else would do there (a parent whose
                  // 31s aren't passed on is only there as a mother, a father or a Ditto)
                  slotA: { need: needA, kind: 'L', gender: reqA.gender, extra: holder === 'A' || reqA.abil || reqA.mv || reqA.cos || reqA.ot },
                  slotB: reqB ? { need: needB, kind: reqB.kind, gender: reqB.gender, extra: holder === 'B' || reqB.abil || reqB.mv || reqB.cos || reqB.ot }
                    : { need: needB, kind: 'L', gender: 'N', ditto: true, extra: holder === 'B' },
                  inc: inc || null, incense: inc ? req.incense : null, baby: inc ? tSpecies.n : null },
              };
              best = pick(best, res);
              // nothing can beat the unlimited pass, so stop once the plan matches it
              if (bound && better(best, bound) <= 0) break search;
              const lb = sum(lbA || a, lbB || b, stepCost);
              if (relaxed || order === 1 || (res.breeds === lb.breeds && res.cost === lb.cost)) break;
            }
          }
        }
      }
      return best;
    }
    const sum = (a, b, step) => ({ breeds: a.breeds + b.breeds + 1, cost: a.cost + b.cost + step, worth: (a.worth || 0) + (b.worth || 0) });

    // Which parent holds which item. Returns [braceA, braceB, everstoneHolder, incenseHolder].
    function braceCombos(R, nat, incense) {
      const out = [];
      if (incense) {
        // the incense takes one parent's slot, leaving the other one item
        for (const inc of ['A', 'B']) {
          const other = inc === 'A' ? 'B' : 'A';
          if (nat) { out.push([-1, -1, other, inc]); continue; }
          for (const b of R) out.push(other === 'A' ? [b, -1, null, inc] : [-1, b, null, inc]);
          out.push([-1, -1, null, inc]);
        }
        return out;
      }
      // The last value marks a breed with fewer braces than usual, kept for parents you own (or buy):
      // a stat both parents already have passes on without a brace.
      if (nat) {
        // the Everstone holder can't hold a brace
        for (const b of R) { out.push([-1, b, 'A']); out.push([b, -1, 'B']); }
        if (R.length === 0) { out.push([-1, -1, 'A']); out.push([-1, -1, 'B']); }
        else { out.push([-1, -1, 'A', null, true]); out.push([-1, -1, 'B', null, true]); }
        return out;
      }
      for (const a of R) for (const b of R) if (a !== b) out.push([a, b, null]);
      if (R.length <= 2) {
        for (const a of R) { out.push([a, -1, null]); out.push([-1, a, null]); }
        if (R.length === 0) out.push([-1, -1, null]);
      } else for (const a of R) { out.push([a, -1, null, null, true]); out.push([-1, a, null, null, true]); }
      if (R.length > 0) out.push([-1, -1, null, null, true]);
      return out;
    }

    // A Pokémon that only exists as one gender (Vespiquen, Gallade, Nidoking, ...) has to hatch as that gender.
    const fixedGender = !tSpecies ? null : tSpecies.g === 'M' || tSpecies.g === 'F' ? tSpecies.g : tSpecies.g === 'N' ? 'A' : null;
    const topReq = { kind: 'L', line: tLine, gender: fixedGender || target.gender || 'A', need: needAll,
      nat: !!target.nature, abil: !!target.ability, mv: tMoves.length > 0, cos: !!tCostume, ot: !!target.ot, incense, top: true };
    let full = 0n;
    for (const c of kinds) full += BigInt(c.members.length) << c.shift;
    let result = solve(topReq, full);
    // Hand out the actual Pokémon to the leaves of the tree. The search can reuse one plan for two
    // parents, so this copies the tree as it goes.
    if (result) {
      const left = new Map(kinds.map((c) => [c, c.members.slice()]));
      result = (function assign(r) {
        const n = r.node;
        if (n.t === 'own') return { ...r, node: { ...n, p: left.get(n.p).shift() } };
        if (n.t === 'breed') return { ...r, node: { ...n, a: assign(n.a), b: assign(n.b) } };
        return { ...r };
      })(result);
    }
    // No plan, and not for lack of search: a box whose 31s are all on the wrong gender (every 31 Atk and every
    // 31 Spe Pawniard male) needs a breed that only changes a parent's gender, so try again allowing those.
    if (!result && !truncated && !opts.swap) {
      const again = plan({ ...input, opts: { ...opts, swap: true, work: opts.work ? Math.max(1, opts.work - work) : opts.work } });
      if (!again.error) return { ...again, calls: calls + again.calls, work: work + again.work };
    }
    return { result, truncated, timedOut, calls, work, tLine, pool };
  }

  // What an egg's IVs can be, by PokeMMO's rule (PokeMMO Wiki, Breeding): exactly three IVs are copied from the
  // parents, each from either parent at even odds, and a braced stat is always one of the three (copied from the
  // parent holding the brace). The other stats get the parents' average, rounded down. So with no brace each stat
  // is the higher parent's IV 25% of the time, the average 50% and the lower 25%; with one brace 20/60/20, with
  // two 12.5/75/12.5. An Everstone is no brace, so it changes nothing here.
  // Two shiny parents follow another rule: of the stats with no brace, two get the higher parent's IV, two the
  // average, and any more are a coin flip between the higher and the lower.
  // a, b: the parents' IVs (numbers 0-31); braceA, braceB: the stat each one's brace is for, or -1.
  // Returns { stats: [{ low, avg, high, odds: Map(iv -> chance) }], chance(want) } where chance gives the odds an
  // egg has at least want[i] in every stat that isn't null.
  function eggOdds(a, b, braceA = -1, braceB = -1, shiny = false) {
    const lo = (i) => Math.min(a[i], b[i]), hi = (i) => Math.max(a[i], b[i]), avg = (i) => Math.floor((a[i] + b[i]) / 2);
    // every equally likely way the egg can come out: [weight, ivs]
    const outcomes = [];
    const braced = new Map();
    if (braceA >= 0) braced.set(braceA, [a[braceA]]);
    if (braceB >= 0) braced.set(braceB, braceB === braceA ? [a[braceB], b[braceB]] : [b[braceB]]); // same brace twice: either one
    const free = [0, 1, 2, 3, 4, 5].filter((i) => !braced.has(i));
    // the braced stats' own possibilities (two values only when both parents brace the same stat)
    const base = [[1, []]];
    for (const [i, vals] of braced) for (const [w, iv] of base.splice(0)) for (const v of vals) { const n = iv.slice(); n[i] = v; base.push([w / vals.length, n]); }
    function subsets(list, k) {
      if (k === 0) return [[]];
      if (list.length < k) return [];
      const [x, ...rest] = list;
      return [...subsets(rest, k - 1).map((s) => [x, ...s]), ...subsets(rest, k)];
    }
    for (const [w0, iv0] of base) {
      if (!shiny) {
        const k = Math.max(0, 3 - braced.size), sets = subsets(free, Math.min(k, free.length));
        for (const S of sets) {
          for (let mask = 0; mask < 1 << S.length; mask++) {
            const iv = iv0.slice();
            for (const i of free) iv[i] = avg(i);
            S.forEach((i, j) => { iv[i] = mask & (1 << j) ? b[i] : a[i]; });
            outcomes.push([w0 / sets.length / (1 << S.length), iv]);
          }
        }
      } else {
        // two highest, two averages, the rest a coin flip
        const maxSets = subsets(free, Math.min(2, free.length));
        for (const M of maxSets) {
          const rest = free.filter((i) => !M.includes(i)), avgSets = subsets(rest, Math.min(2, rest.length));
          for (const A of avgSets) {
            const flip = rest.filter((i) => !A.includes(i));
            for (let mask = 0; mask < 1 << flip.length; mask++) {
              const iv = iv0.slice();
              M.forEach((i) => { iv[i] = hi(i); }); A.forEach((i) => { iv[i] = avg(i); });
              flip.forEach((i, j) => { iv[i] = mask & (1 << j) ? hi(i) : lo(i); });
              outcomes.push([w0 / maxSets.length / avgSets.length / (1 << flip.length), iv]);
            }
          }
        }
      }
    }
    const stats = [0, 1, 2, 3, 4, 5].map((i) => {
      const odds = new Map();
      for (const [w, iv] of outcomes) odds.set(iv[i], (odds.get(iv[i]) || 0) + w);
      const vals = [...odds.keys()];
      return { low: Math.min(...vals), high: Math.max(...vals), avg: avg(i), braced: braced.has(i), odds: new Map([...odds].sort((x, y) => x[0] - y[0])) };
    });
    const chance = (want) => outcomes.reduce((t, [w, iv]) => (want.every((v, i) => v == null || meets(iv[i], v)) ? t + w : t), 0);
    return { stats, chance };
  }

  // Picks at most cap of the scored Pokémon (best first) for the planner, so a box with more than fit still
  // gives it some of every kind it needs. keysOf says what each one brings (say "F1" for a female with the
  // goal's Atk, "Mn" for a male with its nature). Rounds: up to two per key, then four, and so on, best first
  // in each round; after the last round (rounds) the best of the rest. Without this a box of 60 Pawniard could
  // hand it 24 males, or no one with the goal's Speed, and the box looked unable to breed. Returns the chosen
  // ones in the order given.
  function pickDiverse(list, cap, keysOf, rounds = Infinity) {
    if (list.length <= cap) return list.slice();
    const keys = list.map(keysOf), seen = new Map(), chosen = new Set();
    for (let per = 2, r = 0; chosen.size < cap && chosen.size < list.length; per += 2, r++) {
      if (r >= rounds) per = list.length + 1;
      for (let i = 0; i < list.length && chosen.size < cap; i++) {
        if (chosen.has(i) || !keys[i].some((k) => (seen.get(k) || 0) < per)) continue;
        chosen.add(i);
        for (const k of keys[i]) seen.set(k, (seen.get(k) || 0) + 1);
      }
      if (per > list.length) for (let i = 0; i < list.length && chosen.size < cap; i++) chosen.add(i);
    }
    return list.filter((_, i) => chosen.has(i));
  }

  const api = { STATS, BRACES, INCENSE, COSTUMES, buildDex, plan, meets, popcount, bitsOf, eggOdds, pickDiverse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
