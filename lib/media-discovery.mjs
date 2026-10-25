// UI-only category indexes derived from canonical registers. No data mutations.
import {groupedGenreOptions} from './genre-taxonomy.mjs';
const count=(items,match)=>items.filter(match).length;
const group=(id,label,values)=>({id,label,items:values.filter(x=>x.count>0).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'sv'))});
const values=(items,extract,prefix)=>{const tally=new Map();for(const item of items){const unique=new Set(extract(item).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()));for(const name of unique)tally.set(name,(tally.get(name)||0)+1)}return [...tally].map(([name,count])=>({id:prefix+name,label:name,count}))};
export const seriesIsWatchlisted=item=>item?.wantToWatch===true||(item?.wantToWatch!==false&&item?.status==='Vill se');
export function filmDiscovery(films=[]){
 const all=Array.isArray(films)?films:[];
 const statuses=['Inte sett','Sedd','Pågående','Vill se','Avbruten'];
 return {
  total:all.length,
  metrics:[{label:'Registrerade',value:all.length},{label:'Vill se',value:count(all,f=>f.status==='Vill se')}],
  groups:[
   group('genre','Huvudgenrer',groupedGenreOptions(all)),
   group('filmseries','Filmserier',values(all,f=>f.series?.name?[f.series.name]:[],'filmseries:')),
   group('status','Visningsstatus',statuses.map(name=>({id:'status:'+name,label:name,count:count(all,f=>f.status===name)})))
  ].filter(g=>g.items.length>0)
 };
}
export function seriesDiscovery(series=[]){
 const all=Array.isArray(series)?series:[];
 return {
  total:all.length,
  metrics:[{label:'Registrerade',value:all.length},{label:'Vill se',value:count(all,seriesIsWatchlisted)}],
  groups:[
   group('genre','Huvudgenrer',groupedGenreOptions(all)),
   group('provider','Streamingkataloger i Sverige',values(all,x=>(x.seasonAvailabilityResearch?.swedenProviderSeasonCounts||[]).map(p=>p.provider),'provider:')),
   group('status','Övriga urval',[{id:'status:sedda',label:'Sedda i Sverige',count:count(all,x=>x.allSeasonsAvailableInSwedenWatched===true)},{id:'status:villse',label:'Vill se',count:count(all,seriesIsWatchlisted)},{id:'status:favoriter',label:'Favoriter',count:count(all,x=>x.favorite===true)},{id:'status:övriga',label:'Övriga',count:count(all,x=>!x.allSeasonsAvailableInSwedenWatched)}])
  ].filter(g=>g.items.length>0)
 };
}
