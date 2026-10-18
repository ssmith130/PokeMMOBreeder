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
//  - genderless Pokémon only breed with Ditto, and Ditto can't be bred
//  - abilities pass from the mother (or the non-Ditto parent) with a chance
//  - egg moves pass from the father
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
    return { byName, lines, lineOf: (name) => { const s = get(name); return s ? lineName(s) : null; },
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

    const tIV = target.ivs; // per stat: required minimum, or null
    let needAll = 0;
    for (let i = 0; i < 6; i++) if (tIV[i] != null) needAll |= 1 << i;
    const tMoves = target.moves || [];
    // A baby goal that needs an incense: the last breed has a parent hold it, and the egg's gender
    // follows the baby's ratio.
    const tSpecies = dex.byName.get(String(target.species).toLowerCase());
    const incense = dex.incenseOf(target.species) || '';

    const pool = rawPool.map((p, i) => {
      const line = p.isDitto ? 'Ditto' : dex.lineOf(p.species);
      const s = dex.byName.get(String(p.species).toLowerCase());
      let mask = 0;
      for (let s = 0; s < 6; s++) if (tIV[s] != null && p.ivs[s] != null && p.ivs[s] >= tIV[s]) mask |= 1 << s;
      return {
        i, src: p, line, isDitto: !!p.isDitto, gender: p.gender, mask, name: s ? s.n : '',
        // babies can't breed until they evolve, so one only counts if it already is the Pokémon you want
        baby: !p.isDitto && !!s && s.e.includes('Undiscovered'),
        iv: p.ivs.map((v) => (v == null ? 0 : v)),
        natured: !!target.nature && p.nature === target.nature,
        abil: !!target.ability && p.ability === target.ability,
        moves: tMoves.length > 0 && tMoves.every((m) => (p.moves || []).includes(m)),
      };
    }).filter((p) => p.line);
    if (pool.length > 63) return { error: 'The planner handles up to 63 Pokémon at a time.' };
    // Identical Pokémon are interchangeable, so the search tracks how many of each
    // kind are left (6 bits per kind packed in a BigInt, plus a spare bit) instead of which ones.
    const kinds = [];
    const bySig = new Map();
    for (const p of pool) {
      // Only the IVs that meet the goal show in the plan, so the others don't split kinds.
      const ivs = p.iv.map((v, s) => (p.mask & (1 << s) ? v : '')).join(',');
      const sig = [p.line, p.gender, p.mask, p.natured, p.abil, p.moves, ivs, p.baby ? p.name : ''].join('|');
      let c = bySig.get(sig);
      if (!c) { c = { ...p, members: [], shift: BigInt(kinds.length * 7) }; c.bit = 1n << c.shift; bySig.set(sig, c); kinds.push(c); }
      c.members.push(p);
    }
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
    function genderCost(line, g, r = lineInfo(line).ratio) {
      if (g === 'A') return 0;
      if (typeof r !== 'number') return 0; // single-gender or genderless: nothing to pick
      const minority = Math.min(r, 1 - r);
      if (minority >= 0.5) return prices.gender11;
      if (minority >= 0.25) return prices.gender31;
      return prices.gender71;
    }
    const abilityIsHidden = target.abilityHidden;
    const abilityChance = abilityIsHidden ? prices.haChance : prices.abilityChance;

    const better = opts.mode === 'cost'
      ? (a, b) => (a.cost - b.cost) || (a.breeds - b.breeds) || (a.value - b.value)
      : (a, b) => (a.breeds - b.breeds) || (a.cost - b.cost) || (a.value - b.value);
    function pick(a, b) { if (!a) return b; if (!b) return a; return better(b, a) < 0 ? b : a; }

    // A requirement: which line(s), which gender, which stats, nature/ability/egg moves.
    // kind 'L' = exactly this line; kind 'C' = any line that can breed with this line.
    function rank(req) { return (req.kind === 'C' ? 4 : 0) + (req.gender === 'M' ? 2 : req.gender === 'F' ? 1 : 0); }
    // Every request a breed splits into must be smaller, so the search ends. Only the goal needs an
    // incense, so anything without one is smaller than it. Dropping the egg moves (the mother's side)
    // or the ability (the father's side) also counts, so a parent can carry the goal's one IV.
    function size(req) {
      return (req.incense ? 1e6 : 0) + ((popcount(req.need) * 2 + (req.nat ? 1 : 0)) * 4 + (req.mv ? 2 : 0) + (req.abil ? 1 : 0)) * 8 + rank(req);
    }
    function key(req) { return `${req.kind}${req.line}|${req.gender}|${req.need}|${+req.nat}|${+req.abil}|${+req.mv}|${req.incense || ''}|${+!!req.top}`; }

    let calls = 0, truncated = false;
    const LIMIT = opts.limit || 600000;
    // Stop searching after this long and show the best plan found so far.
    const deadline = Date.now() + (opts.timeLimit || 6000);
    const memo = new Map(); // request -> [{avail, best}]
    const dittoMemo = new Map();

    function leafOwned(p) {
      return { breeds: 0, cost: 0, value: popcount(p.mask) + (p.natured ? 1 : 0), used: p.bit, chance: 1,
        iv: p.iv, node: { t: 'own', p } };
    }

    // kind 'L' = must be this line (it passes on the species); 'C' = any line it can breed with.
    function buyLeaf(line, gender, need, nat, ditto, kind) {
      const stat = bitsOf(need)[0];
      const iv = [0, 0, 0, 0, 0, 0];
      if (stat != null) iv[stat] = tIV[stat];
      let cost = ditto ? prices.buyDitto : (nat ? prices.buyNatured : prices.buy);
      return { breeds: 0, cost, value: 0, used: 0n, chance: 1, iv, bought: 1,
        node: { t: 'buy', line, gender, stat, nat, ditto, kind } };
    }

    function solveDitto(need, nat, avail) {
      const k = need + '|' + nat + '|' + avail;
      if (dittoMemo.has(k)) return dittoMemo.get(k);
      let best = null;
      for (const p of kinds) {
        if (!p.isDitto || !has(avail, p)) continue;
        if ((p.mask & need) !== need || (nat && !p.natured)) continue;
        best = pick(best, leafOwned(p));
      }
      if (opts.buy && popcount(need) <= 1 && !nat) best = pick(best, buyLeaf('Ditto', 'N', need, false, true, 'L'));
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
      const bound = relaxed ? null : solve(req, full, true);
      if (!relaxed && !bound) return remember(null);
      if (!relaxed && (++calls > LIMIT || ((calls & 1023) === 0 && Date.now() > deadline))) calls = LIMIT + 1;
      if (!relaxed && calls > LIMIT) { truncated = true; return null; }
      let best = null;

      // 1. A Pokémon you already own.
      for (const p of kinds) {
        if (p.isDitto || !has(avail, p)) continue;
        if (!lineOk(req, p.line)) continue;
        if (req.gender !== 'A' && p.gender !== req.gender) continue;
        if ((p.mask & req.need) !== req.need) continue;
        if (req.nat && !p.natured) continue;
        if (req.abil && !p.abil) continue;
        if (req.mv && !p.moves) continue;
        if (p.baby && !req.top) continue;
        if (req.incense && p.name !== tSpecies.n) continue;
        best = pick(best, leafOwned(p));
      }

      // Nothing beats a Pokémon you already have.
      if (best) return remember(best);

      // 2. Buy a 1x31 off the GTL to fill a gap.
      if (opts.buy && popcount(req.need) <= 1 && !req.abil && !req.mv && !req.incense) {
        const L = lineInfo(req.line);
        const g = req.gender;
        if (L && L.groups.size && (g === 'A' || (g === 'M' ? hasMales(L.ratio) : hasFemales(L.ratio))))
          best = pick(best, buyLeaf(req.line, g, req.need, req.nat, false, req.kind));
      }

      // 3. Breed it.
      const lines = new Set();
      if (req.kind === 'L') lines.add(req.line);
      else {
        for (const p of kinds) if (!p.isDitto && has(avail, p) && compat(req.line, p.line)) lines.add(p.line);
        if (opts.buy && compat(req.line, req.line)) lines.add(req.line);
      }
      const R = bitsOf(req.need);
      const mySize = size(req);
      const beats = (lb) => !best || (opts.mode === 'cost' ? lb.cost <= best.cost : lb.breeds <= best.breeds);
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

        const pairings = [];
        if (hasFemales(L.ratio)) pairings.push('mf');
        pairings.push('ditto');
        for (const pairing of pairings) {
          const combos = braceCombos(R, req.nat, !!req.incense);
          for (const [bA, bB, holder, inc] of combos) {
            const needA = req.need & ~(bB >= 0 ? 1 << bB : 0);
            const needB = req.need & ~(bA >= 0 ? 1 << bA : 0);
            const reqA = { kind: 'L', line: m, gender: pairing === 'mf' ? 'F' : (req.mv ? 'M' : 'A'),
              need: needA, nat: holder === 'A', abil: req.abil, mv: pairing === 'ditto' && req.mv };
            if (size(reqA) >= mySize) continue;
            let reqB = null;
            if (pairing === 'mf') {
              reqB = { kind: 'C', line: m, gender: 'M', need: needB, nat: holder === 'B', abil: false, mv: req.mv };
              if (size(reqB) >= mySize) continue;
            }
            const items = (bA >= 0 ? 1 : 0) + (bB >= 0 ? 1 : 0);
            const stepCost = items * prices.brace + (req.nat ? prices.everstone : 0) + (inc ? prices.incense || 0 : 0) + gCost;
            const solveB = (av, r) => pairing === 'mf' ? solve(reqB, av, r) : solveDitto(needB, holder === 'B', av);
            // The best each side could do with unlimited Pokémon: skip the breed if even that can't win.
            const lbA = relaxed ? null : solve(reqA, full, true);
            const lbB = relaxed ? null : solveB(full, true);
            if (!relaxed && (!lbA || !lbB || !beats(sum(lbA, lbB, stepCost)))) continue;
            // Solve the mother's side first; only if the father's side then runs
            // short, try the other way round.
            for (const order of relaxed ? [0] : [0, 1]) {
              let a, b;
              if (order === 0) {
                a = solve(reqA, avail, relaxed); if (!a) break;
                if (!relaxed && !beats(sum(a, lbB, stepCost))) break;
                b = solveB(relaxed ? avail : avail - a.used, relaxed); if (!b) continue;
              } else {
                b = solveB(avail); if (!b) break;
                if (!beats(sum(lbA, b, stepCost))) break;
                a = solve(reqA, avail - b.used); if (!a) continue;
              }
              const iv = [];
              for (let s = 0; s < 6; s++) iv.push(s === bA ? a.iv[s] : s === bB ? b.iv[s] : Math.min(a.iv[s], b.iv[s]));
              const res = {
                breeds: a.breeds + b.breeds + 1, cost: a.cost + b.cost + stepCost, value: a.value + b.value,
                used: a.used + b.used, chance: a.chance * (req.abil ? abilityChance : 1), iv,
                node: { t: 'breed', line: m, gender: req.gender, pairing, a, b, bA, bB, holder,
                  stepCost, gCost, nat: req.nat, abil: req.abil, mv: req.mv,
                  inc: inc || null, incense: inc ? req.incense : null, baby: inc ? tSpecies.n : null },
              };
              best = pick(best, res);
              // nothing can beat the unlimited pass, so stop once the plan matches it
              if (bound && better(best, bound) <= 0) break search;
              break;
            }
          }
        }
      }
      return remember(best);
    }
    const sum = (a, b, step) => ({ breeds: a.breeds + b.breeds + 1, cost: a.cost + b.cost + step });

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
      if (nat) {
        // the Everstone holder can't hold a brace
        for (const b of R) { out.push([-1, b, 'A']); out.push([b, -1, 'B']); }
        if (R.length === 0) { out.push([-1, -1, 'A']); out.push([-1, -1, 'B']); }
        return out;
      }
      for (const a of R) for (const b of R) if (a !== b) out.push([a, b, null]);
      if (R.length <= 2) {
        for (const a of R) { out.push([a, -1, null]); out.push([-1, a, null]); }
        if (R.length === 0) out.push([-1, -1, null]);
      }
      return out;
    }

    // A Pokémon that only exists as one gender (Vespiquen, Gallade, Nidoking, ...) has to hatch as that gender.
    const fixedGender = !tSpecies ? null : tSpecies.g === 'M' || tSpecies.g === 'F' ? tSpecies.g : tSpecies.g === 'N' ? 'A' : null;
    const topReq = { kind: 'L', line: tLine, gender: fixedGender || target.gender || 'A', need: needAll,
      nat: !!target.nature, abil: !!target.ability, mv: tMoves.length > 0, incense, top: true };
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
    return { result, truncated, calls, tLine, pool };
  }

  const api = { STATS, BRACES, INCENSE, buildDex, plan, popcount, bitsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
