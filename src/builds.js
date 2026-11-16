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

  // The line's last stages: the members with the highest base stat total (Eevee has seven).
  function finals(dex, line) {
    const members = [...dex.byName.values()].filter((s) => s.s && dex.lineOf(s.n) === line);
    const bst = (s) => s.s.reduce((a, b) => a + b, 0);
    const top = Math.max(...members.map(bst));
    return members.filter((s) => bst(s) === top);
  }
  // Which roles a line is built for. A line whose evolutions differ (Eevee, Ralts) can have several.
  function rolesOf(dex, line) {
    const roles = new Map(); // role -> the final species it's for
    for (const s of finals(dex, line)) {
      const b = s.s, atk = b[ATK], spa = b[SPA];
      const add = (r) => { if (!roles.has(r)) roles.set(r, []); roles.get(r).push(s.n); };
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
    const f = finals(dex, line)[0], b = f ? f.s : [1, 1, 1, 1, 1, 1];
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
  // mons: [{species, gender, ivs, nature, ability, boxId}]
  function poolFor(dex, line, goal, nature, mons, cap) {
    const L = dex.lines.get(line);
    const scored = [];
    for (const m of mons) {
      const s = dex.byName.get(String(m.species).toLowerCase());
      if (!s) continue;
      const ditto = s.n === 'Ditto', ml = ditto ? 'Ditto' : dex.lineOf(s.n), M = dex.lines.get(ml);
      if (!ditto && (!M || s.e.includes('Undiscovered'))) continue; // babies can't breed yet
      const same = ml === line;
      if (!ditto && !same && ![...M.groups].some((g) => L.groups.has(g))) continue;
      let score = same ? 3 : ditto ? 2 : 1, hits = 0;
      m.ivs.forEach((v, i) => { if (goal[i] != null && v != null && v >= goal[i]) { hits++; score += 4; } });
      if (nature && m.nature === nature) { hits++; score += 6; } // worth more than one IV: only an owned one saves buying it
      // A Pokémon with nothing the goal needs only helps as the species' mother (or its only partner).
      if (!hits && !same) continue;
      scored.push([score, m]);
    }
    scored.sort((x, y) => y[0] - x[0]);
    return scored.slice(0, cap || 63).map((x) => ({ species: x[1].species, isDitto: x[1].species === 'Ditto', gender: x[1].species === 'Ditto' ? 'N' : x[1].gender,
      ivs: x[1].ivs.slice(), nature: x[1].nature || '', ability: x[1].ability || '', moves: [], boxId: x[1].boxId }));
  }

  // A quick check before the planner runs: something in the pool has each IV the goal needs (and the
  // nature), and there's a Pokémon of the line itself. When buying is allowed a 1×31 fills any one gap.
  function missing(dex, line, goal, nature, pool, buy) {
    const gaps = [];
    goal.forEach((v, i) => { if (v != null && !pool.some((p) => p.ivs[i] != null && p.ivs[i] >= v)) gaps.push(i); });
    const noNature = !!nature && !pool.some((p) => p.nature === nature);
    const noLine = !pool.some((p) => !p.isDitto && dex.lineOf(p.species) === line);
    return { gaps, noNature, noLine, blocked: !buy && (gaps.length > 0 || noNature || noLine) };
  }

  // One short planner run. A plan found before the time runs out means yes (maybe not the fewest
  // breeds: the planner tab looks longer); no plan and time to spare means no; no plan in time, maybe.
  function tryGoal(dex, line, goal, nature, mons, prices, opts) {
    const pool = poolFor(dex, line, goal, nature, mons, opts.cap || 24);
    const miss = missing(dex, line, goal, nature, pool, opts.buy);
    if (miss.blocked) return { ok: false, miss, ms: 0 };
    const t0 = Date.now();
    const out = Planner.plan({ dex, prices, pool,
      target: { species: line, ivs: goal.slice(), gender: 'A', nature: nature || '', ability: '', abilityHidden: false, moves: [] },
      opts: { mode: opts.mode || 'breeds', buy: !!opts.buy, timeLimit: opts.timeLimit || 250 } });
    const ms = Date.now() - t0;
    if (!out.result) return { ok: false, miss, ms, slow: !!out.truncated };
    const r = out.result, uses = [], buys = [];
    (function walk(x) {
      const n = x.node;
      if (n.t === 'own') uses.push(n.p.src.boxId);
      else if (n.t === 'buy') buys.push(n.ditto ? 'Ditto' : n.line);
      else if (n.t === 'breed') { walk(n.a); walk(n.b); }
    })(r);
    return { ok: true, ms, breeds: r.breeds, cost: r.cost, uses, buys, rough: !!out.truncated };
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
    const attempt = (goal, nature) => {
      const k = goal.join() + nature;
      if (!tried.has(k)) { const r = tryGoal(dex, line, goal, nature, mons, prices, opts); stats.ms += r.ms; stats.runs += r.ms ? 1 : 0; tried.set(k, r); }
      return tried.get(k);
    };
    for (const [role, forSpecies] of rolesOf(dex, line)) {
      const rungs = ladder(dex, line, role);
      const [k, res, fail] = climb(rungs, '', attempt);
      const next = fail && { at: fail.at, label: rungs[fail.at].label, ivs: rungs[fail.at].ivs,
        gaps: fail.res.miss.gaps.map((i) => LABEL[i]), noLine: fail.res.miss.noLine, slow: !!fail.res.slow };
      if (k < 0) { if (next && !next.noLine) out.push({ line, role, roleLabel: ROLE_LABEL[role], forSpecies, rung: -1, of: rungs.length, next }); continue; }
      const sug = { line, role, roleLabel: ROLE_LABEL[role], forSpecies, rung: k, of: rungs.length, label: rungs[k].label,
        ivs: rungs[k].ivs, nature: '', ...res, next };
      out.push(sug);
      // The same build with a nature you have, passed down with an Everstone.
      const owned = new Set(poolFor(dex, line, rungs[k].ivs, '', mons, 63).map((p) => p.nature));
      for (const nat of NATURES[role].filter((n) => owned.has(n))) {
        const r = attempt(rungs[k].ivs, nat);
        if (r.ok) { out.push({ ...sug, ...r, nature: nat, next: null }); break; }
      }
    }
    // A line built both ways can land on the same goal (6×31) twice: keep one, for both roles.
    const kept = [];
    for (const s of out) {
      const twin = s.ivs && kept.find((k) => k.ivs && k.ivs.join() === s.ivs.join() && k.nature === s.nature);
      if (twin) { twin.roleLabel = twin.role === 'wall' || s.role === 'wall' ? 'Attacker or wall' : 'Any attacker'; twin.forSpecies = [...new Set([...twin.forSpecies, ...s.forSpecies])]; continue; }
      if (s.rung < 0 && kept.some((k) => k.rung < 0)) continue;
      kept.push(s);
    }
    kept.forEach((s) => { s.scan = stats; s.goalText = s.ivs ? goalText(s.ivs) : ''; });
    return kept;
  }

  // One goal with the nature the player picked. If the boxes can't make it, try again with GTL 1×31s
  // allowed, so the card can say what it would take (a 1×31 with that nature, usually).
  function checkGoal(dex, line, goal, nature, mons, prices, opts = {}) {
    opts = { ...opts, timeLimit: opts.timeLimit || 1500 }; // one goal the player asked about, so it gets longer
    const r = tryGoal(dex, line, goal, nature, mons, prices, opts);
    if (r.ok || opts.buy) return { ...r, miss: undefined };
    const b = tryGoal(dex, line, goal, nature, mons, prices, { ...opts, buy: true });
    return b.ok ? { ...b, bought: true } : { ok: false, slow: !!(r.slow || b.slow) };
  }

  // The lines worth scanning: every breeding line with a Pokémon in the boxes (not counting Ditto or babies).
  function linesIn(dex, mons) {
    const seen = new Map();
    for (const m of mons) {
      const s = dex.byName.get(String(m.species).toLowerCase());
      if (!s || s.n === 'Ditto' || s.e.includes('Undiscovered')) continue;
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

  const api = { rolesOf, ladder, poolFor, scanLine, checkGoal, linesIn, rank, goalText, ROLE_LABEL, ROLE_NATURES: NATURES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Builds = api;
})(typeof window !== 'undefined' ? window : globalThis);
