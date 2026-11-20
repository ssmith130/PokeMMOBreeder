// Build center: which builds can you breed from the Pokémon in your boxes?
// For each breeding line in the boxes it climbs a ladder of IV goals, easiest first, and asks the
// planner (planner.js) whether the boxes can make each one. Every rung asks for everything the rung
// below did and more, so the climb stops at the first rung the boxes can't make.
// Physical or special comes from the base stats of the line's fully evolved Pokémon (species.json s).
(function (root) {
  const Planner = root.Planner || (typeof require !== 'undefined' ? require('./planner.js') : null);
  const HP = 0, ATK = 1, DEF = 2, SPA = 3, SPD = 4, SPE = 5;
  const LABEL = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
  // Natures worth breeding in for each role (the Everstone version of the top rung).
  const NATURES = { phys: ['Adamant', 'Jolly'], spec: ['Modest', 'Timid'], wall: ['Bold', 'Calm', 'Impish', 'Careful'] };
  const ROLE_LABEL = { phys: 'Physical attacker', spec: 'Special attacker', wall: 'Defensive' };
  // Bump when the suggestions change for the same box (rules, ladders, the work cap), so answers the
  // page remembered from an older version are checked again.
  const VERSION = 5;
  // How much searching each check gets: a fixed amount of work rather than a time limit, so the same box
  // gives the same answer on every computer and every run. About a quarter to half a second on a laptop,
  // one to two seconds on a phone. The clock is only there to stop a runaway check.
  const WORK = 1500000, CHECK_WORK = 6000000;
  // Abilities that change which attacking stat counts: Huge Power and Pure Power double Attack, which is
  // why Azumarill and Medicham are physical attackers whatever their base stats say.
  const ABILITY_BOOST = { 'Huge Power': [ATK, 2], 'Pure Power': [ATK, 2] };
  function boosted(s) {
    const b = s.s.slice();
    for (const a of [...(s.a || []), s.h]) if (ABILITY_BOOST[a]) { b[ABILITY_BOOST[a][0]] *= ABILITY_BOOST[a][1]; return [b, a]; }
    return [b, ''];
  }

  // The line's last stages: the members with the highest base stat total (Eevee has seven).
  function finals(dex, line) {
    const members = [...dex.byName.values()].filter((s) => s.s && dex.lineOf(s.n) === line);
    const bst = (s) => s.s.reduce((a, b) => a + b, 0);
    const top = Math.max(...members.map(bst));
    return members.filter((s) => bst(s) === top);
  }
  // Which roles a line is built for. A line whose evolutions differ (Eevee, Ralts) can have several.
  // Each role's list of species also says which ability decided it (.ability), if one did.
  function rolesOf(dex, line) {
    const roles = new Map(); // role -> the final species it's for
    for (const s of finals(dex, line)) {
      const [b, ability] = boosted(s), atk = b[ATK], spa = b[SPA];
      const add = (r) => {
        if (!roles.has(r)) roles.set(r, Object.assign([], { ability: '' }));
        roles.get(r).push(s.n);
        if (ability && r === 'phys') roles.get(r).ability = ability;
      };
      // Every line gets the ladder of its better attacking stat (both when they're close). Walls, with a
      // defence well above either attacking stat (Blissey, Skarmory, Steelix), get a defensive one too.
      if (atk >= spa * 0.9) add('phys');
      if (spa >= atk * 0.9) add('spec');
      if (Math.max(b[DEF], b[SPD]) >= 1.6 * Math.max(atk, spa)) add('wall');
    }
    return roles;
  }
  const ivs = (pairs) => { const a = [null, null, null, null, null, null]; for (const [s, v] of pairs) a[s] = v; return a; };
  // The rungs for one role, easiest first. Each one needs everything the one before it needs.
  function ladder(dex, line, role) {
    const f = finals(dex, line)[0], b = f ? boosted(f)[0] : [1, 1, 1, 1, 1, 1];
    const bulk = b[DEF] >= b[SPD] ? DEF : SPD, other = bulk === DEF ? SPD : DEF;
    if (role === 'wall') {
      return [
        { label: `HP and ${LABEL[bulk]}`, ivs: ivs([[HP, 31], [bulk, 31]]) },
        { label: 'HP, Def and SpD', ivs: ivs([[HP, 31], [DEF, 31], [SPD, 31]]) },
        { label: '4×31, no attacking stats', ivs: ivs([[HP, 31], [DEF, 31], [SPD, 31], [SPE, 31]]) },
        { label: `5×31, no ${b[ATK] >= b[SPA] ? 'SpA' : 'Atk'}`, ivs: ivs([[HP, 31], [b[ATK] >= b[SPA] ? ATK : SPA, 31], [DEF, 31], [SPD, 31], [SPE, 31]]) },
        { label: '6×31', ivs: [31, 31, 31, 31, 31, 31] },
      ];
    }
    const a = role === 'phys' ? ATK : SPA, off = role === 'phys' ? SPA : ATK;
    return [
      { label: `${LABEL[a]} and Spe`, ivs: ivs([[a, 31], [SPE, 31]]) },
      { label: `HP, ${LABEL[a]} and Spe`, ivs: ivs([[HP, 31], [a, 31], [SPE, 31]]) },
      { label: `HP, ${LABEL[a]} and Spe, 25+ Def and SpD`, ivs: ivs([[HP, 31], [a, 31], [SPE, 31], [DEF, 25], [SPD, 25]]) },
      { label: `4×31 with ${LABEL[bulk]}, 25+ ${LABEL[other]}`, ivs: ivs([[HP, 31], [a, 31], [SPE, 31], [bulk, 31], [other, 25]]) },
      { label: `5×31, no ${LABEL[off]}`, ivs: ivs([[HP, 31], [a, 31], [DEF, 31], [SPD, 31], [SPE, 31]]) },
      { label: '6×31', ivs: [31, 31, 31, 31, 31, 31] },
    ];
  }
  const goalText = (g) => g.map((v, i) => (v == null ? null : `${v === 31 ? '' : v + '+ '}${LABEL[i]}`)).filter(Boolean).join(' / ');

  // The box Pokémon that can take part in breeding this line, best for the goal first, at most 63.
  // mons: [{species, gender, ivs, nature, ability, moves, boxId}]; ability and moves are the goal's, if any.
  function poolFor(dex, line, goal, nature, mons, cap, ability, moves) {
    const L = dex.lines.get(line);
    const want = moves && moves.length ? moves : null;
    const scored = [];
    for (const m of mons) {
      const s = dex.byName.get(String(m.species).toLowerCase());
      if (!s) continue;
      const ditto = s.n === 'Ditto', ml = ditto ? 'Ditto' : dex.lineOf(s.n), M = dex.lines.get(ml);
      if (!ditto && (!M || (s.e.includes('Undiscovered') && !dex.evolveInto(s.n)))) continue; // babies count once evolved
      const same = ml === line;
      if (!ditto && !same && ![...M.groups].some((g) => L.groups.has(g))) continue;
      let score = same ? 3 : ditto ? 2 : 1, hits = 0;
      m.ivs.forEach((v, i) => { if (goal[i] != null && v != null && v >= goal[i]) { hits++; score += 4; } });
      if (nature && m.nature === nature) { hits++; score += 6; } // worth more than one IV: only an owned one saves buying it
      // the goal's ability (from its own line) or egg moves: without them in the pool there's no plan at all
      if (ability && same && m.ability === ability) { hits++; score += 8; }
      if (want && !ditto && want.every((mv) => knows(m, mv))) { hits++; score += 8; }
      // A Pokémon with nothing the goal needs only helps as the species' mother (or its only partner).
      if (!hits && !same) continue;
      scored.push([score, m]);
    }
    scored.sort((x, y) => y[0] - x[0]);
    return scored.slice(0, cap || 63).map((x) => ({ species: x[1].species, isDitto: x[1].species === 'Ditto', gender: x[1].species === 'Ditto' ? 'N' : x[1].gender,
      ivs: x[1].ivs.slice(), nature: x[1].nature || '', ability: x[1].ability || '', moves: want ? want.filter((mv) => knows(x[1], mv)) : [], boxId: x[1].boxId }));
  }
  const knows = (m, mv) => (m.moves || []).some((x) => String(x).toLowerCase() === mv.toLowerCase());

  // The line's hidden ability (from the species the line is named after).
  function hiddenOf(dex, line) { const s = dex.byName.get(line.toLowerCase()); return (s && s.h) || ''; }
  // What the boxes can add to a build of this line: the hidden ability, when a Pokémon of the line has it, and
  // the line's egg moves that a Pokémon able to breed with it knows (most known first).
  function extrasFor(dex, line, mons) {
    const L = dex.lines.get(line), ha = hiddenOf(dex, line), count = new Map();
    const egg = new Map([...(L.moves || []), ...(L.movesM || [])].map((mv) => [mv.toLowerCase(), mv]));
    let hasHa = false;
    for (const m of mons) {
      const s = dex.byName.get(String(m.species).toLowerCase());
      if (!s || s.n === 'Ditto') continue;
      const ml = dex.lineOf(s.n), M = dex.lines.get(ml);
      if (ml === line && ha && m.ability === ha) hasHa = true;
      if (!M || (ml !== line && ![...M.groups].some((g) => L.groups.has(g)))) continue;
      for (const mv of new Set((m.moves || []).map((x) => String(x).toLowerCase()))) if (egg.has(mv)) count.set(egg.get(mv), (count.get(egg.get(mv)) || 0) + 1);
    }
    return { ha: hasHa ? ha : '', moves: [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0]) };
  }

  // A quick check before the planner runs: something in the pool has each IV the goal needs (and the
  // nature), and there's a Pokémon of the line itself. When buying is allowed a 1×31 fills any one gap.
  function missing(dex, line, goal, nature, pool, buy, ability, moves) {
    const gaps = [];
    goal.forEach((v, i) => { if (v != null && !pool.some((p) => p.ivs[i] != null && p.ivs[i] >= v)) gaps.push(i); });
    const noNature = !!nature && !pool.some((p) => p.nature === nature);
    const noLine = !pool.some((p) => !p.isDitto && dex.lineOf(p.species) === line);
    // an ability or egg move can't be bought, so these block even with buying allowed
    const noExtra = (!!ability && !pool.some((p) => p.ability === ability && dex.lineOf(p.species) === line))
      || (!!(moves && moves.length) && !pool.some((p) => moves.every((mv) => p.moves.includes(mv))));
    return { gaps, noNature, noLine, blocked: noExtra || (!buy && (gaps.length > 0 || noNature || noLine)) };
  }

  // One short planner run. A plan found before the time runs out means yes (maybe not the fewest
  // breeds: the planner tab looks longer); no plan and time to spare means no; no plan in time, maybe.
  function tryGoal(dex, line, goal, nature, mons, prices, opts, ability = '', moves = []) {
    const pool = poolFor(dex, line, goal, nature, mons, opts.cap || 24, ability, moves);
    const miss = missing(dex, line, goal, nature, pool, opts.buy, ability, moves);
    if (miss.blocked) return { ok: false, miss, ms: 0 };
    const t0 = Date.now();
    const out = Planner.plan({ dex, prices, pool,
      target: { species: line, ivs: goal.slice(), gender: 'A', nature: nature || '', ability, abilityHidden: !!ability && ability === hiddenOf(dex, line), moves: moves.slice() },
      opts: { mode: opts.mode || 'breeds', buy: !!opts.buy, work: opts.work || WORK, timeLimit: opts.timeLimit || 10000 } });
    const ms = Date.now() - t0;
    if (!out.result) return { ok: false, miss, ms, slow: !!out.truncated };
    const r = out.result, uses = [], buys = [];
    (function walk(x) {
      const n = x.node;
      if (n.t === 'own') uses.push(n.p.src.boxId);
      else if (n.t === 'buy') buys.push(n.ditto ? 'Ditto' : n.line);
      else if (n.t === 'breed') { walk(n.a); walk(n.b); }
    })(r);
    return { ok: true, ms, breeds: r.breeds, cost: r.cost, chance: r.chance, uses, buys, rough: !!out.truncated };
  }
  // The highest rung the boxes can make, found by halving (the rungs are nested, so the answers go
  // yes, yes, ..., no, no). Returns [rung, result, the first rung that failed and why].
  function climb(rungs, nature, attempt) {
    let lo = -1, hi = rungs.length, best = null;
    const test = (k) => attempt(rungs[k].ivs, nature);
    // Start at the bottom: most boxes can't make the hard rungs, and those are the slow ones to rule out.
    while (hi - lo > 1) {
      const k = lo === -1 ? 0 : Math.floor((lo + hi) / 2);
      const r = test(k);
      if (r.ok) { lo = k; best = r; } else hi = k;
    }
    return [lo, best, hi < rungs.length ? { at: hi, res: test(hi) } : null];
  }

  // Every suggestion for one line: per role, the highest rung the boxes can make, the Everstone
  // version of it when a fitting nature is in the boxes, and what the next rung up is missing.
  function scanLine(dex, line, mons, prices, opts = {}) {
    const L = dex.lines.get(line);
    if (!L || !L.groups.size || line === 'Ditto') return [];
    const out = [], stats = { ms: 0, runs: 0 }, tried = new Map();
    // Both roles of a line share goals (6×31), so each goal is only checked once.
    const attempt = (goal, nature, ability = '', moves = []) => {
      const k = [goal.join(), nature, ability, moves.join('+')].join('|');
      if (!tried.has(k)) { const r = tryGoal(dex, line, goal, nature, mons, prices, opts, ability, moves); stats.ms += r.ms; stats.runs += r.ms ? 1 : 0; tried.set(k, r); }
      return tried.get(k);
    };
    const extra = extrasFor(dex, line, mons);
    for (const [role, forSpecies] of rolesOf(dex, line)) {
      const rungs = ladder(dex, line, role);
      const [k, res, fail] = climb(rungs, '', attempt);
      const next = fail && { at: fail.at, label: rungs[fail.at].label, ivs: rungs[fail.at].ivs,
        gaps: fail.res.miss.gaps.map((i) => LABEL[i]), noLine: fail.res.miss.noLine, slow: !!fail.res.slow };
      if (k < 0) { if (next && !next.noLine) out.push({ line, role, roleLabel: ROLE_LABEL[role], forSpecies, ability: forSpecies.ability || '', rung: -1, of: rungs.length, next }); continue; }
      const sug = { line, role, roleLabel: ROLE_LABEL[role], forSpecies, ability: forSpecies.ability || '', rung: k, of: rungs.length, label: rungs[k].label,
        ivs: rungs[k].ivs, nature: '', abil: '', move: '', ...res, next };
      out.push(sug);
      // The same build with a nature you have, passed down with an Everstone.
      const owned = new Set(poolFor(dex, line, rungs[k].ivs, '', mons, 63).map((p) => p.nature));
      for (const nat of NATURES[role].filter((n) => owned.has(n))) {
        const r = attempt(rungs[k].ivs, nat);
        if (r.ok) { out.push({ ...sug, ...r, nature: nat, next: null }); break; }
      }
      // The hidden-ability version when a Pokémon of the line has it, and egg-move versions for the egg moves
      // the boxes can pass on (the two most known; any other can be picked on the card).
      const natOk = out.find((x) => x !== sug && x.role === role && x.nature), goal = rungs[k].ivs;
      let haOk = '', mvOk = '';
      if (extra.ha) { const r = attempt(goal, '', extra.ha); if (r.ok) { haOk = extra.ha; out.push({ ...sug, ...r, abil: haOk, next: null }); } }
      for (const mv of extra.moves.slice(0, 2)) { const r = attempt(goal, '', '', [mv]); if (r.ok) { mvOk = mvOk || mv; out.push({ ...sug, ...r, move: mv, next: null }); } }
      // The card starts on everything that worked on its own, together, if that works too (else without the
      // nature, else the egg move or hidden ability alone). That one is marked best.
      const nat = natOk ? natOk.nature : '', tries = [[nat, haOk, mvOk], ['', haOk, mvOk]];
      if ([nat, haOk, mvOk].filter(Boolean).length > 1) {
        for (const [n, a, m] of tries) {
          if ([n, a, m].filter(Boolean).length < 2) continue;
          const r = attempt(goal, n, a, m ? [m] : []);
          if (r.ok) { out.push({ ...sug, ...r, nature: n, abil: a, move: m, next: null, best: true }); break; }
        }
      }
      if (!out.some((x) => x.role === role && x.best)) {
        const one = out.find((x) => x.role === role && x !== sug && x.move) || out.find((x) => x.role === role && x !== sug && x.abil) || natOk;
        if (one) one.best = true;
      }
    }
    // A line built both ways can land on the same goal (6×31) twice: keep one, for both roles.
    const kept = [];
    for (const s of out) {
      const twin = s.ivs && kept.find((k) => k.ivs && k.ivs.join() === s.ivs.join() && k.nature === s.nature && k.abil === s.abil && k.move === s.move);
      if (twin) { twin.roleLabel = twin.role === 'wall' || s.role === 'wall' ? 'Attacker or wall' : 'Any attacker'; twin.forSpecies = [...new Set([...twin.forSpecies, ...s.forSpecies])]; twin.ability = twin.ability || s.ability; continue; }
      if (s.rung < 0 && kept.some((k) => k.rung < 0)) continue;
      kept.push(s);
    }
    kept.forEach((s) => { s.scan = stats; s.goalText = s.ivs ? goalText(s.ivs) : ''; s.ha = hiddenOf(dex, line); s.eggMoves = extra.moves; s.hasHa = !!extra.ha; });
    return kept;
  }

  // One goal with the nature the player picked. If the boxes can't make it, try again with GTL 1×31s
  // allowed, so the card can say what it would take (a 1×31 with that nature, usually).
  function checkGoal(dex, line, goal, nature, mons, prices, opts = {}, ability = '', moves = []) {
    opts = { ...opts, work: opts.work || CHECK_WORK, timeLimit: opts.timeLimit || 20000 }; // one goal the player asked about, so it gets longer
    const r = tryGoal(dex, line, goal, nature, mons, prices, opts, ability, moves);
    if (r.ok || opts.buy || !nature) return { ...r, miss: undefined };
    const b = tryGoal(dex, line, goal, nature, mons, prices, { ...opts, buy: true }, ability, moves);
    return b.ok ? { ...b, bought: true } : { ok: false, slow: !!(r.slow || b.slow) };
  }

  // The lines worth scanning: every breeding line with a Pokémon in the boxes (not counting Ditto; a baby
  // counts for its line, since it breeds once evolved).
  function linesIn(dex, mons) {
    const seen = new Map();
    for (const m of mons) {
      const s = dex.byName.get(String(m.species).toLowerCase());
      if (!s || s.n === 'Ditto' || (s.e.includes('Undiscovered') && !dex.evolveInto(s.n))) continue;
      const line = dex.lineOf(s.n), L = dex.lines.get(line);
      if (!L || !L.groups.size) continue;
      seen.set(line, (seen.get(line) || 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  // Best first: the highest rung, then fewest breeds, then the cheapest.
  function rank(a, b) {
    const fa = a.rung < 0 ? -1 : a.rung / Math.max(1, a.of - 1), fb = b.rung < 0 ? -1 : b.rung / Math.max(1, b.of - 1);
    return (fb - fa) || ((a.breeds || 0) - (b.breeds || 0)) || ((a.cost || 0) - (b.cost || 0)) || (a.nature ? 1 : 0) - (b.nature ? 1 : 0);
  }

  const api = { VERSION, rolesOf, ladder, poolFor, scanLine, checkGoal, linesIn, rank, goalText, hiddenOf, extrasFor, ROLE_LABEL, ROLE_NATURES: NATURES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Builds = api;
})(typeof window !== 'undefined' ? window : globalThis);
