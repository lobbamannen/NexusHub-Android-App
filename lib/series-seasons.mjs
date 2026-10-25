/**
 * Bounded change to explicit watched season numbers.
 * Never changes seasonAvailabilityResearch, streaming catalogues, runtimes,
 * existing ratings, reviews, providers, or any unrelated series entry.
 */
export function applySeriesWatchedSeasonsChange(register,target,watchedSeasons){
 if(!register||register.schemaVersion!==1||!Array.isArray(register.series))throw Error('Ogiltigt serieregister.');
 if(!target||typeof target!=='object'||typeof target.title!=='string'||!target.title.trim()||target.title.length>240)throw Error('Ogiltig serieidentifierare.');
 if(target.startYear!==null&&(!Number.isInteger(target.startYear)||target.startYear<1800||target.startYear>2200))throw Error('Ogiltigt serieår.');
 const imdb=target.imdbId==null?null:target.imdbId;
 if(imdb!==null&&(typeof imdb!=='string'||!/^tt\d{6,12}$/.test(imdb)))throw Error('Ogiltigt IMDb-ID.');
 if(!Array.isArray(watchedSeasons)||watchedSeasons.length>100||watchedSeasons.some(n=>!Number.isInteger(n)||n<1||n>100))throw Error('Ogiltiga säsongsnummer.');
 if(new Set(watchedSeasons).size!==watchedSeasons.length)throw Error('Dubbla säsongsnummer.');
 const matches=register.series.map((entry,index)=>({entry,index})).filter(({entry})=>
  entry.title===target.title&&entry.startYear===target.startYear&&(entry.imdbId||null)===imdb);
 if(matches.length!==1)throw Error(matches.length?'Serieidentifieraren är inte unik.':'Serien finns inte i den aktuella GitHub-versionen.');
 const {entry,index}=matches[0],available=entry.seasonAvailabilityResearch?.swedenAvailableSeasonNumbers;
 if(!Array.isArray(available)||!available.length||available.some(n=>!Number.isInteger(n)||n<1))throw Error('Svenska säsongsnummer saknas eller är otillräckligt verifierade. Ingen ändring sparades.');
 if(watchedSeasons.some(n=>!available.includes(n)))throw Error('En säsong finns inte bland individuellt verifierade svenska säsongsnummer.');
 const sorted=[...watchedSeasons].sort((a,b)=>a-b);
 const old=Array.isArray(entry.watchedSeasons)?[...new Set(entry.watchedSeasons)].sort((a,b)=>a-b):[];
 if(JSON.stringify(old)===JSON.stringify(sorted))return {register,changed:false};
 const complete=available.every(n=>sorted.includes(n));
 const updated={...entry,watchedSeasons:sorted,allSeasonsAvailableInSwedenWatched:complete};
 if(complete)updated.seasonCoverageConfirmedOn=new Date().toISOString().slice(0,10);
 const series=register.series.slice();series[index]=updated;
 return {register:{...register,lastUpdated:new Date().toISOString().slice(0,10),series},changed:true};
}
