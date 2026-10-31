import {nativeIntakeAvailable,stageBackgroundIncoming,backgroundIncomingJobs,cancelBackgroundIncoming} from './incoming-background';
import {beginBackgroundWork} from './background-work';
import {recordActivity} from './activity';
import {pastedTextDocument} from '@/lib/pasted-text.mjs';
import {durableGet,durableSet,durableEntries,durableDelete} from './local-store';
import {base64,gitBlobSha} from '@/lib/github-inbox.mjs';
export type IncomingFile={id:string;name:string;mime:string;blob?:Blob;error?:string;sha?:string};
export type SharedReceipt={entries:{path:string;sha:string}[];manifestSha:string;commit:string};
export type Incoming={sourceLabel?:string;id:string;text:string;createdAt:string;files:IncomingFile[];native?:boolean;destinations?:string[];sent:Record<string,{path:string;sha:string;commit?:string;processed?:boolean}>;error?:string;shared?:SharedReceipt;sharedError?:string;deleting?:boolean;localOnly?:boolean;nativeQueued?:boolean;nativeState?:string};
const bridge=()=>window.Android as any;
export async function incomingItems():Promise<Incoming[]>{
 const saved=new Map((await durableEntries<Incoming>('incoming:v1:')).map(([,item])=>[item.id,item]));
 const removed=new Set((await durableEntries('incoming-removed:v1:')).map(([key])=>key.slice('incoming-removed:v1:'.length)));
 const native=JSON.parse(bridge()?.listIncoming?.()||'[]');
 for(const item of native)if(!saved.has(item.id)&&!removed.has(item.id))saved.set(item.id,{...item,native:true,sent:{}});
 return [...saved.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function saveIncoming(files:File[],text='',destinations?:string[],sourceLabel?:string):Promise<Incoming>{
 const item:Incoming={...(sourceLabel?{sourceLabel}:{}),id:crypto.randomUUID(),text,createdAt:new Date().toISOString(),files:await Promise.all(files.map(async file=>{const bytes=new Uint8Array(await file.arrayBuffer());return {id:crypto.randomUUID(),name:file.name,mime:file.type||'application/octet-stream',blob:new Blob([bytes],{type:file.type||'application/octet-stream'}),sha:await gitBlobSha(bytes)};})),sent:{},localOnly:!!destinations?.length,...(destinations?{destinations:[...new Set(destinations)]}:{})};
 await durableSet('incoming:v1:'+item.id,item);
 try{if(await stageBackgroundIncoming(item)){item.nativeQueued=true;await durableSet('incoming:v1:'+item.id,item);}}catch(e:any){item.sharedError=e.message;await durableSet('incoming:v1:'+item.id,item);}
 await recordActivity({id:'incoming:'+item.id+':local',category:'inbox',action:'incoming.received',status:'local',source:'app',objectId:item.id,title:item.files[0]?.name||'Delad text',details:{files:item.files.map(f=>({id:f.id,name:f.name,sha:f.sha})),sourceLabel:item.sourceLabel}});
 window.dispatchEvent(new Event('nexus-incoming-changed'));return item;
}
/** Persist first. A pre-existing sync may have taken its local snapshot before this save. */
export async function savePastedText(text:string,source=''):Promise<Incoming>{
 const doc=pastedTextDocument(text,source,new Date().toISOString());
 const item=await saveIncoming([new File([doc.content],doc.name,{type:doc.mime})],'',undefined,doc.sourceLabel);
 if(nativeIntakeAvailable()){void syncIncoming();return item;}
 const previous=syncing;await syncIncoming();if(previous)await syncIncoming();
 // The commit already succeeded; a failed receipt read must not invite another save/UUID.
 return await durableGet<Incoming>('incoming:v1:'+item.id).catch(()=>undefined)||item;
}
export async function saveIncomingItem(item:Incoming){const old=await durableGet<Incoming>('incoming:v1:'+item.id);await durableSet('incoming:v1:'+item.id,{...item,...(old?.shared&&!item.shared?{shared:old.shared}:{}),...(old?.deleting?{deleting:true}:{})});window.dispatchEvent(new Event('nexus-incoming-changed'));}
const active=new Set<string>();
export async function deliverIncoming(item:Incoming,targets:string[]){
 if(item.deleting)throw Error('Posten väntar på radering.');
 if(active.has(item.id))throw Error('Överföringen pågår redan.');active.add(item.id);
 try{
  item.destinations=[...new Set([...(item.destinations||[]),...targets])];await saveIncomingItem(item);
  const files=[...item.files];
  // Stable pseudo-file ID makes retries of shared text create-only and duplicate-safe.
  if(item.text.trim())files.unshift({id:item.id,name:'delad-text.txt',mime:'text/plain',blob:new Blob([item.text],{type:'text/plain'})});
  for(const target of targets)for(const file of files){
   const key=target+':'+file.id;if(item.sent[key])continue;if(file.error)throw Error(file.error);
   let encoded:string;
   if(file.blob)encoded=base64(new Uint8Array(await file.blob.arrayBuffer()));
   else{encoded=await incomingFileBase64(item,file);}
   const response=await fetch('/api/incoming',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receiptId:item.id,fileId:file.id,name:file.name,base64:encoded,target:target==='inbox'?'inbox':'idea',ideaId:target.startsWith('idea:')?target.slice(5):undefined})});
   const result=await response.json();if(!response.ok||!result.saved)throw Error(result.error||'GitHub bekräftade inte filen.');
   item.sent[key]={path:result.path,sha:result.sha,...(result.commit?{commit:result.commit}:{}),...(result.processed?{processed:true}:{})};await saveIncomingItem(item);
  }
  item.error='';await saveIncomingItem(item);
 }catch(error:any){item.error=error.message;await saveIncomingItem(item);throw error;}finally{active.delete(item.id);}
}
export function incomingComplete(item:Incoming){const ids=[...item.files.map(f=>f.id),...(item.text.trim()?[item.id]:[])];return !!item.destinations?.length&&ids.length>0&&item.destinations.every(t=>ids.every(id=>!!item.sent[t+':'+id]));}
// Sharing-intake sync is separate from explicit idea/register saves.
export async function incomingFileBase64(item:Incoming,file:IncomingFile):Promise<string>{
 if(file.error)throw Error(file.error);
 if(file.blob)return base64(new Uint8Array(await file.blob.arrayBuffer()));
 const native=bridge()?.readIncomingFile?.(item.id,file.id);if(native)return native;
 throw Error('Den lokala filen kunde inte läsas. Originalet behålls.');
}
async function requestIncoming(method:string,body?:unknown,query=''){
 const r=await fetch('/api/incoming'+query,{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),data=await r.json();
 if(!r.ok)throw Error(data.error||'Mottagningssynken misslyckades.');return data;
}
async function forgetIncoming(item:Incoming){
 // Mark first so an interrupted native cleanup cannot resurrect the original.
 await durableSet('incoming-removed:v1:'+item.id,{removedAt:new Date().toISOString()});
 await cancelBackgroundIncoming(item.id);
 if(item.native&&bridge()?.removeIncoming?.(item.id)!==true)throw Error('GitHub-kopian är borta men det lokala originalet kunde inte rensas. Försök igen.');
 await durableDelete('incoming:v1:'+item.id);await recordActivity({id:'incoming:'+item.id+':removed',category:'inbox',action:'incoming.deleted',status:'succeeded',source:'app',objectId:item.id,title:item.files[0]?.name||'Mottagningspost'});window.dispatchEvent(new Event('nexus-incoming-changed'));
}
let syncing:Promise<void>|null=null;
export let incomingSyncError='';
export let incomingProgress:{running:boolean;currentId?:string;file?:number;total?:number}={running:false};
function progress(value:typeof incomingProgress){incomingProgress=value;window.dispatchEvent(new Event('nexus-incoming-progress'));}
export const incomingSyncRunning=()=>syncing!==null;
export function syncIncoming():Promise<void>{
 if(syncing)return syncing;
 const endWork=beginBackgroundWork('incoming');
 syncing=(async()=>{
  progress({running:true});
  const jobs=new Map(backgroundIncomingJobs().map(j=>[j.id,j]));
  if(jobs.size)for(const item of await incomingItems()){const job=jobs.get(item.id);if(!job||item.deleting)continue;if(job.receipt?.deleted||job.remoteDeleted){await forgetIncoming(item);continue;}if(job.state==='succeeded'&&job.receipt?.manifestSha&&Array.isArray(job.receipt.entries)){item.shared=job.receipt;item.sharedError='';item.nativeQueued=true;item.nativeState=job.state;await saveIncomingItem(item);}else if(job.error&&job.state!=='succeeded'){item.sharedError=job.error;item.nativeState=job.state;await saveIncomingItem(item);}}
  const remote=await requestIncoming('GET');if(!Array.isArray(remote.items))throw Error('Ofullständig mottagningslista.');
  const local=await incomingItems(),remoteById=new Map<string,any>(remote.items.map((x:any)=>[x.metadata.id,x]));
  for(const item of local){
   if(active.has(item.id))continue;
   const cloud=remoteById.get(item.id);
   progress({running:true,currentId:item.id});
   try{
    if(item.shared&&cloud?.legacyManifestSha===item.shared.manifestSha&&Array.isArray(cloud.legacyEntries)&&cloud.legacyEntries.length===item.shared.entries.length&&item.shared.entries.every(e=>cloud.legacyEntries.some((f:any)=>f.path===e.path&&f.sha===e.sha))){item.shared=receipt(cloud);await saveIncomingItem(item);}
    if(item.deleting){
     await cancelBackgroundIncoming(item.id);
     // Reconcile an upload with a lost reply before deleting an unacknowledged package.
     if(!item.shared&&cloud){const verified=await mirrorIncoming(item);if('deleted' in verified){await forgetIncoming(item);continue;}item.shared=verified;}
     const result=await requestIncoming('DELETE',{id:item.id,expected:item.shared?.entries||[]});if(!result.deleted)throw Error('GitHub bekräftade inte raderingen.');await forgetIncoming(item);continue;
    }
    if(item.shared&&!cloud){await forgetIncoming(item);continue;}
    if(item.shared&&cloud?.manifestSha!==item.shared.manifestSha){throw Error('Mottagningsposten har ändrats i GitHub. Originalet behålls lokalt.');}
    // Files selected in the idea editor remain local until its explicit Save.
    if(item.localOnly??!!item.destinations?.length)continue;
    if(nativeIntakeAvailable()&&!item.shared){const job=jobs.get(item.id);if(!job){await stageBackgroundIncoming(item);item.nativeQueued=true;await saveIncomingItem(item);}continue;}
    if(!item.shared){
     const duplicates=item.files.filter(f=>f.sha&&remote.items.some((r:any)=>r.metadata.id!==item.id&&r.metadata.files.some((x:any)=>x.sha===f.sha)));
     if(!cloud&&duplicates.length)throw Error('Identiskt dokument finns redan i NexusHub inkorg: '+duplicates.map(f=>f.name).join(', ')+'. Originalet finns kvar lokalt; ingen extra GitHub-kopia skapades.');
     const result=await mirrorIncoming(item);if('deleted' in result){await forgetIncoming(item);continue;}const latest=await durableGet<Incoming>('incoming:v1:'+item.id)||item;latest.shared=result;latest.sharedError='';await saveIncomingItem(latest);}
    else if(item.sharedError){item.sharedError='';await saveIncomingItem(item);}
   }catch(e:any){const latest=await durableGet<Incoming>('incoming:v1:'+item.id)||item;latest.sharedError=e.message;await saveIncomingItem(latest);}
  }
  const known=new Set(local.map(x=>x.id)),removed=new Set((await durableEntries('incoming-removed:v1:')).map(([key])=>key.slice('incoming-removed:v1:'.length)));
  for(const cloud of remote.items){const m=cloud.metadata;if(known.has(m.id)||removed.has(m.id))continue;
   const files:IncomingFile[]=[];for(const f of m.files){const data=await requestIncoming('GET',undefined,'?id='+encodeURIComponent(m.id)+'&fileId='+encodeURIComponent(f.id));if(data.sha!==f.sha)throw Error('Mottagningsfilen ändrades under hämtningen.');files.push({id:f.id,name:f.name,mime:f.mime,blob:new Blob([Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0))],{type:f.mime})});}
   await saveIncomingItem({...(m.sourceLabel?{sourceLabel:m.sourceLabel}:{}),id:m.id,text:m.text,createdAt:m.createdAt,files,sent:{},shared:receipt(cloud)});
  }
  incomingSyncError='';
 })().catch((e:any)=>{incomingSyncError=e.message;}).finally(()=>{endWork();syncing=null;progress({running:false});window.dispatchEvent(new Event('nexus-incoming-synced'));});return syncing;
}
const receipt=(cloud:any):SharedReceipt=>({entries:cloud.entries,manifestSha:cloud.manifestSha,commit:cloud.commit});
async function mirrorIncoming(item:Incoming){
 const files=[];for(const file of item.files){progress({running:true,currentId:item.id,file:files.length+1,total:item.files.length});files.push({id:file.id,name:file.name,mime:file.mime,base64:await incomingFileBase64(item,file)});}
 const result=await requestIncoming('POST',{operation:'mirror',item:{...(item.sourceLabel?{sourceLabel:item.sourceLabel}:{}),id:item.id,text:item.text,createdAt:item.createdAt,files}});
 if(result.deleted)return {deleted:true} as const;if(!result.saved)throw Error('GitHub-kopian kunde inte verifieras.');return receipt(result);
}
export async function removeIncoming(item:Incoming){
 if(active.has(item.id))throw Error('Vänta tills överföringen är klar innan du raderar.');
 const latest=await durableGet<Incoming>('incoming:v1:'+item.id)||item;latest.deleting=true;latest.sharedError='';await saveIncomingItem(latest);
 await cancelBackgroundIncoming(item.id);
 if(syncing)await syncing;
 if(active.has(item.id))throw Error('Vänta tills överföringen är klar innan du raderar.');
 await syncIncoming();
}

