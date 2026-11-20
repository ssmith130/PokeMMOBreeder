// Regression checks for the breeding search: node test/planner.test.js
const assert = require('assert');
const Planner = require('../src/planner.js');
const dex = Planner.buildDex(require('../data/species.json'));

const prices = { brace: 10000, everstone: 5000, incense: 9600, gender11: 5000, gender31: 10000, gender71: 25000,
  buy: 5000, buy2: 20000, buy3: 80000, buyNatured: 8000, buyNatured2: 40000, buyNatured3: 160000,
  buyDitto: 15000, buyDitto2: 40000, buyDitto3: 120000, haChance: 0.6, abilityChance: 0.8 };
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

// Buying from the GTL: the ticked kinds (1x31, 2x31, 3x31, with or without the nature) are the only ones used.
const bought = (r) => { const out = []; (function w(n) { if (n.t === 'buy') out.push((n.nat ? 'N' : '') + n.count); else if (n.t === 'breed') { w(n.a.node); w(n.b.node); } })(r.node); return out.sort(); };
const nobody = [mon('Ralts', 'F', [0, 0, 0, 0, 0, 0])];
const four = [31, 31, 31, 31, null, null];
test('buying 1x31 only, as before', () => {
  const r = run({ species: 'Ralts', ivs: four }, nobody, { buy: true });
  assert.strictEqual(r.breeds, 7);
  assert.deepStrictEqual([...new Set(bought(r))], ['1']);
});
test('buying 2x31 or 3x31 cuts the breeds', () => {
  assert.strictEqual(run({ species: 'Ralts', ivs: four }, nobody, { buy: true, buyIV: [2], buyNat: [] }).breeds, 3);
  const r = run({ species: 'Ralts', ivs: four }, nobody, { buy: true, buyIV: [3], buyNat: [] });
  assert.strictEqual(r.breeds, 1);
  assert.deepStrictEqual(bought(r), ['3', '3']);
});
test('natured parents are only bought when that box is ticked', () => {
  const out = Planner.plan({ dex, prices, target: { species: 'Ralts', ivs: four, nature: 'Adamant', moves: [] }, pool: nobody,
    opts: { mode: 'breeds', buy: true, buyIV: [1, 2, 3], buyNat: [] } });
  assert.ok(!out.result, 'no natured parent to buy or own, so no plan');
  const r = run({ species: 'Ralts', ivs: four, nature: 'Adamant' }, nobody, { buy: true, buyIV: [3], buyNat: [3] });
  assert.strictEqual(r.breeds, 2);
  assert.deepStrictEqual(bought(r), ['3', '3', 'N3']);
});

