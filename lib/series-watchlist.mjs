/**
 * Minimal write surface for Serier/register.json: exactly one watchlist flag,
 * never the title, seasons, viewing status, ratings, or provider metadata.
 */
export function applySeriesWatchlistChange(register,target,wantToWatch){
 if(!register||register.schemaVersion!==1||!Array.isArray(register.series))throw Error('Ogiltigt serieregister.');
 if(typeof wantToWatch!=='boolean')throw Error('Vill se måste vara sant eller falskt.');
 if(!target||typeof target!=='object'||typeof target.title!=='string'||!target.title.trim()||target.title.length>240)throw Error('Ogiltig serieidentifierare.');
 if(target.startYear!==null&&(!Number.isInteger(target.startYear)||target.startYear<1800||target.startYear>2200))throw Error('Ogiltigt serieår.');
 const imdb=target.imdbId==null?null:target.imdbId;
 if(imdb!==null&&(typeof imdb!=='string'||!/^tt\d{6,12}$/.test(imdb)))throw Error('Ogiltigt IMDb-ID.');
 const matches=register.series.map((entry,index)=>({entry,index})).filter(({entry})=>
  entry.title===target.title&&entry.startYear===target.startYear&&(entry.imdbId||null)===imdb);
 if(matches.length!==1)throw Error(matches.length?'Serieidentifieraren är inte unik.':'Serien finns inte i den aktuella GitHub-versionen.');
 const {entry,index}=matches[0];
 const currentlyListed=entry.wantToWatch===true||(entry.wantToWatch!==false&&entry.status==='Vill se');
 if(currentlyListed===wantToWatch)return {register,changed:false};
 const updated={...entry};
 if(wantToWatch)updated.wantToWatch=true;
 else if(entry.status==='Vill se')updated.wantToWatch=false;
 else delete updated.wantToWatch;
 const series=register.series.slice();series[index]=updated;
 return {register:{...register,lastUpdated:new Date().toISOString().slice(0,10),series},changed:true};
}
