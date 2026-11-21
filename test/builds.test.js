// Checks for the Build center's suggestions: node test/builds.test.js
const assert = require('assert');
const Planner = require('../src/planner.js');
const Builds = require('../src/builds.js');
const dex = Planner.buildDex(require('../data/species.json'));
const prices = { brace: 10000, everstone: 5000, incense: 9600, gender11: 5000, gender31: 10000, gender71: 25000,
  buy: 5000, buyNatured: 8000, buyDitto: 15000, haChance: 0.6, abilityChance: 0.8 };
let n = 0;
const mon = (species, gender, ivs, nature = '') => ({ species, gender, ivs, nature, ability: '', boxId: 'm' + n++ });
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('roles come from the fully evolved base stats', () => {
  assert.deepStrictEqual([...Builds.rolesOf(dex, 'Pawniard').keys()], ['phys']);
  assert.deepStrictEqual([...Builds.rolesOf(dex, 'Abra').keys()], ['spec']);
  assert.deepStrictEqual([...Builds.rolesOf(dex, 'Chansey').keys()], ['spec', 'wall']);
  assert.ok(Builds.rolesOf(dex, 'Eevee').size >= 2, 'Eevee evolves both ways');
});

test('Huge Power and Pure Power make a line physical', () => {
  const marill = Builds.rolesOf(dex, 'Marill'), meditite = Builds.rolesOf(dex, 'Meditite');
  assert.deepStrictEqual([...marill.keys()], ['phys']);
  assert.strictEqual(marill.get('phys').ability, 'Huge Power');
  assert.deepStrictEqual([...meditite.keys()], ['phys']);
  assert.strictEqual(meditite.get('phys').ability, 'Pure Power');
});

test('the same box gives the same answer every time, however busy the computer is', () => {
  // a box big enough that some checks run out of work
  let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const box = [];
  for (let i = 0; i < 40; i++) box.push(mon(i % 8 ? (i % 2 ? 'Machop' : 'Pawniard') : 'Ditto', i % 8 ? (rnd() < 0.5 ? 'M' : 'F') : 'N',
    Array.from({ length: 6 }, () => (rnd() < 0.3 ? 31 : Math.floor(rnd() * 31))), ['Adamant', 'Jolly', 'Hardy'][i % 3]));
  const answer = () => JSON.stringify(Builds.scanLine(dex, 'Pawniard', box, prices, {}), (k, v) => (k === 'ms' || k === 'scan' ? undefined : v));
  const once = answer();
  const t = Date.now(); while (Date.now() - t < 50); // a different moment, a different pace
  assert.strictEqual(answer(), once);
});

test('each rung asks for everything the one below it does', () => {
  for (const [line, role] of [['Pawniard', 'phys'], ['Abra', 'spec'], ['Chansey', 'wall']]) {
    const rungs = Builds.ladder(dex, line, role);
    for (let k = 1; k < rungs.length; k++)
      rungs[k - 1].ivs.forEach((v, i) => { if (v != null) assert.ok(rungs[k].ivs[i] != null && rungs[k].ivs[i] >= v, `${line} rung ${k}`); });
  }
});

test('a 31 Atk and a 31 Spe Pawniard make Atk and Spe, and the next rung says HP is missing', () => {
  const box = [mon('Pawniard', 'F', [10, 31, 5, 5, 5, 3]), mon('Pawniard', 'M', [4, 2, 5, 5, 5, 31])];
  const [s] = Builds.scanLine(dex, 'Pawniard', box, prices, {});
  assert.strictEqual(s.label, 'Atk and Spe');
  assert.strictEqual(s.breeds, 1);
  assert.strictEqual(s.uses.length, 2);
  assert.deepStrictEqual(s.next.gaps, ['HP']);
});

test("Pawniard's egg group: 31 HP/Atk/Spe with 25+ Def and SpD from Human-Like parents", () => {
  const box = [
    mon('Pawniard', 'F', [31, 31, 28, 0, 27, 0]), mon('Machop', 'M', [31, 0, 26, 0, 25, 31]),
    mon('Pawniard', 'F', [0, 31, 25, 0, 26, 31]), mon('Machop', 'M', [31, 31, 0, 0, 0, 31]),
  ];
  const [s] = Builds.scanLine(dex, 'Pawniard', box, prices, {});
  assert.strictEqual(s.label, 'HP, Atk and Spe, 25+ Def and SpD');
});