/** Queue a whole selection before synchronizing. Each item keeps its own durable
 * delete marker and conflict verification; unrelated destinations are untouched. */
export async function removeIncomingBatch(items:Incoming[]):Promise<{deleted:number;pending:number;failed:string[]}>{
 const chosen=[...new Map(items.map(item=>[item.id,item])).values()];
 if(!chosen.length)return {deleted:0,pending:0,failed:[]};
 const running=chosen.filter(item=>active.has(item.id));
 if(running.length)throw Error('Vänta tills pågående överföring är klar innan dessa poster raderas.');
 const registered:string[]=[];
 for(const item of chosen){
  const latest=await durableGet<Incoming>('incoming:v1:'+item.id)||item;
  latest.deleting=true;latest.sharedError='';
  await saveIncomingItem(latest);
  registered.push(item.id);
 }
 // Stop native upload workers only after every deletion intent is persisted.
 const cancellationErrors:string[]=[];
 for(const id of registered){
  try{await cancelBackgroundIncoming(id);}
  catch(e:any){cancellationErrors.push(id+': '+(e?.message||String(e)));}
 }
 // A running sync may have used an earlier snapshot. Always run one fresh pass.
 if(syncing)await syncing;
 await syncIncoming();
 const remaining=new Map((await incomingItems()).map(item=>[item.id,item]));
 const failed=chosen.flatMap(item=>{
  const current=remaining.get(item.id);
  if(!current)return [];
  return [item.files[0]?.name||item.id+': '+(current.sharedError||'Radering väntar på synkronisering')];
 });
 return {deleted:chosen.length-failed.length,pending:failed.length,failed:[...cancellationErrors,...failed]};
}

