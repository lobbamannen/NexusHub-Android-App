import {releaseWatch} from './calendar/domain.mjs';
export const additionKey=(item,kind)=>kind==='stories'?item.path:(item.imdbId||`${item.title}|${item.startYear??item.year??''}`);
export function sortByAdded(items,kind,index){return items.map((item,position)=>({item,position,date:index?.[kind]?.[additionKey(item,kind)]||null})).sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)||a.position-b.position).map(x=>x.item);}
export function toggleReleaseWatch(value){return releaseWatch({...value,enabled:!value?.enabled,episodes:value?.episodes??true,seasons:value?.seasons??true,providerMode:value?.providerMode||'my_subscriptions',providerIds:value?.providerIds||[]});}
