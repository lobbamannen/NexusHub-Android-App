import {durableDelete,durableEntries,durableGet,durableSet} from './local-store';
import {normalizeActivity,queryActivity} from '@/lib/activity-log.mjs';

export type ActivityEvent={id:string;at:string;category:string;action:string;status:string;source:string;objectType?:string;objectId?:string;title?:string;path?:string;operationId?:string;details?:unknown};
export type ActivityInput=Omit<ActivityEvent,'id'|'at'|'source'>&{id?:string;at?:string;source?:string};
export type ActivityQuery={limit?:number;cursor?:string|null;search?:string;category?:string;status?:string;from?:string;toExclusive?:string};
export type ActivityPage={items:ActivityEvent[];nextCursor:string|null;total:number};
const prefix='activity:v1:';
let chain:Promise<unknown>=Promise.resolve(),warning='';
const retained=new Map<string,ActivityEvent>();
function native(){return typeof window==='undefined'?null:window.Android as any;}
function changed(){if(typeof window!=='undefined')window.dispatchEvent(new Event('nexus-activity-changed'));}
function serial<T>(work:()=>Promise<T>):Promise<T>{const run=chain.then(work,work);chain=run.catch(()=>{});return run;}
export function activityHealth(){return warning;}
const storageWarning=()=>{warning='Aktivitetsloggen kunde inte säkra alla händelser. Väntande poster försöks igen; de kan gå förlorade om appen avslutas innan lagringen fungerar.';};
async function localEntries(){return (await durableEntries<ActivityEvent>(prefix)).map(([,value])=>value);}
async function store(event:ActivityEvent){
 const bridge=native();
 if(typeof bridge?.appendActivity==='function')try{if(bridge.appendActivity(JSON.stringify(event))===true)return 'native';}catch{/* A native outage falls back to durable web storage. */}
 const key=prefix+event.id;if(!await durableGet(key))await durableSet(key,event);return 'local';
}
/** Migrate older fallback entries before accepting later attempts with the same ID. */
async function flush(){
 const bridge=native();
 if(typeof bridge?.appendActivity==='function')for(const event of await localEntries()){
  if(bridge.appendActivity(JSON.stringify(event))!==true)break;
  await durableDelete(prefix+event.id);
 }
 for(const [id,event]of retained){await store(event);retained.delete(id);}
 if(!retained.size)warning='';
}
async function identity(id:string){
 if(id.length<=200)return id;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
 return 'sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
/** A history outage must never turn a confirmed domain operation into a failed save. */
export function recordActivity(input:ActivityInput):Promise<void>{return serial(async()=>{
 try{await flush();}catch{storageWarning();}
 let event:ActivityEvent;
 try{event=normalizeActivity({...input,id:await identity(input.id||crypto.randomUUID()),at:input.at||new Date().toISOString(),source:input.source||'app'}) as ActivityEvent;}
 catch{warning='En händelse kunde inte registreras eftersom dess metadata var ogiltiga.';changed();return;}
 try{await store(retained.get(event.id)||event);retained.delete(event.id);if(!retained.size)warning='';}
 catch{if(!retained.has(event.id))retained.set(event.id,event);storageWarning();}
 changed();
});}

export function activityPage(query:ActivityQuery={}):Promise<ActivityPage>{return serial(async()=>{
 try{await flush();}catch{storageWarning();}
 const bridge=native();let local:ActivityEvent[]=[];
 try{local=await localEntries();}catch{if(typeof bridge?.activityPage!=='function'&&!retained.size)throw Error('Aktivitetsloggen kunde inte läsas.');storageWarning();}
 local.push(...retained.values());
 if(typeof bridge?.activityPage==='function'&&!local.length){
  const result=JSON.parse(bridge.activityPage(JSON.stringify(query)));
  if(!Array.isArray(result.items)||!Number.isFinite(result.total))throw Error('Aktivitetsloggen kunde inte läsas.');return result;
 }
 if(typeof bridge?.activityPage==='function'){
  let cursor:string|null=null;const remote:ActivityEvent[]=[];
  do{const page=JSON.parse(bridge.activityPage(JSON.stringify({limit:200,cursor})));if(!Array.isArray(page.items))throw Error('Aktivitetsloggen kunde inte läsas.');remote.push(...page.items);const next=page.nextCursor||null;if(next&&next===cursor)throw Error('Aktivitetsloggen gav en ogiltig sidmarkör.');cursor=next;}while(cursor);
  return queryActivity([...remote,...local],query) as ActivityPage;
 }
 return queryActivity(local,query) as ActivityPage;
});}

/** Export pages are immutable by identity; later events do not reorder already exported pages. */
export async function exportActivity():Promise<Blob>{
 const parts:BlobPart[]=[JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),type:'NexusHubActivityExport'})+'\n'];
 let cursor:string|null=null;
 do{const page=await activityPage({limit:200,cursor});for(const event of page.items)parts.push(JSON.stringify(event)+'\n');cursor=page.nextCursor;}while(cursor);
 return new Blob(parts,{type:'application/x-ndjson;charset=utf-8'});
}