let intakeQueue:Promise<unknown>=Promise.resolve();
/** Content hashes, not filenames, decide whether a selected document already exists. */
export function intakeIncomingFiles(files:File[]){
 const task=intakeQueue.then(async()=>{
  const hashes=new Set<string>(),duplicates:string[]=[],errors:string[]=[],added:Incoming[]=[];
  const local=await incomingItems();
  for(const item of local)for(const file of item.files){try{const known=file.sha||item.shared?.entries.find(e=>e.path.includes('/'+file.id+'-'))?.sha;if(known)hashes.add(known);else{const bytes=Uint8Array.from(atob(await incomingFileBase64(item,file)),c=>c.charCodeAt(0));hashes.add(await gitBlobSha(bytes));}}catch{/* Unreadable originals are retained and reported by their own sync. */}}
  let remoteChecked=true;
  try{const remote=await requestIncoming('GET');for(const item of remote.items)for(const file of item.metadata.files)hashes.add(file.sha);}catch{remoteChecked=false;}
  for(const file of files){try{const bytes=new Uint8Array(await file.arrayBuffer()),hash=await gitBlobSha(bytes);if(hashes.has(hash)){duplicates.push(file.name);continue;}const stable=new File([bytes],file.name,{type:file.type});const item=await saveIncoming([stable]);added.push(item);hashes.add(hash);}catch(e:any){errors.push(file.name+': '+e.message);}}
  return {added,duplicates,errors,remoteChecked};
 });intakeQueue=task.catch(()=>{});return task;
}
