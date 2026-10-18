const fs=require('fs');
function load(f,name){let s=fs.readFileSync(f,'utf8');s=s.replace(/^export const \w+:[^=]+=/m,'module.exports=');const m={exports:{}};new Function('module',s)(m);return m.exports;}
const dex=load('dl/pokedex.ts'),ls=load('dl/learnsets.ts'),mv={};{const t=fs.readFileSync('dl/moves.ts','utf8');const re=/^\t(\w+): \{\n(?:\t\t.*\n)*?\t\tname: "([^"]+)"/gm;let m;while((m=re.exec(t)))mv[m[1]]={name:m[2]};}
const out=[];
for(const [id,d] of Object.entries(dex)){
  if(d.num<1||d.num>649||d.forme) continue;
  let g='B'; if(d.gender) g=d.gender; else if(d.genderRatio){g=d.genderRatio.M;} else g=0.5;
  let base=d; while(base.prevo){base=dex[base.prevo.toLowerCase().replace(/[^a-z0-9]/g,'')];}
  const lsd=(ls[base===d?id:base.name.toLowerCase().replace(/[^a-z0-9]/g,'')]||{}).learnset||{};
  const egg=Object.entries(lsd).filter(([m,src])=>src.some(s=>/^[3-5]E/.test(s))).map(([m])=>mv[m]?mv[m].name:m).sort();
  const ab=[d.abilities[0],d.abilities[1]].filter(Boolean);
  const o={n:d.name,i:d.num,g,e:d.eggGroups,a:ab,h:d.abilities.H||''};
  if(base!==d)o.b=base.name; if(base===d&&egg.length)o.m=egg;
  out.push(o);
}
fs.writeFileSync('species.json',JSON.stringify(out));
console.log(out.length, fs.statSync('species.json').size, JSON.stringify(out.find(x=>x.n==='Torkoal')), JSON.stringify(out.find(x=>x.n==='Sandslash')), JSON.stringify(out.find(x=>x.n==='Ditto')), JSON.stringify(out.find(x=>x.n==='Tauros')),JSON.stringify(out.find(x=>x.n==='Nidoqueen')));
