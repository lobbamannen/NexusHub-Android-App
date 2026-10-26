export type CalendarEvent={version:number;id:string;source:string;sourceId:string;sourceLabel:string;sourceColor:string;title:string;temporal:any;editableInNexus:boolean;ownId?:string;description?:string;location?:string;mediaRef?:any;evidence?:any};
export type ReleaseEvent={id:string;seriesKey:string;imdbId?:string;title:string;season:number;episode?:number;provider:string;country:string;kind:string;availability:string;observedAt:string;releaseDate?:string;datePrecision?:string;sourceUrl?:string;sourceName:string;readAt?:string;notifiedAt?:string};
export type WatchState={configured:boolean;running:boolean;notificationGranted:boolean;usedThisMonth:number;monthlyBudget:number;events:ReleaseEvent[];lastAttemptAt?:string;lastSuccessfulCheck?:string;error?:string;history?:Array<{at:string;message:string}>;capabilities?:any[];partial?:boolean};
interface Channel{postMessage:(message:string)=>void;onmessage:((event:{data:string})=>void)|null}
declare global{interface Window{NexusNative?:Channel}}
const pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:number}>();
let bound:Channel|undefined;
export const nativeAvailable=()=>!!window.NexusNative;
export function nativeCall<T=any>(method:string,params:any={}):Promise<T>{
 const channel=window.NexusNative;
 if(!channel)return Promise.reject(Object.assign(Error('Den här funktionen kräver NexusHub Android. Kalenderns egna händelser fungerar även här.'),{code:'UNSUPPORTED_WEBVIEW'}));
 if(bound!==channel){
  bound=channel;channel.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.event){window.dispatchEvent(new CustomEvent('nexus-native-event',{detail:data}));return;}const task=pending.get(data.requestId);if(!task)return;window.clearTimeout(task.timer);pending.delete(data.requestId);if(data.ok)task.resolve(data.result);else task.reject(Object.assign(Error(data.error?.message||'Android kunde inte utföra åtgärden.'),{code:data.error?.code}));}catch{/* Ignore malformed unrelated messages. */}};
 }
 return new Promise<T>((resolve,reject)=>{const requestId=crypto.randomUUID(),timer=window.setTimeout(()=>{pending.delete(requestId);reject(Error('Android-kontrollen tog för lång tid. Försök igen.'));},45000);pending.set(requestId,{resolve,reject,timer});try{channel.postMessage(JSON.stringify({v:1,requestId,method,params}));}catch(e){window.clearTimeout(timer);pending.delete(requestId);reject(e);}});
}
export async function phoneRange(params:{from:string;toExclusive:string;zone:string;sourceIds:string[]},isCurrent:()=>boolean){
 let cursor:string|undefined,events:CalendarEvent[]=[],revision:number|undefined;const seen=new Set<string>();
 do{
  const result=await nativeCall<{events:CalendarEvent[];revision:number;nextCursor?:string;complete:boolean}>('calendar.getRange',{...params,...(cursor?{cursor}:{})});
  if(!isCurrent())return [];
  if(revision!==undefined&&revision!==result.revision)throw Error('Kalendern ändrades under läsningen. Uppdatera vyn.');revision=result.revision;
  events.push(...result.events);cursor=result.nextCursor;
  if(!result.complete&&!cursor)throw Error('Kalendern kunde bara läsas delvis. Försök igen.');
  if(cursor&&seen.has(cursor))throw Error('Kalenderläsningen kunde inte fortsätta.');if(cursor)seen.add(cursor);
 }while(cursor);
 return [...new Map(events.map(e=>[e.id,e])).values()];
}
