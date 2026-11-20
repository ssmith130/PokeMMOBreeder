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

test('a fitting nature in the box adds the Everstone version', () => {
  const box = [mon('Pawniard', 'F', [10, 31, 5, 5, 5, 31], 'Jolly'), mon('Pawniard', 'M', [4, 31, 5, 5, 5, 31])];
  const list = Builds.scanLine(dex, 'Pawniard', box, prices, {});
  assert.ok(list.some((s) => s.nature === 'Jolly' && s.label === 'Atk and Spe'));
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

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
