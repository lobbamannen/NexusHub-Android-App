// Pure, source-aware statistics for the canonical GitHub film and series registers.
const minutes=v=>Number.isSafeInteger(v)&&v>0?v:null;
const seasons=v=>Array.isArray(v)?[...new Set(v.filter(n=>Number.isInteger(n)&&n>0))]:[];
export const formatRuntime=total=>{
 if(!Number.isSafeInteger(total)||total<0)return 'Okänd tid';
 const h=Math.floor(total/60),m=total%60;
 return h?new Intl.NumberFormat('sv-SE').format(h)+' h'+(m?' '+m+' min':''):m+' min';
};
export const formatDays=total=>Number.isSafeInteger(total)&&total>=0?(total/1440).toLocaleString('sv-SE',{maximumFractionDigits:1})+' dygn':'Okänt';
export function movieStats(films=[]){
 const watched=films.filter(f=>f?.status==='Sedd');
 let verified=0,estimated=0,missing=0;
 for(const f of watched){
  const v=minutes(f?.runtimeMetadata?.minutes);
  if(v===null){missing++;continue;}
  if(f.runtimeMetadata?.status==='verified')verified+=v;
  else estimated+=v;
 }
 return {watched:watched.length,verified,estimated,missing,total:verified+estimated};
}
export function seriesStats(series=[]){
 let watched=0,verified=0,estimated=0,missing=0;
 for(const item of series){
  for(const season of seasons(item?.watchedSeasons)){
   watched++;
   const meta=item?.seasonRuntimeMetadata?.[String(season)],v=minutes(meta?.totalMinutes);
   if(v===null){missing++;continue;}
   if(meta?.status==='verified')verified+=v;
   else estimated+=v;
  }
 }
 return {watched,verified,estimated,missing,total:verified+estimated};
}
export function mediaTotals(films=[],series=[]){
 const movies=movieStats(films),shows=seriesStats(series);
 return {movies,shows,total:movies.total+shows.total,verified:movies.verified+shows.verified,estimated:movies.estimated+shows.estimated,missing:movies.missing+shows.missing};
}
export function releaseYearGroups(films=[],series=[],filter='alla'){
 const byYear=new Map();
 const add=(item,type,year,key)=>{
  if(!Number.isInteger(year)||year<1880||year>2100)return;
  if(!byYear.has(year))byYear.set(year,{year,films:0,series:0,items:[]});
  const group=byYear.get(year);
  group[type]++;
  group.items.push({key,title:item.title,year,kind:type});
 };
 if(filter!=='serier')for(const f of films)add(f,'films',f.year,f.imdbId);
 if(filter!=='filmer')for(const s of series)add(s,'series',s.startYear,s.imdbId||s.title+'|'+s.startYear);
 return [...byYear.values()].sort((a,b)=>a.year-b.year);
}
