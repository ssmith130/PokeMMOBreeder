// Checks the seasonal event builds in data/events.json against the species data: node test/events.test.js
const assert = require('assert');
const Planner = require('../src/planner.js');
const species = require('../data/species.json');
const { event, raids, sets } = require('../data/events.json');
const dex = Planner.buildDex(species);
const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const STATS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
const by = new Map(species.map((s) => [s.n, s]));
let failed = 0;
const check = (what, fn) => { try { fn(); } catch (e) { failed++; console.log(`FAIL ${what}: ${e.message}`); } };
check('event', () => {
  assert.strictEqual(typeof event.on, 'boolean', 'event.on: true or false');
  assert.ok(event.key && event.name && event.label, 'event needs key, name and label');
  assert.ok(Array.isArray(event.rules) && Array.isArray(event.sources), 'event.rules and event.sources are lists');
});
const raidKeys = new Set();
for (const r of raids) check(`raid ${r.key}`, () => {
  assert.ok(/^[a-z0-9-]+$/.test(r.key) && !raidKeys.has(r.key), 'raid key: unique, lower case'); raidKeys.add(r.key);
  assert.ok(r.name && r.stars && r.plan && r.type && r.phases, 'raid needs name, stars, type, phases and plan');
  assert.ok(by.has(r.name), `raid boss ${r.name} isn't a species (its chip shows its icon)`);
});
const keys = new Set();
for (const p of sets) check(p.key, () => {
  assert.ok(/^[a-z0-9-]+$/.test(p.key), 'key: lower case letters, digits and -');
  assert.ok(p.key.startsWith(event.key + '-'), `key should start with ${event.key}-`);
  assert.ok(!keys.has(p.key), 'key used twice'); keys.add(p.key);
  const s = by.get(p.species);
  assert.ok(s, `unknown species ${p.species}`);
  assert.ok(p.name && p.role, 'needs a name and role');
  assert.ok(Array.isArray(p.raids) && p.raids.length, 'raids: at least one');
  for (const k of p.raids) assert.ok(raidKeys.has(k), `unknown raid ${k}`);
  assert.ok(!p.nature || NATURES.includes(p.nature), `unknown nature ${p.nature}`);
  assert.ok(!p.ability || [...s.a, s.h].includes(p.ability), `${p.species} can't have ${p.ability} (has ${[...s.a, s.h].filter(Boolean).join(', ')})`);
  for (const [k, v] of Object.entries(p.ivs)) {
    assert.ok(STATS.includes(k), `unknown stat ${k}`);
    assert.ok(v === 0 || (Number.isInteger(v) && v > 0 && v <= 31), `bad IV ${k} ${v}`);
  }
  const line = dex.lines.get(dex.lineOf(p.species));
  assert.ok(line && line.groups.size, `${p.species} can't be bred`);
  for (const m of p.eggMoves) assert.ok(line.moves.has(m) || (line.movesM && line.movesM.has(m)), `${m} isn't an egg move of the ${dex.lineOf(p.species)} line`);
  assert.ok(Array.isArray(p.moves) && p.moves.length <= 4, 'moves: up to four');
  for (const m of p.eggMoves) assert.ok(p.moves.includes(m), `egg move ${m} isn't in the moveset`);
  assert.strictEqual(typeof p.verified, 'boolean', 'verified: true or false');
});
for (const r of raids) check(`raid ${r.key} picks`, () => assert.ok(sets.some((p) => p.raids.includes(r.key)), 'no build is used in this raid'));
if (failed) { console.log(`${failed} checks failed`); process.exit(1); }
console.log(`all ${sets.length} event builds and ${raids.length} raids ok`);
