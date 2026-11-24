const fs=require('fs');
function load(f,name){let s=fs.readFileSync(f,'utf8');s=s.replace(/^export const \w+:[^=]+=/m,'module.exports=');const m={exports:{}};new Function('module',s)(m);return m.exports;}
const dex=load('dl/pokedex.ts'),g5=fs.existsSync('dl/gen5.ts')?load('dl/gen5.ts'):{},ls=load('dl/learnsets.ts'),mv={};{const t=fs.readFileSync('dl/moves.ts','utf8');const re=/^\t(\w+): \{\n(?:\t\t.*\n)*?\t\tname: "([^"]+)"/gm;let m;while((m=re.exec(t)))mv[m[1]]={name:m[2]};}
const out=[];
// PokeMMO differences: Manaphy and Phione aren't in the game (PokeMMO Wiki), and the Torchic line's hidden
// ability Speed Boost was removed (changelog 24/06/2022).
const NOT_IN_GAME=new Set(['Manaphy','Phione']),NO_HIDDEN=new Set(['Torchic','Combusken','Blaziken']);
// Shedinja can't breed in PokeMMO (PokeMMO Wiki: Shedinja, egg groups "Cannot breed").
const NO_BREED=new Set(['Shedinja']);
// Egg moves: PokeMMO's own lists, which are much shorter than the main games' because PokeMMO moved many egg
// moves to tutors. egg-moves-pokemmo.json (next to this script's output, or in data/) holds them per line, keyed
// by a member's name; copied from mmobreeder.com/egg-moves (lists from the game client) on 2026-11-24.
const key=n=>n.toLowerCase().replace('♀','f').replace('♂','m').replace(/[^a-z0-9]/g,'');
const pmFile=['egg-moves-pokemmo.json','data/egg-moves-pokemmo.json','../data/egg-moves-pokemmo.json'].find(f=>fs.existsSync(f));
const pm=pmFile?JSON.parse(fs.readFileSync(pmFile,'utf8')):null,pmBase={};
if(pm){const byKey={};for(const d of Object.values(dex))byKey[key(d.name)]=d;for(const [n,moves] of Object.entries(pm)){let b=byKey[key(n)];if(!b)throw new Error('unknown species '+n);while(b.prevo)b=byKey[key(b.prevo)];pmBase[b.name]=moves.slice().sort();}}
for(const [id,d] of Object.entries(dex)){
  if(d.num<1||d.num>649||d.forme||NOT_IN_GAME.has(d.name)) continue;
  let g='B'; if(d.gender) g=d.gender; else if(d.genderRatio){g=d.genderRatio.M;} else g=0.5;
  let base=d; while(base.prevo){base=dex[base.prevo.toLowerCase().replace(/[^a-z0-9]/g,'')];}
  const lsd=(ls[base===d?id:base.name.toLowerCase().replace(/[^a-z0-9]/g,'')]||{}).learnset||{};
  const egg=pm?(pmBase[base.name]||[]):Object.entries(lsd).filter(([m,src])=>src.some(s=>/^[3-5]E/.test(s))).map(([m])=>mv[m]?mv[m].name:m).sort();
  const ab=[d.abilities[0],d.abilities[1]].filter(Boolean);
  const o={n:d.name,i:d.num,t:(g5[id]&&g5[id].types)||d.types,g,e:NO_BREED.has(d.name)?['Undiscovered']:d.eggGroups,a:ab,h:NO_HIDDEN.has(d.name)?'':d.abilities.H||''};
  if(base!==d)o.b=base.name; if(base===d&&egg.length)o.m=egg;
  out.push(o);
}
fs.writeFileSync('species.json',JSON.stringify(out));
console.log(out.length, fs.statSync('species.json').size, JSON.stringify(out.find(x=>x.n==='Torkoal')), JSON.stringify(out.find(x=>x.n==='Sandslash')), JSON.stringify(out.find(x=>x.n==='Ditto')), JSON.stringify(out.find(x=>x.n==='Tauros')),JSON.stringify(out.find(x=>x.n==='Nidoqueen')));