test('a card checks a nature on its own, quickly or deeper', () => {
  const box = [mon('Pawniard', 'F', [10, 31, 5, 5, 5, 31], 'Jolly'), mon('Pawniard', 'M', [4, 31, 5, 5, 5, 31])];
  const list = Builds.scanLine(dex, 'Pawniard', box, prices, {});
  assert.ok(list.every((s) => !s.nature), 'the scan leaves natures to the cards');
  const card = list.find((s) => s.label === 'Atk and Spe');
  for (const deep of [false, true]) {
    const r = Builds.checkGoal(dex, 'Pawniard', card.ivs, 'Jolly', box, prices, { deep });
    assert.ok(r.ok && !r.bought && !r.cut);
  }
  assert.ok(Builds.scanLine(dex, 'Pawniard', box, prices, { deep: true }).every((s) => s.deep));
});

test('without a Pokémon of the line nothing is suggested; Ditto and Nidorina are not lines, a baby counts for its line', () => {
  const box = [mon('Machop', 'F', [31, 31, 31, 31, 31, 31]), mon('Ditto', 'N', [31, 31, 31, 31, 31, 31]), mon('Nidorina', 'F', [31, 31, 31, 31, 31, 31]),
    mon('Pichu', 'M', [31, 31, 31, 31, 31, 31])];
  assert.deepStrictEqual(Builds.linesIn(dex, box), ['Machop', 'Pichu']);
  assert.deepStrictEqual(Builds.scanLine(dex, 'Pawniard', box, prices, {}), []);
});

test('a hidden ability or egg move in the box adds that version of the build', () => {
  const m = (species, gender, ivs, extra) => ({ ...mon(species, gender, ivs), ...extra });
  const box = [m('Shroomish', 'F', [31, 31, 0, 0, 0, 31], { ability: 'Quick Feet' }), m('Shroomish', 'M', [0, 31, 0, 0, 0, 31], { ability: 'Effect Spore' }),
    m('Breloom', 'M', [31, 0, 0, 0, 0, 31], { moves: ['False Swipe', 'Spore'] })];
  assert.deepStrictEqual(Builds.extrasFor(dex, 'Shroomish', box), { ha: 'Quick Feet', moves: ['False Swipe'] }); // Spore isn't an egg move in Gen 5
  const out = Builds.scanLine(dex, 'Shroomish', box, prices, {});
  const ha = out.find((s) => s.abil === 'Quick Feet' && !s.move), mv = out.find((s) => s.move === 'False Swipe' && !s.abil);
  assert.ok(ha, 'hidden ability version');
  assert.ok(mv, 'egg move version');
  // both together is where the card starts; the ability has to pass on in that breed, so it's a chance
  const best = out.find((s) => s.best);
  assert.ok(best && best.abil === 'Quick Feet' && best.move === 'False Swipe' && best.chance < 1);
  // without the hidden ability in the box there's no such version
  assert.ok(!Builds.scanLine(dex, 'Shroomish', box.slice(1), prices, {}).some((s) => s.abil));
});

test('recommended natures: fast attackers get +Spe first, walls their defensive nature', () => {
  assert.deepStrictEqual(Builds.recommendNatures(dex, 'Sneasel'), ['Jolly', 'Adamant']); // Weavile, base Speed 125
  assert.deepStrictEqual(Builds.recommendNatures(dex, 'Larvitar'), ['Adamant', 'Jolly']); // Tyranitar, 61
  assert.deepStrictEqual(Builds.recommendNatures(dex, 'Abra'), ['Timid', 'Modest']);
  assert.strictEqual(Builds.recommendNatures(dex, 'Skarmory')[0], 'Impish');
  assert.strictEqual(Builds.recommendNatures(dex, 'Blissey')[0], 'Calm');
  assert.deepStrictEqual(Builds.recommendNatures(dex, 'Gallade'), ['Jolly', 'Adamant']); // its own role, not Gardevoir's
  assert.deepStrictEqual(Builds.recommendNatures(dex, 'Ditto'), []);
});

