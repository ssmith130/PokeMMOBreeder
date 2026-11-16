// Adds Gen 5 base stats to data/species.json as s: [hp, atk, def, spa, spd, spe] (used by the Build
// center to tell physical attackers from special ones). Run from the repo root with Showdown's
// data/pokedex.ts and data/mods/gen8..gen5/pokedex.ts saved in dl/ as pokedex.ts, gen8.ts ... gen5.ts:
//   node src/extract-stats.js
const fs = require('fs');
function load(f) {
  if (!fs.existsSync(f)) return {};
  let s = fs.readFileSync(f, 'utf8').replace(/^export const \w+:[^=]+=/m, 'module.exports=');
  const m = { exports: {} }; new Function('module', s)(m); return m.exports;
}
const dex = load('dl/pokedex.ts');
// Each older generation's mod only lists what changed, so apply them newest first.
for (const g of [8, 7, 6, 5]) for (const [id, d] of Object.entries(load(`dl/gen${g}.ts`))) if (d.baseStats && dex[id]) dex[id] = { ...dex[id], baseStats: d.baseStats };
const byName = new Map(Object.values(dex).map((d) => [d.name, d]));
const species = JSON.parse(fs.readFileSync('data/species.json', 'utf8'));
let missing = 0;
for (const sp of species) {
  const d = byName.get(sp.n);
  if (!d) { missing++; console.log('no stats for', sp.n); continue; }
  const b = d.baseStats;
  sp.s = [b.hp, b.atk, b.def, b.spa, b.spd, b.spe];
}
fs.writeFileSync('data/species.json', JSON.stringify(species));
console.log(species.length, 'species,', missing, 'missing', JSON.stringify(species.find((x) => x.n === 'Pawniard')));
