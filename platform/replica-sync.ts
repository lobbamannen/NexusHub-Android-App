import { github, invalidatePortalCache } from '@/lib/github';
import { saveMirrorBatch } from '@/lib/mirror';
import { bucket, db } from '@/lib/store';
import { durableGet, durableSet } from './local-store';
import { hasGithubToken } from './env';
import { invalidateMedia } from '@/lib/media-client';
import { gitBlobSha } from '@/lib/github-inbox.mjs';
import { planReplica } from '@/lib/replica-plan.mjs';

type File = { path:string; sha:string; size:number; type?:string };
export type RepoReplica = {commit:string; total:number; done:number; totalBytes:number; doneBytes:number; failed:number; checkedAt?:string};
export type ReplicaStatus = {running:boolean; done:number; total:number; phase?:'checking'|'downloading'|'refreshing'; repo?:string; currentPath?:string; paused?:boolean; checkedAt?:string; error?:string; repositories:Record<string,RepoReplica>};
let state:ReplicaStatus={running:false,done:0,total:0,repositories:{}};
let active:Promise<void>|null=null,installed=false,cooldown=0,paused=false,rescan=false,viewsDirty=false;
export const replicaStatus=()=>state;
const report=(patch:Partial<ReplicaStatus>)=>{state={...state,...patch};window.dispatchEvent(new Event('nexus-replica-status'));};
export const replicatePath=(_path:string)=>true;
const stop=()=>paused||document.visibilityState!=='visible';
export function pauseReplicaSync(){paused=true;report({paused:true});}
async function refreshViews(){
 invalidateMedia();invalidatePortalCache();
 // The completed mirror already holds these files; consumers rebuild their
 // projections locally instead of performing a second nine-route GitHub sweep.
 window.dispatchEvent(new Event('nexus-github-changed'));
}
async function cycle(force=false){
 if(!hasGithubToken()||stop()||(!force&&Date.now()<cooldown))return;
 report({running:true,paused:false,error:'',phase:'checking',currentPath:''});
 let changed=false;
 try{
  for(const repo of ['databas','plugins']){
   if(stop())return;
   report({repo,phase:'checking',currentPath:''});
   const client=github(repo),head=await client.head();
   const previous=await durableGet<{commit:string;at:string}>('replica-complete:v2:'+repo);
   if(!force&&previous?.commit===head&&state.repositories[repo]?.commit===head)continue;
   const snapshot=await client.snapshot();
   if(snapshot.truncated)throw Error('GitHub gav ett ofullständigt filträd. Ingen fullständig synk markeras.');
   const files:File[]=snapshot.tree.filter((f:File)=>f.type==='blob');
   const [versions,keys]=await Promise.all([db().prepare('SELECT path,blob_sha,object_key FROM mirror_versions WHERE repo=?').bind(repo).all(),bucket().keys('mirror/')]);
   const plan=planReplica(files,versions.results,keys,repo);
   let progress:RepoReplica={commit:snapshot.commit,total:plan.total,done:plan.done,totalBytes:plan.totalBytes,doneBytes:plan.doneBytes,failed:0};
   const update=()=>report({done:progress.done,total:progress.total,repositories:{...state.repositories,[repo]:{...progress}}});
   update();
   await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mirror_manifest:'+repo,JSON.stringify({commit:snapshot.commit,fetchedAt:snapshot.fetchedAt,files})).run();
   // Never announce a new revision before its bytes have been copied and verified.
   if(previous?.commit!==snapshot.commit){changed=true;viewsDirty=true;}
   const errors:Record<string,unknown>={};
   let headCheckedAt=Date.now();
   for(let offset=0;offset<plan.missing.length;offset+=4){
    if(stop())return;
    const batch=plan.missing.slice(offset,offset+4);
    report({phase:'downloading',currentPath:batch[0].path});
    const results=await Promise.allSettled(batch.map(async(file:File)=>{
     const cached=await bucket().get('mirror/'+repo+'/'+file.sha);
     let bytes=cached?await cached.arrayBuffer():null;
     if(!bytes||bytes.byteLength!==file.size||await gitBlobSha(bytes)!==file.sha)bytes=(await client.blob(file.sha)).buffer as ArrayBuffer;
     return {file:{...file,fetchedAt:snapshot.fetchedAt},bytes};
    }));
    const good:Array<{file:File;bytes:ArrayBuffer}>=[];
    let fatal:Error|undefined;
    for(let i=0;i<results.length;i++){
     const result=results[i];
     if(result.status==='fulfilled')good.push(result.value);
     else{if([401,403,429].includes(result.reason?.status))fatal=result.reason;errors[batch[i].path]={sha:batch[i].sha,error:result.reason?.message||String(result.reason)};progress.failed++;}
    }
    await saveMirrorBatch(repo,good,snapshot.commit);
    progress.done+=good.length;progress.doneBytes+=good.reduce((sum,item)=>sum+item.file.size,0);update();
    if(progress.failed)await durableSet('replica-errors:v1:'+repo,errors);
    if(fatal)throw fatal;
    if(Date.now()-headCheckedAt>15000){headCheckedAt=Date.now();if(await client.head()!==snapshot.commit){rescan=true;return;}}
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(stop())return;
   if(progress.failed)throw Error(progress.failed+' filer kunde inte hämtas. Övriga filer har sparats. Tryck Försök igen. '+Object.values(errors).map((e:any)=>e.error)[0]);
   progress.checkedAt=new Date().toISOString();update();
   await durableSet('replica-inventory:v1:'+repo,{commit:snapshot.commit,files});
   await durableSet('replica-recent:v1:'+repo,{commit:snapshot.commit,recent:snapshot.recent||[]});
   await durableSet('replica-complete:v2:'+repo,{commit:snapshot.commit,at:progress.checkedAt});
   await durableSet('replica-errors:v1:'+repo,{});
   // Retire stale failures from the former 20-file worker after successful copying.
   await db().batch(['mirror_error:','mirror_file_errors:'].map(prefix=>db().prepare('DELETE FROM settings WHERE key=?').bind(prefix+repo)));
  }
  if(changed||viewsDirty){report({phase:'refreshing',currentPath:''});await refreshViews();if(!stop())viewsDirty=false;}
  if(stop())return;
  report({checkedAt:new Date().toISOString(),error:'',currentPath:''});
 }catch(error:any){cooldown=Date.now()+60000;report({error:error.message||'Lokal kopiering kunde inte slutföras.'});}
 finally{report({running:false,paused,phase:undefined});}
}
function run(force=false):Promise<void>{
 if(active)return active;
 active=cycle(force).finally(()=>{active=null;if(rescan){rescan=false;window.setTimeout(()=>void run(),0);}});return active;
}
export function syncReplicaNow(){paused=false;cooldown=0;report({paused:false});return run(true);}
export function startReplicaSync(){
 if(installed)return;installed=true;void run();
 window.setInterval(()=>void run(),15000);
 const wake=()=>{cooldown=0;void run();};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wake();});
 window.addEventListener('online',wake);window.addEventListener('nexus-credentials-changed',()=>{paused=false;wake();});window.addEventListener('nexus-write-completed',wake);
}
