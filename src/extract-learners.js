// Who can pass on each egg move without having it bred in: the species that learn it by level-up, TM or
// move tutor in Gens 3-5, from Pokémon Showdown's data. Run in a folder holding Showdown's data/pokedex.ts,
// data/learnsets.ts and data/moves.ts in dl/, next to species.json; writes learners.json
// for every move that is an egg move somewhere in species.json, as {move name: "level-up|TM|tutor"}: each
// part a space-separated list of dex numbers, level-up ones as number:level ("369:78 408:46|...|...").
// Species that can never be a father (female-only, genderless, Ditto, Undiscovered) are left out.
// The egg move finder in page.html reads it.
const fs = require('fs');
function load(f) { let s = fs.readFileSync(f, 'utf8'); s = s.replace(/^export const \w+:[^=]+=/m, 'module.exports='); const m = { exports: {} }; new Function('module', s)(m); return m.exports; }
const dex = load('dl/pokedex.ts'), ls = load('dl/learnsets.ts');
const id = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const eggMoves = new Set(JSON.parse(fs.readFileSync('species.json', 'utf8')).flatMap((s) => s.m || []));
const out = {};
for (const move of [...eggMoves].sort()) {
  const list = [];
  for (const [key, d] of Object.entries(dex)) {
    if (d.num < 1 || d.num > 649 || d.forme || d.gender || d.eggGroups.includes('Undiscovered') || d.eggGroups.includes('Ditto')) continue;
    const src = (((ls[key] || {}).learnset || {})[id(move)] || []).filter((s) => /^[3-5][LMT]/.test(s));
    if (!src.length) continue;
    // a level from the newest of Gens 5, 4, 3 that has one; otherwise TM, then tutor
    const lv = src.filter((s) => s[1] === 'L').sort().reverse()[0];
    list.push([d.num, lv ? +lv.slice(2) : src.some((s) => s[1] === 'M') ? 'M' : 'T']);
  }
  list.sort((a, b) => a[0] - b[0]);
  const part = (f) => list.filter(f).map(([n, how]) => (typeof how === 'number' ? `${n}:${how}` : n)).join(' ');
  if (list.length) out[move] = [part((x) => typeof x[1] === 'number'), part((x) => x[1] === 'M'), part((x) => x[1] === 'T')].join('|');
}
fs.writeFileSync('learners.json', JSON.stringify(out));
console.log(Object.keys(out).length, 'of', eggMoves.size, 'egg moves,', fs.statSync('learners.json').size, 'bytes;', 'Head Smash:', JSON.stringify(out['Head Smash']));
