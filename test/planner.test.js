// Regression checks for the breeding search: node test/planner.test.js
const assert = require('assert');
const Planner = require('../src/planner.js');
const dex = Planner.buildDex(require('../data/species.json'));

const prices = { brace: 10000, everstone: 5000, incense: 9600, gender11: 5000, gender31: 10000, gender71: 25000,
  buy: 5000, buyNatured: 8000, buyDitto: 15000, haChance: 0.6, abilityChance: 0.8 };
const all31 = [31, 31, 31, 31, 31, 31];

function run(target, pool, opts = {}) {
  const out = Planner.plan({ dex, prices, target: { moves: [], ...target }, pool, opts: { mode: 'breeds', buy: false, ...opts } });
  assert.ok(out.result, 'expected a plan');
  return out.result;
}
// Count the braces in a plan.
function braces(r) {
  const n = r.node;
  if (n.t !== 'breed') return 0;
  return (n.bA >= 0 ? 1 : 0) + (n.bB >= 0 ? 1 : 0) + braces(n.a) + braces(n.b);
}
const mon = (species, gender, ivs, extra = {}) => ({ species, gender, ivs: ivs.slice(), nature: '', ability: '', moves: [], ...extra });
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// The case from the bug report: two 6x31 Ralts, the mother Adamant with the Everstone, and a male goal.
// The stats both parents share are guaranteed, so the Everstone is the only item.
test('6x31 natured pair needs no brace', () => {
  for (const mode of ['breeds', 'cost']) {
    const r = run({ species: 'Ralts', ivs: all31, nature: 'Adamant', ability: 'Synchronize', gender: 'M' },
      [mon('Ralts', 'F', all31, { nature: 'Adamant', ability: 'Synchronize' }), mon('Ralts', 'M', all31, { ability: 'Synchronize' })], { mode });
    assert.strictEqual(r.breeds, 1);
    assert.strictEqual(braces(r), 0, `${mode}: ${braces(r)} brace(s)`);
    assert.strictEqual(r.cost, prices.everstone + prices.gender11);
  }
});

// From here on the mother has the ability and the father the egg move, so neither already is the goal.
const goal = { species: 'Ralts', ivs: all31, ability: 'Synchronize', moves: ['Destiny Bond'] };
const mother = (ivs, extra) => mon('Ralts', 'F', ivs, { ability: 'Synchronize', ...extra });
const father = (ivs, extra) => mon('Ralts', 'M', ivs, { moves: ['Destiny Bond'], ...extra });

test('6x31 pair without a nature needs no items', () => {
  const r = run(goal, [mother(all31), father(all31)]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(braces(r), 0);
  assert.strictEqual(r.cost, 0);
});

test('one parent missing one 31 needs one brace', () => {
  for (const [f, m] of [[[31, 31, 31, 31, 31, 0], all31], [all31, [0, 31, 31, 31, 31, 31]]]) {
    const r = run(goal, [mother(f), father(m)]);
    assert.strictEqual(r.breeds, 1);
    assert.strictEqual(braces(r), 1);
    assert.strictEqual(r.cost, prices.brace);
  }
});

test('each parent missing a different 31 needs two braces', () => {
  const r = run(goal, [mother([31, 31, 31, 31, 31, 0]), father([0, 31, 31, 31, 31, 31])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(braces(r), 2);
});

test('Everstone parent missing a 31, other 6x31: one brace on the other', () => {
  const r = run({ ...goal, nature: 'Adamant' }, [mother([31, 31, 31, 31, 31, 0], { nature: 'Adamant' }), father(all31)]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(braces(r), 1);
  assert.strictEqual(r.cost, prices.everstone + prices.brace);
});

test('6x31 Ditto pair needs no brace', () => {
  const r = run({ species: 'Ralts', ivs: all31, nature: 'Adamant' },
    [mon('Ralts', 'M', all31), { ...mon('Ditto', 'N', all31, { nature: 'Adamant' }), isDitto: true }]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(braces(r), 0);
  assert.strictEqual(r.cost, prices.everstone);
});

// The usual climb from 1x31s still takes 7 breeds with two braces in each.
test('building up from 1x31s still works', () => {
  const pool = [];
  for (let s = 0; s < 6; s++) for (const g of ['F', 'M']) { const iv = [0, 0, 0, 0, 0, 0]; iv[s] = 31; pool.push(mon('Ralts', g, iv)); pool.push(mon('Ralts', g, iv)); }
  const r = run({ species: 'Ralts', ivs: [31, 31, 31, 31, null, null] }, pool);
  assert.strictEqual(r.breeds, 7);
  assert.strictEqual(braces(r), 14);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