// A baby can't breed, but it counts as what it evolves into (same IVs), so it can be a parent.
test('a Pichu is used as a parent once evolved', () => {
  const r = run({ species: 'Pikachu', ivs: [31, 31, null, null, null, null] },
    [mon('Pichu', 'F', [31, 0, 0, 0, 0, 0]), mon('Pikachu', 'M', [0, 31, 0, 0, 0, 0])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(dex.evolveInto('Pichu')[0], 'Pikachu');
  assert.strictEqual(dex.evolveInto('Nidorina'), null);
});

// The planner tab stops after a fixed amount of work, not a number of seconds, so a search that runs
// out gives the same plan every time (and says it was cut short, not that the device ran out of time).
test('a search cut short by its work limit gives the same plan every run', () => {
  // a made-up box: Absol, Ditto and Field Pokémon with a few 31s each
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const kinds = ['Absol', 'Absol', 'Shinx', 'Eevee', 'Growlithe', 'Ponyta', 'Mareep', 'Ditto'];
  const pool = [];
  for (let i = 0; i < 60; i++) {
    const sp = kinds[i % kinds.length], ivs = Array.from({ length: 6 }, () => (rnd() < 0.35 ? 31 : Math.floor(rnd() * 31)));
    pool.push(mon(sp, sp === 'Ditto' ? 'N' : rnd() < 0.5 ? 'M' : 'F', ivs, { nature: rnd() < 0.15 ? 'Adamant' : 'Bold', isDitto: sp === 'Ditto' }));
  }
  const go = () => Planner.plan({ dex, prices, target: { species: 'Absol', ivs: all31, nature: 'Adamant', moves: [] }, pool,
    opts: { mode: 'breeds', buy: false, work: 3000000, timeLimit: 60000 } });
  const a = go(), b = go();
  assert.ok(a.truncated && !a.timedOut, 'expected the work limit to stop it');
  assert.ok(a.result, 'expected a plan');
  const flat = (r) => JSON.stringify(r, (k, v) => (typeof v === "bigint" ? String(v) : v));
  assert.strictEqual(flat(a.result), flat(b.result));
  assert.strictEqual(a.work, b.work);
});

// PokeMMO rules checked in November 2026 (see audit/breeding-rules-research.md).
const leafNames = (r) => (r.node.t === 'breed' ? [...leafNames(r.node.a), ...leafNames(r.node.b)] : r.node.t === 'own' ? [r.node.p.src.species] : ['buy']);

// Genderless Pokémon breed with their own line, not only with Ditto.
test('two genderless Pokémon of one line breed without a Ditto', () => {
  const r = run({ species: 'Beldum', ivs: all31 },
    [mon('Beldum', 'N', [31, 31, 31, 31, 31, 0]), mon('Metang', 'N', [0, 31, 31, 31, 31, 31])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(braces(r), 2);
  assert.strictEqual(r.node.pairing, 'gl');
  assert.deepStrictEqual(leafNames(r).sort(), ['Beldum', 'Metang']);
});
test('genderless Pokémon still only breed within their line', () => {
  const out = Planner.plan({ dex, prices, target: { species: 'Beldum', ivs: [31, 31, null, null, null, null], moves: [] },
    pool: [mon('Beldum', 'N', [31, 0, 0, 0, 0, 0]), mon('Magnemite', 'N', [0, 31, 0, 0, 0, 0])], opts: { mode: 'breeds', buy: false } });
  assert.ok(!out.result, 'Magnemite is genderless too but another line, so no plan');
});
test('a genderless goal with an ability still uses Ditto', () => {
  const out = Planner.plan({ dex, prices, target: { species: 'Magnemite', ivs: [31, 31, null, null, null, null], ability: 'Sturdy', moves: [] },
    pool: [mon('Magnemite', 'N', [31, 0, 0, 0, 0, 0], { ability: 'Sturdy' }), mon('Magnemite', 'N', [0, 31, 0, 0, 0, 0])], opts: { mode: 'breeds', buy: false } });
  assert.ok(!out.result, 'which genderless parent passes the ability is unconfirmed');
  const r = run({ species: 'Magnemite', ivs: [31, 31, null, null, null, null], ability: 'Sturdy' },
    [mon('Magnemite', 'N', [31, 0, 0, 0, 0, 0], { ability: 'Sturdy' }), mon('Ditto', 'N', [0, 31, 0, 0, 0, 0], { isDitto: true })]);
  assert.strictEqual(r.node.pairing, 'ditto');
});

// Egg moves pass from either parent.
test('a mother that knows the egg move passes it on', () => {
  const r = run({ species: 'Ralts', ivs: all31, moves: ['Destiny Bond'] },
    [mon('Ralts', 'F', [31, 31, 31, 31, 31, 0], { moves: ['Destiny Bond'] }), mon('Ralts', 'M', [0, 31, 31, 31, 31, 31])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(r.cost, 2 * prices.brace);
});
test('a mother can carry the ability and the egg move while the father brings IVs from another line', () => {
  const r = run({ species: 'Ralts', ivs: [31, 31, null, null, null, null], ability: 'Synchronize', moves: ['Destiny Bond'] },
    [mon('Ralts', 'F', [31, 0, 0, 0, 0, 0], { ability: 'Synchronize', moves: ['Destiny Bond'] }), mon('Gardevoir', 'M', [0, 31, 0, 0, 0, 0]), mon('Clefairy', 'M', [0, 31, 0, 0, 0, 0])]);
  assert.strictEqual(r.breeds, 1);
});
test('a female with the egg move bred with Ditto passes it on', () => {
  const r = run({ species: 'Ralts', ivs: [31, 31, null, null, null, null], moves: ['Destiny Bond'] },
    [mon('Ralts', 'F', [31, 0, 0, 0, 0, 0], { moves: ['Destiny Bond'] }), mon('Ditto', 'N', [0, 31, 0, 0, 0, 0], { isDitto: true })]);
  assert.strictEqual(r.breeds, 1);
});
// So egg moves can't be brought into a genderless line from another species, and none of them has any.
test('no genderless species has egg moves', () => {
  for (const s of dex.byName.values()) if (s.g === 'N') assert.ok(!(s.m || []).length, s.n);
});

// Picking the common gender costs the 1:1 price; only the rare gender costs more.
test('a male Charmander costs the 1:1 price, a female one the 7:1 price', () => {
  const pair = [mon('Charmander', 'F', [31, 31, 31, 31, 31, 0]), mon('Charmander', 'M', [0, 31, 31, 31, 31, 31])];
  const items = 2 * prices.brace;
  assert.strictEqual(run({ species: 'Charmander', ivs: all31, gender: 'M' }, pair).cost, items + prices.gender11);
  assert.strictEqual(run({ species: 'Charmander', ivs: all31, gender: 'F' }, pair).cost, items + prices.gender71);
  const clef = [mon('Clefairy', 'F', [31, 31, 31, 31, 31, 0]), mon('Clefairy', 'M', [0, 31, 31, 31, 31, 31])]; // 1 in 4 are male
  assert.strictEqual(run({ species: 'Clefairy', ivs: all31, gender: 'F' }, clef).cost, items + prices.gender11);
  assert.strictEqual(run({ species: 'Clefairy', ivs: all31, gender: 'M' }, clef).cost, items + prices.gender31);
});

// Species data: what isn't in PokeMMO.
test('Manaphy and Phione are left out, and the Torchic line has no hidden ability', () => {
  assert.ok(!dex.byName.has('manaphy') && !dex.byName.has('phione'));
  for (const n of ['torchic', 'combusken', 'blaziken']) assert.strictEqual(dex.byName.get(n).h, '');
});

// PokeMMO's egg IV rule, checked against the game's breeding window (Sean's screenshot, 20 Nov 2026):
// parents 31/23/21/26/20/31 and 30/30/31/11/27/19 show 30-31, 23-30, 21-31, 11-26, 20-27, 19-31.
test('egg IV ranges and odds follow PokeMMO', () => {
  const o = Planner.eggOdds([31, 23, 21, 26, 20, 31], [30, 30, 31, 11, 27, 19]);
  assert.deepStrictEqual(o.stats.map((s) => `${s.low}-${s.high}`), ['30-31', '23-30', '21-31', '11-26', '20-27', '19-31']);
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  assert.deepStrictEqual([...o.stats[1].odds.keys()], [23, 26, 30]);
  assert.ok(near(o.stats[1].odds.get(23), 0.25) && near(o.stats[1].odds.get(26), 0.5) && near(o.stats[1].odds.get(30), 0.25));
  // the wiki's table: one brace 20/60/20, two braces 12.5/75/12.5 for the other stats
  const one = Planner.eggOdds([31, 0, 0, 0, 0, 0], [0, 31, 0, 0, 0, 0], 0, -1);
  assert.ok(near(one.stats[0].odds.get(31), 1) && near(one.stats[1].odds.get(31), 0.2) && near(one.stats[1].odds.get(15), 0.6));
  const two = Planner.eggOdds([31, 0, 0, 0, 0, 0], [0, 31, 0, 31, 0, 0], 0, 1);
  assert.ok(near(two.stats[3].odds.get(31), 0.125) && near(two.chance([31, 31, null, null, null, null]), 1));
  // stats both parents have at 31 always come out 31, so the planner's guarantee holds
  assert.ok(near(Planner.eggOdds([31, 31, 0, 0, 0, 0], [31, 31, 0, 0, 0, 0]).chance([31, 31, null, null, null, null]), 1));
  // shiny parents: two stats get the higher IV, two the average, the rest a coin flip
  const sh = Planner.eggOdds([31, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], -1, -1, true);
  assert.ok(near(sh.stats[0].odds.get(31), 2 / 6 + 2 / 6 * 0.5));
});

// Costumes (PokeMMO since Shiny Wars 2026): the egg gets the costume when a parent of its own line wears it.
// Find the Pokémon you own in a plan.
function owned(r, out = []) {
  const n = r.node;
  if (n.t === 'own') out.push(n.p.src);
  if (n.t === 'breed') { owned(n.a, out); owned(n.b, out); }
  return out;
}
const three = [31, 31, 31, null, null, null];
test('a costume goal needs a parent of the line wearing it', () => {
  const two = [31, 31, null, null, null, null];
  const pool = [mon('Charizard', 'M', [31, 0, 0, 0, 0, 0], { costume: 'Royal' }), mon('Charmander', 'F', [0, 31, 0, 0, 0, 0])];
  const r = run({ species: 'Charmander', ivs: two, costume: 'Royal' }, pool);
  assert.strictEqual(r.breeds, 1);
  assert.ok(r.node.cos);
  assert.ok(owned(r).some((p) => p.costume === 'Royal'));
  // without the costumed one there is no plan, even with buying on
  const out = Planner.plan({ dex, prices, target: { species: 'Charmander', ivs: two, moves: [], costume: 'Royal' }, pool: [pool[1], mon('Charmander', 'M', [31, 0, 0, 0, 0, 0])], opts: { mode: 'breeds', buy: true } });
  assert.strictEqual(out.result, null);
});
test('a costumed father of another line can not pass his costume on', () => {
  // a Royal Charizard father with a Dratini mother gives a Dratini, so a Royal Charmander needs him with a Charmander or Ditto
  const r = run({ species: 'Charmander', ivs: [31, 31, null, null, null, null], costume: 'Royal' },
    [mon('Charizard', 'M', [31, 0, 0, 0, 0, 0], { costume: 'Royal' }), mon('Ditto', 'N', [0, 31, 0, 0, 0, 0], { isDitto: true }), mon('Dratini', 'F', [0, 31, 0, 0, 0, 0])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(r.node.pairing, 'ditto');
});
test('a plain goal leaves costumed Pokémon out', () => {
  const out = Planner.plan({ dex, prices, target: { species: 'Charmander', ivs: three, moves: [] },
    pool: [mon('Charizard', 'M', [31, 31, 31, 0, 0, 0], { costume: 'Royal' }), mon('Charmander', 'F', [0, 0, 0, 0, 0, 0])], opts: { mode: 'breeds' } });
  assert.strictEqual(out.result, null);
  assert.strictEqual(out.pool.length, 1);
});
test('costumes belong to their lines', () => {
  assert.deepStrictEqual(dex.costumesOf('Charizard'), ['Royal']);
  assert.deepStrictEqual(dex.costumesOf('Lucario'), ['Pharaoh']);
  assert.deepStrictEqual(dex.costumesOf('Garchomp'), ['Pirate']);
  assert.deepStrictEqual(dex.costumesOf('Pikachu'), []);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
