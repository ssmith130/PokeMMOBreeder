// Timing check for the Build center on a made-up box: node test/builds-bench.js [count] [seed] [--buy]
const Planner = require('../src/planner.js');
const Builds = require('../src/builds.js');
const species = require('../data/species.json');
const dex = Planner.buildDex(species);
const prices = { brace: 10000, everstone: 5000, incense: 9600, gender11: 5000, gender31: 10000, gender71: 25000,
  buy: 5000, buyNatured: 8000, buyDitto: 15000, haChance: 0.6, abilityChance: 0.8 };
const N = +process.argv[2] || 300;
let seed = +process.argv[3] || 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const NAT = ['Adamant', 'Jolly', 'Modest', 'Timid', 'Bold', 'Calm', 'Hardy', 'Quirky', 'Lax', 'Brave'];
// Mostly Field, Human-Like and Water 1 Pokémon, like someone breeding a few groups.
const picks = species.filter((s) => !s.b && !s.e.includes('Undiscovered') && s.n !== 'Ditto' && s.e.some((g) => ['Field', 'Human-Like', 'Water 1'].includes(g)));
const lines = Array.from({ length: 30 }, () => picks[Math.floor(rnd() * picks.length)]);
const mons = [];
for (let i = 0; i < N; i++) {
  const s = i % 25 === 0 ? species.find((x) => x.n === 'Ditto') : lines[Math.floor(Math.pow(rnd(), 1.6) * lines.length)];
  const gender = s.n === 'Ditto' ? 'N' : typeof s.g === 'number' ? (rnd() < s.g ? 'M' : 'F') : s.g;
  // --rich: lots of 31s everywhere; otherwise mostly caught Pokémon (few 31s) and some bred ones (2-4 31s)
  const rich = process.argv.includes('--rich'), bred = rnd() < 0.3, k = 2 + Math.floor(rnd() * 3);
  const ivs = Array.from({ length: 6 }, () => Math.floor(rnd() * 31));
  if (rich) ivs.forEach((_, i) => { if (rnd() < 0.22) ivs[i] = 31; });
  else if (bred) for (let j = 0; j < k; j++) ivs[Math.floor(rnd() * 6)] = 31;
  else ivs.forEach((_, i) => { if (rnd() < 0.04) ivs[i] = 31; });
  mons.push({ species: s.n, gender, ivs, nature: NAT[Math.floor(rnd() * NAT.length)], ability: '', boxId: 'b' + i });
}
const t0 = Date.now();
const all = [];
const ls = Builds.linesIn(dex, mons);
let worst = 0, worstLine = '';
for (const line of ls) {
  const t = Date.now();
  all.push(...Builds.scanLine(dex, line, mons, prices, { buy: process.argv.includes('--buy'), cap: +process.env.CAP || 24, timeLimit: +process.env.TL || 250 }));
  if (Date.now() - t > worst) { worst = Date.now() - t; worstLine = line; }
}
all.sort(Builds.rank);
console.log(`${mons.length} Pokémon, ${ls.length} lines, ${all.length} suggestions in ${Date.now() - t0} ms (slowest line ${worstLine} ${worst} ms)`);
for (const s of all.slice(0, +process.env.SHOW || 15)) console.log(s.rung < 0 ? `  ${s.line} (${s.role}): nothing yet, ${s.next.label} needs ${s.next.gaps.join(', ') || '?'}` :
  `  ${s.line} ${s.roleLabel}: ${s.label}${s.nature ? ' ' + s.nature : ''} = ${s.goalText} in ${s.breeds} breeds, $${s.cost}${s.truncated ? ' (cut short)' : ''}${s.next ? ` | next ${s.next.label}${s.next.gaps.length ? ' needs ' + s.next.gaps.join(', ') : s.next.slow ? ' (too slow to check)' : ''}` : ''}`);