test('a check with GTL buys says what to buy, and buys only where it saves a breed', () => {
  const box = [mon('Pawniard', 'F', [31, 31, 0, 0, 0, 0]), mon('Pawniard', 'M', [0, 0, 0, 0, 31, 31])];
  const goal = [31, 31, 31, null, 31, 31], all = { ...prices, buy2: 20000, buy3: 80000, buyNatured2: 40000, buyNatured3: 160000, buyDitto2: 40000, buyDitto3: 120000 };
  const box1 = Builds.checkGoal(dex, 'Pawniard', goal, '', box, all, {});
  const gtl = Builds.checkGoal(dex, 'Pawniard', goal, 'Adamant', box, all, { buy: true, buyIV: [1, 2, 3], buyNat: [1, 2, 3] });
  assert.ok(gtl.ok && gtl.buyList.length === gtl.buys.length && gtl.buyList.length > 0);
  assert.ok(gtl.buyList.some((b) => b.nat === 'Adamant'), 'the nature comes from a bought parent');
  assert.ok(gtl.buyList.every((b) => b.count >= 1 && b.count <= 3));
  assert.ok(!box1.ok || box1.breeds >= gtl.breeds);
});

test("an egg move is only offered when someone can pass it on", () => {
  const m = (species, gender, moves) => ({ ...mon(species, gender, [31, 31, 31, 0, 31, 31]), moves });
  // Ice Shard isn't an egg move of Swinub's own line, so only a male Piloswine can give it to a Sneasel
  assert.deepStrictEqual(Builds.extrasFor(dex, 'Sneasel', [mon('Sneasel', 'F', [31, 0, 0, 0, 0, 0]), m('Piloswine', 'F', ['Ice Shard'])]).moves, []);
  assert.deepStrictEqual(Builds.extrasFor(dex, 'Sneasel', [mon('Sneasel', 'F', [31, 0, 0, 0, 0, 0]), m('Piloswine', 'M', ['Ice Shard'])]).moves, ['Ice Shard']);
});

// Beta test pass, 2026-11-21: a box full of one species with lots of 1×31s.
const oneSpeciesBox = (order) => Array.from({ length: 60 }, (_, i) => {
  const stat = order === 'sorted' ? Math.floor(i / 10) : i % 6;
  const gender = order === 'males first' ? (i < 40 ? 'M' : 'F') : order === 'by stat' ? (i < 30 ? 'M' : 'F') : i % 2 ? 'M' : 'F';
  const ivs = Array.from({ length: 6 }, () => (i * 7 + 3) % 25); ivs[order === 'by stat' ? Math.floor(i / 10) : stat] = 31;
  return { ...mon('Pawniard', gender, ivs, ['Adamant', 'Jolly', 'Hardy', 'Timid'][i % 4]), moves: [] };
});
test('60 Pawniard with one 31 each make a 6×31 in 31 breeds, however the box is sorted', () => {
  // before: the 24 the planner got were all males, or had no 31 Spe, and the card said Spe was missing
  for (const order of ['alternating', 'sorted', 'males first', 'by stat']) {
    const sug = Builds.scanLine(dex, 'Pawniard', oneSpeciesBox(order), prices, {}).filter((s) => !s.abil && !s.move);
    assert.strictEqual(sug.length, 1, order);
    assert.strictEqual(sug[0].label, '6×31', `${order}: ${sug[0].label}`);
    assert.strictEqual(sug[0].breeds, 31, order);
    assert.strictEqual(sug[0].uses.length, 32, order);
  }
});

test('a nature on top of 5×31 from 1×31s is found from the box alone', () => {
  const r = Builds.checkGoal(dex, 'Pawniard', [31, 31, 31, null, 31, 31], 'Adamant', oneSpeciesBox('sorted'), prices, { noFallback: true });
  assert.ok(r.ok, 'expected a plan from the box');
  assert.ok(!r.bought);
  assert.ok(r.breeds >= 25 && r.breeds <= 35, `${r.breeds} breeds`);
});

test('an empty box or a box of only Ditto suggests nothing', () => {
  assert.deepStrictEqual(Builds.linesIn(dex, []), []);
  const dittos = Array.from({ length: 10 }, () => mon('Ditto', 'N', [31, 31, 31, 31, 31, 31]));
  assert.deepStrictEqual(Builds.linesIn(dex, dittos), []);
  assert.deepStrictEqual(Builds.scanLine(dex, 'Ditto', dittos, prices, {}), []);
});

test('a genderless line with Ditto: Beldum builds', () => {
  const box = [mon('Beldum', 'N', [31, 31, 0, 0, 0, 0]), mon('Ditto', 'N', [0, 0, 0, 0, 0, 31])];
  const [s] = Builds.scanLine(dex, 'Beldum', box, prices, {});
  assert.ok(s && s.rung >= 0 && s.label === 'Atk and Spe', s && s.label);
  assert.strictEqual(s.breeds, 1);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
