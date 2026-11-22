// Checks the competitive sets in data/presets.json against the species data: node test/presets.test.js
const assert = require('assert');
const Planner = require('../src/planner.js');
const species = require('../data/species.json');
const { sets } = require('../data/presets.json');
const dex = Planner.buildDex(species);
const NATURES = ['Hardy', 'Lonely', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];
const STATS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];
const by = new Map(species.map((s) => [s.n, s]));
let failed = 0;
const keys = new Set();
for (const p of sets) {
  try {
    assert.ok(/^[a-z0-9-]+$/.test(p.key), 'key: lower case letters, digits and -');
    assert.ok(!keys.has(p.key), 'key used twice'); keys.add(p.key);
    const s = by.get(p.species);
    assert.ok(s, `unknown species ${p.species}`);
    assert.ok(p.name && p.tier && p.role, 'needs a name, tier and role');
    assert.ok(!p.nature || NATURES.includes(p.nature), `unknown nature ${p.nature}`);
    assert.ok(!p.ability || [...s.a, s.h].includes(p.ability), `${p.species} can't have ${p.ability} (has ${[...s.a, s.h].filter(Boolean).join(', ')})`);
    for (const [k, v] of Object.entries(p.ivs)) {
      assert.ok(STATS.includes(k), `unknown stat ${k}`);
      assert.ok(v === 0 || v === 31 || (Number.isInteger(v) && v > 0 && v <= 31), `bad IV ${k} ${v}`);
    }
    const line = dex.lines.get(dex.lineOf(p.species));
    assert.ok(line && line.groups.size, `${p.species} can't be bred`);
    for (const m of p.eggMoves) assert.ok(line.moves.has(m) || (line.movesM && line.movesM.has(m)), `${m} isn't an egg move of the ${dex.lineOf(p.species)} line`);
    assert.ok(Array.isArray(p.moves) && p.moves.length <= 4, 'moves: up to four');
    for (const m of p.eggMoves) assert.ok(p.moves.includes(m), `egg move ${m} isn't in the moveset`);
    assert.strictEqual(typeof p.verified, 'boolean', 'verified: true or false');
  } catch (e) { failed++; console.log(`FAIL ${p.key}: ${e.message}`); }
}
if (failed) { console.log(`${failed} of ${sets.length} sets failed`); process.exit(1); }
console.log(`all ${sets.length} sets ok`);
