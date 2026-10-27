export const PROVIDERS={netflix:'Netflix',prime:'Prime Video',disney:'Disney+',hbo:'HBO Max',skyshowtime:'SkyShowtime',viaplay:'Viaplay',tv4play:'TV4 Play'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const seriesKey=row=>row.imdbId||`${row.title}|${row.startYear??''}`;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const instant=value=>typeof value==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(value)&&!Number.isNaN(Date.parse(value));
const providers=value=>{if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!Object.hasOwn(PROVIDERS,id)))throw Error('Välj giltiga streamingtjänster.');return [...new Set(value)];};
export function watchSettings(input={}){
 const defaults={schemaVersion:1,country:'se',timeZone:'Europe/Stockholm',providers:Object.keys(PROVIDERS),notifyNewEpisodes:true,notifyNewSeasons:true,notifyUpcoming:false,checkIntervalHours:24,dailyCheckTime:'15:00',quietHours:{enabled:false,from:'22:00',to:'08:00'}};
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ogiltiga bevakningsinställningar.');
 if(input.checkIntervalHours!==undefined&&![6,24].includes(input.checkIntervalHours))throw Error('Ogiltigt kontrollintervall.');
 const out={...defaults,...input,checkIntervalHours:24,providers:providers(input.providers??defaults.providers),quietHours:{...defaults.quietHours,...input.quietHours}};
 if(out.country!=='se'||out.timeZone!=='Europe/Stockholm'||out.checkIntervalHours!==24||out.dailyCheckTime!=='15:00'||out.schemaVersion!==1||['notifyNewEpisodes','notifyNewSeasons','notifyUpcoming'].some(k=>typeof out[k]!=='boolean')||typeof out.quietHours.enabled!=='boolean'||!time.test(out.quietHours.from)||!time.test(out.quietHours.to))throw Error('Ogiltig region, kontrolltid eller notisinställning.');return out;
}
export function releaseWatch(value){
 if(!value||typeof value!=='object'||['enabled','episodes','seasons'].some(k=>typeof value[k]!=='boolean')||!['my_subscriptions','custom'].includes(value.providerMode))throw Error('Ogiltiga bevakningsval.');
 return {...value,providerIds:providers(value.providerIds||[])};
}
export function applyReleaseWatch(register,target,value){
 if(register?.schemaVersion!==1||!Array.isArray(register.series))throw Error('Ogiltigt serieregister.');
 const hits=register.series.map((row,index)=>({row,index})).filter(({row})=>row.title===target?.title&&row.startYear===target?.startYear&&(row.imdbId||null)===(target?.imdbId||null));
 if(hits.length!==1)throw Error('Serien saknas eller identifieraren är inte unik.');
 const next=register.series.slice();next[hits[0].index]={...hits[0].row,releaseWatch:releaseWatch(value)};return {...register,series:next};
}
export function ownCalendarEvent(input){
 if(!input||!uuid.test(input.id)||input.source!=='nexushub'||typeof input.title!=='string'||!input.title.trim()||input.title.length>240||typeof(input.notes??'')!=='string'||(input.notes||'').length>50000)throw Error('Ogiltig egen kalenderhändelse.');
 const zone=input.timezone||'Europe/Stockholm';try{new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format();}catch{throw Error('Ogiltig tidszon.');}
 if(input.kind==='timed'){if(!instant(input.start)||!instant(input.end)||Date.parse(input.end)<=Date.parse(input.start))throw Error('Sluttiden måste ligga efter starttiden och ha tidszon.');}
 else if(input.kind==='allDay'){if(!day(input.allDayStart)||!day(input.allDayEndExclusive)||input.allDayEndExclusive<=input.allDayStart)throw Error('Heldagens slutdatum måste vara efter startdatum.');}
 else throw Error('Ogiltig datumtyp.');
 return {id:input.id,title:input.title.trim(),notes:input.notes||'',source:'nexushub',kind:input.kind,start:input.kind==='timed'?input.start:null,end:input.kind==='timed'?input.end:null,allDayStart:input.kind==='allDay'?input.allDayStart:null,allDayEndExclusive:input.kind==='allDay'?input.allDayEndExclusive:null,timezone:zone,updatedAt:input.updatedAt&&instant(input.updatedAt)?input.updatedAt:new Date().toISOString(),...(input.deletedAt&&instant(input.deletedAt)?{deletedAt:input.deletedAt}:{})};
}
export function applyCalendarChange(register,input){
 if(register?.schemaVersion!==1||!Array.isArray(register.events))throw Error('Ogiltigt kalenderregister.');
 const events=register.events.slice(),id=input?.action==='upsert'?input.event?.id:input?.id,index=events.findIndex(e=>e.id===id);
 if(input?.action==='upsert'){const next=ownCalendarEvent(input.event);if(index>=0)events[index]={...events[index],...next,deletedAt:null};else events.push(next);}
 else if(input?.action==='delete'&&uuid.test(id)&&index>=0)events[index]={...events[index],deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 else throw Error('Kalenderhändelsen saknas eller ändringen är ogiltig.');
 return {...register,schemaVersion:1,lastUpdated:new Date().toISOString(),events};
}
export function normalizedReleaseEvent(input){
 if(!input||typeof input.id!=='string'||!input.id||input.id.length>400||typeof input.seriesKey!=='string'||typeof input.title!=='string'||input.title.length>500||input.country!=='SE'||!Object.hasOwn(PROVIDERS,input.provider)||!['episode','season'].includes(input.kind)||!['confirmed_available','confirmed_upcoming','unknown','removed'].includes(input.availability)||!Number.isInteger(input.season)||input.season<1||(input.kind==='episode'&&(!Number.isInteger(input.episode)||input.episode<1))||!instant(input.observedAt))throw Error('Ogiltig bevakningshändelse.');
 const keys=['id','seriesKey','imdbId','title','season','episode','provider','country','kind','availability','observedAt','sourceName','sourceUrl','readAt','notifiedAt','releaseDate','datePrecision'];const result=Object.fromEntries(keys.filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
 if(result.releaseDate&&!day(result.releaseDate))throw Error('Ogiltigt premieredatum.');
 for(const k of ['readAt','notifiedAt'])if(result[k]&&!instant(result[k]))throw Error('Ogiltig kvittenstid.');
 if(result.sourceUrl){try{const url=new URL(result.sourceUrl);if(url.protocol!=='https:')throw Error();}catch{delete result.sourceUrl;}}
 return result;
}
export function mergeWatchHistory(register,events){
 if(register?.schemaVersion!==1||!Array.isArray(register.events)||!Array.isArray(events))throw Error('Ogiltig bevakningshistorik.');
 const all=new Map(register.events.map(e=>[e.id,e]));
 for(const raw of events){const e=normalizedReleaseEvent(raw),old=all.get(e.id);const next=old&&Date.parse(old.observedAt)>Date.parse(e.observedAt)?{...old}:{...old,...e};
  for(const k of ['readAt','notifiedAt']){const latest=[old?.[k],e[k]].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);if(latest)next[k]=latest;}all.set(e.id,next);
 }
 return {...register,schemaVersion:1,events:[...all.values()].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))};
}
export function calendarOwnEvents(events){return events.filter(e=>!e.deletedAt).map(e=>({version:1,id:'nexus:'+e.id,source:'nexus',sourceId:'nexus',sourceLabel:'NexusHub',sourceColor:'#efb56f',title:e.title,description:e.notes,editableInNexus:true,ownId:e.id,temporal:e.kind==='allDay'?{kind:'allDay',startDate:e.allDayStart,endDateExclusive:e.allDayEndExclusive}:{kind:'timed',startsAt:e.start,endsAt:e.end,originalZone:e.timezone}}));}
export function calendarMediaEvents(events){return events.filter(e=>e.releaseDate&&e.datePrecision==='day'&&['confirmed_upcoming','confirmed_available'].includes(e.availability)).map(e=>({version:1,id:'media:'+e.id,source:'episode',sourceId:'media',sourceLabel:PROVIDERS[e.provider],sourceColor:'#77baff',title:e.title+' · S'+e.season+(e.episode?' A'+e.episode:''),editableInNexus:false,temporal:{kind:'releaseDate',date:e.releaseDate,region:'SE',precision:'day'},mediaRef:{type:e.kind==='episode'?'episode':'series',imdbId:e.imdbId,season:e.season,episode:e.episode},evidence:{sourceName:e.sourceName,sourceUrl:e.sourceUrl,fetchedAt:e.observedAt,confidence:'confirmedSE',country:'SE',service:e.provider}}));}
