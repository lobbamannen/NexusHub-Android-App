import {db,bucket,sha256,now} from './store';
import {gitBlobSha} from './github-inbox.mjs';
import {repairMirrorVersion} from './mirror';

const REPO='databas';
const LIMIT=10*1024*1024;
const STATUS_KEY='mirror_audit_state:'+REPO;
const SNAPSHOT_KEY='mirror_audit_snapshot:'+REPO;
const LOCK_KEY='mirror_audit_lock:'+REPO;
const STATES=['ok','unmirrored','outdated','missing','corrupt','oversized','unknown'] as const;
type Status=typeof STATES[number];
type AuditFile={path:string,sha:string,size:number,ref?:string,historical?:boolean};
type Issue={path:string,sha:string,size:number,state:Status,reason:string,ref?:string,historical?:boolean,attempts?:number,repaired?:boolean};
type AuditState={runId:string,commit:string,startedAt:string,updatedAt:string,done:boolean,cursor:number,total:number,counts:Record<string,number>,issues:Issue[],repaired:number,repairFailures:number,bytesChecked:number};

async function readValue<T>(key:string):Promise<T|null>{
 const row=await db().prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{value:string}>();
 return row?JSON.parse(row.value) as T:null;
}
async function putValue(key:string,value:unknown){
 await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value)).run();
}
const counters=()=>Object.fromEntries(STATES.map(status=>[status,0])) as Record<string,number>;
async function lease<T>(operation:()=>Promise<T>):Promise<T|{busy:true}>{
 const owner=crypto.randomUUID(),start=Date.now();
 const result=await db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.started') AS INTEGER) < ?").bind(LOCK_KEY,JSON.stringify({owner,started:start}),start-180000).run();
 if(!result.meta.changes)return {busy:true};
 try{
  const output=await operation();
  const row=await readValue<{owner:string}>(LOCK_KEY);
  if(!row||row.owner!==owner)throw Error('Kontrollåtgärdens lås löpte ut. Försök igen.');
  return output;
 }finally{await db().prepare("DELETE FROM settings WHERE key=? AND json_extract(value,'$.owner')=?").bind(LOCK_KEY,owner).run();}
}
export async function mirrorAuditStatus({offset=0,filter='all'}:{offset?:number,filter?:string}={}){
 const state=await readValue<AuditState>(STATUS_KEY);
 if(!state)return {exists:false,busy:false,items:[],issueTotal:0,counts:counters()};
 const unresolved=state.issues.filter(x=>x.state!=='ok');
 const issues=filter==='all'?unresolved:filter==='repaired'?state.issues.filter(x=>x.repaired):unresolved.filter(x=>x.state===filter);
 const safeOffset=Math.min(Math.max(0,Math.floor(offset)),issues.length);
 return {exists:true,runId:state.runId,commit:state.commit,startedAt:state.startedAt,updatedAt:state.updatedAt,done:state.done,cursor:state.cursor,total:state.total,counts:state.counts,repaired:state.repaired,repairFailures:state.repairFailures,bytesChecked:state.bytesChecked,issueTotal:issues.length,allIssueTotal:unresolved.length,repairPending:state.issues.filter(x=>['unmirrored','outdated','missing','corrupt'].includes(x.state)&&!x.attempts).length,repairRetryable:state.issues.filter(x=>['unmirrored','outdated','missing','corrupt'].includes(x.state)&&!!x.attempts).length,items:issues.slice(safeOffset,safeOffset+50),offset:safeOffset,filter,busy:false};
}
export async function beginMirrorAudit(client:any,restart=false){
 const done=await lease(async()=>{
  const current=await readValue<AuditState>(STATUS_KEY);
  if(current&&!current.done&&!restart)return;
  const remote=await client.snapshot();
  if(remote.truncated)throw Error('GitHub returnerade ett ofullständigt filträd. Ingen kontroll startades.');
  if(!/^[a-f0-9]{40}$/.test(remote.commit||''))throw Error('Ogiltig GitHub-snapshot.');
  const files:AuditFile[]=remote.tree.filter((x:any)=>x.type==='blob').map((x:any)=>({path:x.path,sha:x.sha,size:x.size,ref:remote.commit,historical:false}));
  // Retained old mirror versions are real local originals, even when GitHub's
  // current tree no longer contains that historical path/blob combination.
  const retained=(await db().prepare('SELECT path,blob_sha,commit_sha,size FROM mirror_versions WHERE repo=?').bind(REPO).all()).results as any[];
  const currentVersions=new Set(files.map(f=>f.path+'\\0'+f.sha));
  for(const row of retained){if(!currentVersions.has(row.path+'\\0'+row.blob_sha))files.push({path:row.path,sha:row.blob_sha,size:row.size,ref:row.commit_sha,historical:true});}
  if(!files.length||files.length>20000||files.some(f=>typeof f.path!=='string'||!/^[a-f0-9]{40}$/.test(f.sha)||!Number.isSafeInteger(f.size)||f.size<0))throw Error('GitHubs filträd kunde inte verifieras.');
  const timestamp=now();
  const state:AuditState={runId:crypto.randomUUID(),commit:remote.commit,startedAt:timestamp,updatedAt:timestamp,done:false,cursor:0,total:files.length,counts:counters(),issues:[],repaired:0,repairFailures:0,bytesChecked:0};
  // Atomic checkpoint: never interpret an old snapshot with a new cursor.
  await db().batch([
   db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(SNAPSHOT_KEY,JSON.stringify({runId:state.runId,commit:state.commit,files})),
   db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(STATUS_KEY,JSON.stringify(state))
  ]);
 });
 if((done as any)?.busy)return {...await mirrorAuditStatus(),busy:true};
 return mirrorAuditStatus();
}
async function inspect(file:AuditFile,rows:any[]):Promise<{state:Status,reason:string,bytesChecked:number}>{
 if(file.size>LIMIT)return {state:'oversized',reason:'Filen är större än nuvarande säkerhetsgräns på 10 MiB och har inte byteverifierats.',bytesChecked:0};
 const exact=rows.find(x=>x.blob_sha===file.sha);
 if(!exact)return {state:rows.length?'outdated':'unmirrored',reason:rows.length?'En äldre GitHub-version finns, men den aktuella saknar lokal spegel.':'Ingen spegelversion registrerad för denna fil.',bytesChecked:0};
 try{
  const object=await bucket().get(exact.object_key);
  if(!object)return {state:'missing',reason:'D1 har en spegelpost men R2-originalfilen saknas.',bytesChecked:0};
  const bytes=await object.arrayBuffer();
  if(bytes.byteLength!==file.size||bytes.byteLength!==exact.size)return {state:'corrupt',reason:'Storleken på det verkliga R2-innehållet avviker.',bytesChecked:bytes.byteLength};
  if(await sha256(bytes)!==exact.content_hash)return {state:'corrupt',reason:'SHA-256 för de verkliga R2-bytesen skiljer sig från den registrerade kontrollsumman.',bytesChecked:bytes.byteLength};
  if(await gitBlobSha(bytes)!==file.sha)return {state:'corrupt',reason:'R2-bytesen matchar inte GitHubs blob-SHA.',bytesChecked:bytes.byteLength};
  return {state:'ok',reason:'Verkliga R2-bytes verifierade mot GitHub SHA-1 och registrerad SHA-256.',bytesChecked:bytes.byteLength};
 }catch(e:any){return {state:'unknown',reason:'R2-kontrollen kunde inte slutföras: '+String(e.message||e).slice(0,160),bytesChecked:0};}
}
export async function nextMirrorAuditBatch(batchSize=12){
 const output=await lease(async()=>{
  const state=await readValue<AuditState>(STATUS_KEY),snapshot=await readValue<{runId:string,commit:string,files:AuditFile[]}>(SNAPSHOT_KEY);
  if(!state||!snapshot||state.runId!==snapshot.runId||state.commit!==snapshot.commit)throw Error('Kontrollens snapshot saknas eller är inkonsekvent. Starta om kontrollen.');
  if(state.done)return;
  const files=snapshot.files.slice(state.cursor,state.cursor+Math.min(16,Math.max(1,Math.floor(batchSize))));
  // Read D1 versions in one bounded batch and check each actual R2 object.
  const queries=files.map(f=>db().prepare('SELECT blob_sha,object_key,content_hash,size FROM mirror_versions WHERE repo=? AND path=? ORDER BY verified_at DESC').bind(REPO,f.path));
  const results:any[]=queries.length?await db().batch(queries) as any[]:[];
  for(let i=0;i<files.length;i++){
   const file=files[i],outcome=await inspect(file,results[i]?.results||[]);
   state.counts[outcome.state]=(state.counts[outcome.state]||0)+1;
   state.bytesChecked+=outcome.bytesChecked;
   if(outcome.state!=='ok')state.issues.push({path:file.path,sha:file.sha,size:file.size,ref:file.ref,historical:!!file.historical,state:outcome.state,reason:outcome.reason});
  }
  state.cursor+=files.length;state.done=state.cursor>=state.total;state.updatedAt=now();
  await putValue(STATUS_KEY,state);
 });
 if((output as any)?.busy)return {...await mirrorAuditStatus(),busy:true};
 return mirrorAuditStatus();
}
export async function repairMirrorAuditBatch(client:any,batchSize=4){
 const output=await lease(async()=>{
  const state=await readValue<AuditState>(STATUS_KEY),snapshot=await readValue<{runId:string,commit:string,files:AuditFile[]}>(SNAPSHOT_KEY);
  if(!state?.done||!snapshot||state.runId!==snapshot.runId||state.commit!==snapshot.commit)throw Error('Slutför kontrollen före reparation.');
  const eligible=new Set(['unmirrored','outdated','missing','corrupt']);
  const pending=state.issues.filter(issue=>eligible.has(issue.state)&&!issue.attempts).slice(0,Math.min(6,Math.max(1,Math.floor(batchSize))));
  for(const issue of pending){
   issue.attempts=1;
   try{
    const originRef=issue.ref||state.commit;
    if(!/^[a-f0-9]{40}$/.test(originRef))throw Error('Historisk GitHub-commit saknas. Lokal historik lämnades orörd.');
    const original=await client.original(issue.path,originRef);
    const bytes=await original.response.arrayBuffer();
    const file={path:issue.path,sha:issue.sha,size:issue.size};
    if(bytes.byteLength!==file.size||await gitBlobSha(bytes)!==file.sha)throw Error('Det hämtade GitHub-originalet matchar inte snapshot.');
    await repairMirrorVersion(REPO,file,bytes,originRef);
    const row=(await db().prepare('SELECT blob_sha,object_key,content_hash,size FROM mirror_versions WHERE repo=? AND path=? AND blob_sha=?').bind(REPO,issue.path,issue.sha).all()).results;
    const verified=await inspect(file,row);
    if(verified.state!=='ok')throw Error('Lokal R2-kopia kunde inte verifieras efter reparation: '+verified.reason);
    state.counts[issue.state]--;state.counts.ok++;state.bytesChecked+=verified.bytesChecked;
    issue.state='ok';issue.reason='Reparerad från GitHub, R2-bytes kontrollerade efter skrivningen.';issue.repaired=true;
    state.repaired++;
   }catch(e:any){issue.reason='Reparation misslyckades: '+String(e.message||e).slice(0,160);state.repairFailures++;}
  }
  state.updatedAt=now();await putValue(STATUS_KEY,state);
 });
 if((output as any)?.busy)return {...await mirrorAuditStatus(),busy:true};
 return mirrorAuditStatus();
}

// Explicit retry only: failed repairs are not silently hammered by auto-loop.
export async function retryMirrorAuditRepairs(){
 const output=await lease(async()=>{const state=await readValue<AuditState>(STATUS_KEY);if(!state?.done)throw Error('Slutför integritetskontrollen först.');for(const issue of state.issues)if(['unmirrored','outdated','missing','corrupt'].includes(issue.state)&&issue.attempts)issue.attempts=0;state.updatedAt=now();await putValue(STATUS_KEY,state);});
 if((output as any)?.busy)return {...await mirrorAuditStatus(),busy:true};
 return mirrorAuditStatus();
}
