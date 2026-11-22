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
test('ties use up the parent with fewer 31s, and Protect spares a valuable one', () => {
  const goal = { species: 'Charmander', ivs: [31, 31, null, null, null, null] };
  const dam = mon('Charmander', 'F', [31, 0, 0, 0, 0, 0]);
  const plain = mon('Charmander', 'M', [0, 31, 0, 0, 0, 0]), fancy = mon('Charmander', 'M', [0, 31, 31, 31, 31, 31]);
  // same breeds and cost either way: the 1x31 father is used, not the 5x31
  const r = run(goal, [dam, fancy, plain]);
  assert.ok(owned(r).includes(plain) && !owned(r).includes(fancy));
  // with Protect, worth decides before the count of 31s: a pricey father (say, hidden ability) is spared
  const dam2 = mon('Charmander', 'F', [31, 0, 0, 0, 0, 0], { worth: 2500 });
  const pricey = mon('Charmander', 'M', [0, 31, 0, 0, 0, 0], { worth: 300000 });
  const other = mon('Charmander', 'M', [0, 31, 31, 31, 0, 0], { worth: 40000 });
  assert.ok(owned(run(goal, [dam2, pricey, other])).includes(pricey));
  const p = Planner.plan({ dex, prices, target: { ...goal, moves: [] }, pool: [dam2, pricey, other], opts: { mode: 'breeds', protect: true } });
  assert.ok(owned(p.result).includes(other) && !owned(p.result).includes(pricey));
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

// Beta test pass, 2026-11-21.
test('a 31 that is only on males can still reach the mother: breed one to swap its gender', () => {
  // every 31 Atk and 31 Spe Pawniard is male; the only female has nothing the goal needs
  const pool = [mon('Pawniard', 'F', [31, 3, 3, 3, 3, 3]), mon('Pawniard', 'M', [10, 31, 10, 10, 10, 10]), mon('Pawniard', 'M', [13, 13, 13, 13, 13, 31])];
  const r = run({ species: 'Pawniard', ivs: [null, 31, null, null, null, 31] }, pool);
  assert.strictEqual(r.breeds, 2);
  assert.strictEqual(braces(r), 3);
});

test('a one-gender goal (Vespiquen) hatches female, and a Gallade goal male', () => {
  const v = run({ species: 'Combee', ivs: [31, null, null, null, null, null] },
    [mon('Combee', 'F', [31, 0, 0, 0, 0, 0]), mon('Combee', 'M', [0, 0, 0, 0, 0, 0])]);
  assert.strictEqual(v.breeds, 0, 'an owned female Combee already is the goal');
  const out = Planner.plan({ dex, prices, target: { species: 'Gallade', ivs: [31, 31, null, null, null, null], moves: [] },
    pool: [mon('Ralts', 'F', [31, 0, 0, 0, 0, 0]), mon('Ralts', 'M', [0, 31, 0, 0, 0, 0])], opts: { mode: 'breeds', buy: false } });
  assert.ok(out.result);
  assert.strictEqual(out.result.node.gender, 'M');
});

test('an incense baby goal puts the incense in the last breed', () => {
  const r = run({ species: 'Azurill', ivs: [31, null, null, null, null, null] },
    [mon('Marill', 'F', [31, 0, 0, 0, 0, 0]), mon('Marill', 'M', [0, 0, 0, 0, 0, 0])]);
  assert.strictEqual(r.breeds, 1);
  assert.ok(r.node.inc, 'the last breed holds the Sea Incense');
  assert.strictEqual(r.cost, prices.incense + prices.brace); // the mother braces HP, the father holds the incense
});

test('no Pokémon at all, or only a Ditto, gives no plan and no crash', () => {
  for (const pool of [[], [{ ...mon('Ditto', 'N', all31), isDitto: true }]]) {
    const out = Planner.plan({ dex, prices, target: { species: 'Pawniard', ivs: all31, moves: [] }, pool, opts: { mode: 'breeds', buy: false } });
    assert.ok(!out.error && !out.result);
  }
  const d = Planner.plan({ dex, prices, target: { species: 'Ditto', ivs: all31, moves: [] }, pool: [], opts: {} });
  assert.ok(d.error, 'Ditto can not be bred');
  const u = Planner.plan({ dex, prices, target: { species: 'Mewtwo', ivs: all31, moves: [] }, pool: [], opts: {} });
  assert.ok(u.error, 'an Undiscovered goal says so');
});

test('pickDiverse keeps two of every kind before the best of the rest', () => {
  // 30 males with 31 Atk listed first, then 30 females with 31 Spe: the top 24 would all be male
  const list = [...Array.from({ length: 30 }, (_, i) => ({ g: 'M', s: 1, i })), ...Array.from({ length: 30 }, (_, i) => ({ g: 'F', s: 5, i: 30 + i }))];
  const got = Planner.pickDiverse(list, 24, (x) => [x.g, x.g + x.s]);
  assert.strictEqual(got.length, 24);
  assert.ok(got.filter((x) => x.g === 'F').length >= 10, 'females get a fair share');
  assert.deepStrictEqual(got.map((x) => x.i), got.map((x) => x.i).slice().sort((a, b) => a - b), 'kept in the order given');
  assert.strictEqual(Planner.pickDiverse(list, 100, (x) => [x.g]).length, 60);
  assert.strictEqual(Planner.pickDiverse(list, 0, (x) => [x.g]).length, 0);
  const one = Planner.pickDiverse(list, 24, (x) => [x.g], 1);
  assert.strictEqual(one.filter((x) => x.g === 'F').length, 2, 'one round: two females, then the best of the rest');
});

// 0 IVs (Trick Room 0 Spe, a special attacker's 0 Atk): a 0 is planned like a 31, but only an exact 0 counts.
test('a 0 Spe goal needs parents with exactly 0 Spe', () => {
  const ivs = [31, 31, null, null, null, 0];
  const r = run({ species: 'Timburr', ivs, gender: 'F' }, [mon('Timburr', 'F', [31, 5, 20, 20, 20, 0]), mon('Timburr', 'M', [31, 31, 20, 20, 20, 0]), mon('Timburr', 'F', [31, 31, 20, 20, 20, 1])]);
  assert.strictEqual(r.breeds, 1, 'the 1 Spe female is no good, so it breeds');
  assert.strictEqual(braces(r), 1, 'only Atk is braced: HP and the 0 Spe are shared');
  assert.strictEqual(r.iv[5], 0);
  // a parent with 1 Spe is no good
  const none = Planner.plan({ dex, prices, target: { species: 'Timburr', ivs, moves: [] }, pool: [mon('Timburr', 'F', [31, 31, 20, 20, 20, 1]), mon('Timburr', 'M', [31, 31, 20, 20, 20, 1])], opts: { mode: 'breeds', buy: false } });
  assert.strictEqual(none.result, null);
  // an unknown Spe isn't a 0 either
  assert.strictEqual(Planner.meets(null, 0), false);
  assert.strictEqual(Planner.meets(0, 0), true);
  assert.strictEqual(Planner.meets(3, 0), false);
  assert.strictEqual(Planner.meets(31, 25), true);
});

test('two 0 Spe parents share it, so the braces go to the other stats', () => {
  const r = run({ species: 'Timburr', ivs: [31, 31, null, null, null, 0] }, [mon('Timburr', 'F', [31, 5, 5, 5, 5, 0]), mon('Timburr', 'M', [5, 31, 5, 5, 5, 0])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(braces(r), 2);
  assert.ok(r.node.bA !== 5 && r.node.bB !== 5, 'Spe needs no brace');
});

test('a 0 Spe on only one parent is passed on with a Power Anklet', () => {
  const r = run({ species: 'Timburr', ivs: [null, 31, null, null, null, 0] }, [mon('Timburr', 'F', [5, 5, 5, 5, 5, 0]), mon('Timburr', 'M', [5, 31, 5, 5, 5, 20])]);
  assert.strictEqual(r.breeds, 1);
  assert.strictEqual(r.node.bA, 5, 'the mother braces Spe');
  assert.strictEqual(r.iv[5], 0);
});

test('a 0 IV is never bought off the GTL', () => {
  // nobody has 0 Spe: buying can fill the 31 Atk but not the 0 Spe
  const pool = [mon('Timburr', 'F', [5, 5, 5, 5, 5, 5]), mon('Timburr', 'M', [5, 5, 5, 5, 5, 5])];
  const out = Planner.plan({ dex, prices, target: { species: 'Timburr', ivs: [null, 31, null, null, null, 0], moves: [] }, pool, opts: { mode: 'breeds', buy: true, buyIV: [1, 2, 3], buyNat: [1] } });
  assert.strictEqual(out.result, null);
  // with a 0 Spe male it works, buying the 31 Atk
  const r = run({ species: 'Timburr', ivs: [null, 31, null, null, null, 0] }, [...pool, mon('Timburr', 'M', [5, 5, 5, 5, 5, 0])], { buy: true, buyIV: [1] });
  assert.ok(r.breeds >= 1);
  (function walk(x) { if (x.node.t === 'buy') assert.ok(!x.node.stats.includes(5), 'bought one with 0 Spe'); if (x.node.t === 'breed') { walk(x.node.a); walk(x.node.b); } })(r);
});

test('egg odds: a want of 0 means exactly 0', () => {
  const o = Planner.eggOdds([31, 31, 31, 31, 31, 0], [31, 31, 31, 31, 31, 31]);
  const p = o.chance([null, null, null, null, null, 0]);
  // Spe: lower parent 25%, average (15) 50%, higher 25%
  assert.ok(Math.abs(p - 0.25) < 1e-9, String(p));
  assert.ok(Math.abs(Planner.eggOdds([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]).chance([0, 0, 0, 0, 0, 0]) - 1) < 1e-9);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
if (failed) { console.log(`${failed} of ${tests.length} failed`); process.exit(1); }
console.log(`all ${tests.length} passed`);
