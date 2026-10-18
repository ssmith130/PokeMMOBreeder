// Which species can learn each TM the planner offers (EXTRAS in page.html), from Pokémon Showdown's data.
// Run in a folder holding Showdown's data/pokedex.ts and data/learnsets.ts in dl/; writes tms.json
// ({move name: [dex numbers]}). A species counts if it, or anything it evolves from, learns the move
// from a TM in any generation: PokeMMO's TM lists are closer to that than to Gen 5's alone.
const fs = require('fs');
function load(f) { let s = fs.readFileSync(f, 'utf8'); s = s.replace(/^export const \w+:[^=]+=/m, 'module.exports='); const m = { exports: {} }; new Function('module', s)(m); return m.exports; }
const dex = load('dl/pokedex.ts'), ls = load('dl/learnsets.ts');
const TMS = ['False Swipe', 'Thunder Wave', 'Thief', 'Toxic', 'Substitute', 'Swords Dance'];
const id = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const out = {};
for (const move of TMS) {
  const nums = [];
  for (const [key, d] of Object.entries(dex)) {
    if (d.num < 1 || d.num > 649 || d.forme) continue;
    let s = d, ok = false;
    for (let k = key; s && !ok; s = s.prevo ? dex[k = id(s.prevo)] : null)
      ok = ((((ls[k] || {}).learnset || {})[id(move)]) || []).some((src) => /^\d+M$/.test(src));
    if (ok) nums.push(d.num);
  }
  out[move] = nums.sort((a, b) => a - b);
}
fs.writeFileSync('tms.json', JSON.stringify(out));
console.log(Object.entries(out).map(([m, n]) => `${m}: ${n.length}`).join(', '), fs.statSync('tms.json').size, 'bytes');
