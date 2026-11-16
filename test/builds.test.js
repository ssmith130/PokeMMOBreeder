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

test('without a Pokémon of the line nothing is suggested, and babies and Ditto are not lines', () => {
  const box = [mon('Machop', 'F', [31, 31, 31, 31, 31, 31]), mon('Ditto', 'N', [31, 31, 31, 31, 31, 31]), mon('Pichu', 'M', [31, 31, 31, 31, 31, 31])];
  assert.deepStrictEqual(Builds.linesIn(dex, box), ['Machop']);
  assert.deepStrictEqual(Builds.scanLine(dex, 'Pawniard', box, prices, {}), []);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n    ', e.message); }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
