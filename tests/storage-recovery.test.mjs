import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {pendingIntentFor,newIntentId} from '../lib/outbox-identity.mjs';
import {sameIdea} from '../lib/ideas.mjs';
import {createMirrorWriteBarrier} from '../lib/mirror-write-barrier.mjs';
import {localFirstReader,cacheCommitter,compatibleMutationModel} from '../lib/local-first.mjs';
import {replicaView} from '../lib/replica-projections.mjs';
let sequence=0;
async function load(file,bindings){
 const slot='__storageRecovery'+sequence++;globalThis[slot]=bindings;
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export \{.*\} from .*;\n/gm,'');
 const script='const {'+Object.keys(bindings).join(',')+'}=globalThis.'+slot+';\n'+source;
 return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
}
function environment(kv=new Map()){
 globalThis.location={origin:'https://nexus.test',href:'https://nexus.test/'};globalThis.window=new EventTarget();globalThis.CustomEvent=class extends Event{constructor(type,options){super(type);this.detail=options?.detail;}};
 return {kv,telemetry(){},bucketDuration(){},categoryForPath(){},resourceForPath(){},errorCategory(){},confirmedActions(){return[];},queuedEditMatches(){return false;},sameIdea,pendingIntentFor,newIntentId,catalogReconciledReceipt(){return null;},initializeStorage:async()=>{},durableGet:async k=>structuredClone(kv.get(k)),durableSet:async(k,v)=>{kv.set(k,structuredClone(v));},durableDelete:async k=>{kv.delete(k);},durableEntries:async prefix=>structuredClone([...kv.entries()].filter(([k])=>k.startsWith(prefix)))};
}
const request=(path,input,method='POST')=>new Request('https://nexus.test'+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const idea={id:'12345678-1234-4123-8123-123456789abc',text:'Complete original',status:'new',schemaVersion:1,createdAt:'2026-11-01T00:00:00.000Z',updatedAt:'2026-11-01T00:00:00.000Z'};
test('receipt retry after restart returns exact route body, status and headers without another write',async()=>{
 const env=environment();let sends=0;
 let outbox=await load('platform/outbox.ts',env);
 const result={saved:true,idea,sha:'a'.repeat(40),commit:'b'.repeat(40),warning:'Mirror catches up later'};
 outbox.configureOutbox(async()=>{sends++;return Response.json(result,{status:201,headers:{'X-Route-Receipt':'complete'}});},async()=>{throw Error('process interrupted before integration');});
 assert.equal((await outbox.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}))).status,503);
 outbox=await load('platform/outbox.ts',env);outbox.configureOutbox(async()=>{sends++;throw Error('must not resend');},async()=>{});
 const replay=await outbox.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}));
 assert.deepEqual(await replay.json(),result);assert.equal(replay.status,201);assert.equal(replay.headers.get('X-Route-Receipt'),'complete');assert.equal(sends,1);assert.equal((await outbox.pendingWrites()).length,0);
});
test('legacy incomplete receipt recovers complete idea through fresh read and retains work when unavailable',async()=>{
 const env=environment();const first=await load('platform/outbox.ts',env);first.configureOutbox(async()=>{throw Error('response lost');});
 await first.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}));
 const [item]=await first.pendingWrites();env.kv.set('outbox-receipt:v1:'+item.id,{status:200,path:'/api/ideas',completedAt:'2026-11-01',commit:'b'.repeat(40),integrated:true});
 let writes=0;const next=await load('platform/outbox.ts',env);next.configureOutbox(async req=>{if(req.method!=='GET'){writes++;throw Error('must never replay an acknowledged legacy write');}return Response.json({error:'offline'},{status:503});});
 assert.equal((await next.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}))).status,503);assert.equal((await next.pendingWrites()).length,1);assert.equal(writes,0);
 next.configureOutbox(async()=>Response.json({idea,sha:'c'.repeat(40)}));
 const recovered=await (await next.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}))).json();assert.deepEqual(recovered.idea,idea);assert.equal(recovered.sha,'c'.repeat(40));assert.equal(writes,0);
});
test('lost todos response is reconciled with full data through the original public outbox API',async()=>{
 const env=environment(),outbox=await load('platform/outbox.ts',env),data={schemaVersion:1,items:[]};let writes=0;
 outbox.configureOutbox(async req=>{if(req.method==='POST'){writes++;throw Error('response lost');}return Response.json({data,sha:'a'.repeat(40)});});
 assert.equal(outbox.isQueuedMutation(request('/api/todos',{data,expectedSha:null})),true);
 await outbox.enqueueMutation(request('/api/todos',{data,expectedSha:null}));
 const replay=await (await outbox.enqueueMutation(request('/api/todos',{data,expectedSha:null}))).json();assert.deepEqual(replay.data,data);assert.equal(replay.saved,true);assert.equal(writes,1);
});
async function apiEnvironment(env,extra={}){
 const routes=Object.fromEntries(['trainingArchive','connections','additions','calendar','watchSettings','watchHistory','dailyActivity','todos','incoming','ideaFiles','ideaPlans','ideas','films','series','media','stories','storyStatus','bookmarks','posters','economy','fallback'].map(name=>[name,{}]));
 globalThis.fetch=async()=>{throw Error('unexpected external network');};
 const outbox=await load('platform/outbox.ts',env);
 const api=await load('platform/api.ts',{...env,...routes,...outbox,auditMutation:(_req,run)=>run(),observeSnapshot:async()=>{},localFirstReader,cacheCommitter,compatibleMutationModel,createMirrorWriteBarrier,replicaReader:{current:async()=>({commit:'0'.repeat(40)})},github:()=>({head:async()=>{throw Error('offline');},isAncestor:async()=>false}),localReadSeed:async()=>({register:{films:['OLD']},sha:'0'.repeat(40)}),...extra});
 api.installLocalApi();return outbox;
}
test('first fetch waits for receipt restoration and blocks stale media derivatives after restart',async()=>{
 const env=environment();env.kv.set('outbox-receipt:v1:media',{path:'/api/media-register',commit:'1'.repeat(40),completedAt:'2026-11-01'});
 let release;const gate=new Promise(resolve=>release=resolve);let scanned=false;
 const entries=env.durableEntries;env.durableEntries=async prefix=>{if(prefix==='outbox-receipt:v1:'){scanned=true;await gate;}return entries(prefix);};
 await apiEnvironment(env,{films:{GET:async()=>Response.json({error:'offline'},{status:503})}});
 const first=fetch('/api/films');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(scanned,true);release();
 const response=await first;assert.equal(response.status,503);assert.notEqual(response.headers.get('X-Nexus-Local'),'true');
});
test('receipt durably lists every affected read resource before integration may crash',async()=>{
 const env=environment();const outbox=await load('platform/outbox.ts',env);outbox.configureOutbox(async()=>Response.json({saved:true,register:{films:[]},commit:'a'.repeat(40)}),async()=>{throw Error('interrupted');});
 await outbox.enqueueMutation(request('/api/media-register',{kind:'films',edits:[{target:'tt1234567',changes:{title:'new'}}]}));
 const [[,receipt]]=await env.durableEntries('outbox-receipt:v1:');assert.ok(receipt.affectedResources.includes('/api/films'));assert.ok(receipt.affectedResources.includes('/api/portal/overview'));
});
test('Plugins overview metadata and package manifests share one immutable snapshot',async()=>{
 const commit='0'.repeat(40);let reads=0;
 const reader={current:async repo=>repo==='databas'?{commit:'d'.repeat(40),files:[]}:{commit:reads++===0?commit:'1'.repeat(40),files:[{path:'catalog.json'},{path:'one/.codex-plugin/plugin.json'}]},json:async(_repo,path,pinned)=>path==='catalog.json'?{plugins:[]}:{version:pinned.commit===commit?'original':'newer'},file:async()=>null};
 const overview=await replicaView('/api/portal/overview',new URLSearchParams(),reader);assert.equal(overview.repositories.plugins.commit,commit);assert.equal(overview.repositories.plugins.packages[0].version,'original');assert.equal(reads,1);
});

test('explicit idea deletion retains its complete receipt and never automatically replays offline intent',async()=>{
 const env=environment();let calls=0;let outbox=await load('platform/outbox.ts',env);
 outbox.configureOutbox(async()=>{calls++;throw Error('offline');});
 const input={id:idea.id,expectedSha:'a'.repeat(40)};
 assert.equal(outbox.isQueuedMutation(request('/api/ideas',input,'DELETE')),true);
 await outbox.enqueueMutation(request('/api/ideas',input,'DELETE'));
 await outbox.retryPendingWrites();assert.equal(calls,1,'deletion requires explicit retry');
 outbox.configureOutbox(async req=>{assert.equal(req.method,'GET');return Response.json({error:'missing'},{status:404});});
 const response=await (await outbox.enqueueMutation(request('/api/ideas',input,'DELETE'))).json();assert.equal(response.deleted,true);assert.equal(response.id,idea.id);
});

test('unvalidated successful transport response does not discard the durable user intent',async()=>{
 const env=environment(),outbox=await load('platform/outbox.ts',env);
 outbox.configureOutbox(async()=>Response.json({source:'partial'}));
 const response=await outbox.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}));
 assert.equal(response.status,503);assert.equal((await outbox.pendingWrites()).length,1);assert.equal((await env.durableEntries('outbox-receipt:v1:')).length,0);
});

test('actual todos route and GitHub contract survive local integration crash and app restart',async()=>{
 const {personalGithub}=await import('../lib/personal-github.mjs');
 const {gitBlobSha}=await import('../lib/github-inbox.mjs');
 const env=environment();let remote=null,puts=0;
 const commit='c'.repeat(40),data={schemaVersion:1,items:[{id:idea.id,text:'Preserved task',done:false}]};
 const client=personalGithub('lobbamannen/Databas',async(_url,init)=>{
   if(init?.method==='PUT'){
     puts++;const input=JSON.parse(init.body);remote={bytes:Uint8Array.from(atob(input.content),c=>c.charCodeAt(0))};remote.sha=await gitBlobSha(remote.bytes);
     return Response.json({content:{sha:remote.sha},commit:{sha:commit}});
   }
   return remote?Response.json({content:Buffer.from(remote.bytes).toString('base64'),sha:remote.sha}):Response.json({error:'missing'},{status:404});
 },gitBlobSha,bytes=>Buffer.from(bytes).toString('base64'));
 const todos=await load('app/api/todos/route.ts',{github:()=>client});
 const cacheKey='api-read:v1:/api/todos';env.kv.set(cacheKey,{body:new TextEncoder().encode('{}').buffer,status:200,headers:[],savedAt:'before'});
 const remove=env.durableDelete;let fail=true;
 env.durableDelete=async key=>{if(key===cacheKey&&fail)throw Error('process death before cache integration');return remove(key);};
 await apiEnvironment(env,{todos,github:()=>({...client,head:async()=>commit,isAncestor:async()=>false})});
 const first=await fetch('/api/todos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data,expectedSha:null})});assert.equal(first.status,503);
 const [[,receipt]]=await env.durableEntries('outbox-receipt:v1:');assert.equal(receipt.commit,commit);assert.ok(receipt.affectedResources.includes('/api/todos'));assert.equal(puts,1);
 fail=false;await apiEnvironment(env,{todos,github:()=>({...client,head:async()=>commit,isAncestor:async()=>false})});
 const replay=await fetch('/api/todos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data,expectedSha:null})});
 const complete=await replay.json();assert.equal(replay.status,200);assert.equal(complete.saved,true);assert.deepEqual(complete.data,data);assert.equal(complete.sha,remote.sha);assert.equal(complete.commit,commit);assert.equal(puts,1);
});

test('startup restores a complete durable mutation model for offline reads when the mirror is older',async()=>{
 const env=environment();const register={films:[{title:'Saved original'}]},result={saved:true,register,sha:'a'.repeat(40),commit:'1'.repeat(40)};
 env.kv.set('outbox-receipt:v1:media',{status:200,path:'/api/media-register',affectedResources:['/api/media-register','/api/films','/api/portal/overview'],completedAt:'2026-11-01T00:00:00.000Z',commit:result.commit,response:{body:JSON.stringify(result),headers:[['Content-Type','application/json']]}});
 await apiEnvironment(env,{films:{GET:async()=>Response.json({error:'offline'},{status:503})}});
 const response=await fetch('/api/films');assert.equal(response.status,200);assert.deepEqual((await response.json()).register,register);assert.equal(response.headers.get('X-Nexus-Local'),'true');
});

test('receipt sequence chooses the latest resource acknowledgement when wall-clock timestamps collide',async()=>{
 const env=environment(),completedAt='2026-11-01T00:00:00.000Z';
 for(const [sequence,label] of [[1,'older'],[2,'latest']])env.kv.set('outbox-receipt:v1:'+sequence,{status:200,path:'/api/films',affectedResources:['/api/films'],sequence,completedAt,commit:String(sequence).repeat(40),response:{body:JSON.stringify({saved:true,sha:'a'.repeat(40),register:{films:[label]}}),headers:[]}});
 await apiEnvironment(env,{films:{GET:async()=>Response.json({error:'offline'},{status:503})}});
 const response=await fetch('/api/films');assert.deepEqual((await response.json()).register.films,['latest']);
});

test('an acknowledgement without the ideas route model cannot be stored as a complete receipt',async()=>{
 const env=environment(),outbox=await load('platform/outbox.ts',env);
 outbox.configureOutbox(async()=>Response.json({saved:true,sha:'a'.repeat(40)}));
 const response=await outbox.enqueueMutation(request('/api/ideas',{idea,expectedSha:null}));assert.equal(response.status,503);assert.equal((await outbox.pendingWrites()).length,1);
});

test('a late pre-integration read timestamp cannot outrank the durable receipt sequence after restart',async()=>{
 const env=environment(),commit='1'.repeat(40),completedAt='2026-11-01T00:00:00.000Z';
 env.kv.set('outbox-receipt:v1:latest',{status:200,path:'/api/films',sequence:4,completedAt,commit,affectedResources:['/api/films'],response:{body:JSON.stringify({saved:true,register:{films:['saved']}}),headers:[]}});
 env.kv.set('api-read:v1:/api/films',{status:200,body:new TextEncoder().encode(JSON.stringify({register:{films:['stale in-flight read']}})).buffer,headers:[],savedAt:'2026-11-01T00:00:01.000Z',confirmedThrough:3});
 await apiEnvironment(env,{films:{GET:async()=>Response.json({error:'offline'},{status:503})}});
 assert.deepEqual((await (await fetch('/api/films')).json()).register.films,['saved']);
});

test('failed cache integration cannot expose a pre-write cache through a live write fence',async()=>{
 const env=environment(),old={register:{films:['pre-write']}};
 env.kv.set('api-read:v1:/api/films',{status:200,body:new TextEncoder().encode(JSON.stringify(old)).buffer,headers:[],savedAt:'2026-10-31',confirmedThrough:0});
 const remove=env.durableDelete;env.durableDelete=async key=>{if(key==='api-read:v1:/api/films')throw Error('disk transaction failed');return remove(key);};
 await apiEnvironment(env,{films:{POST:async()=>Response.json({saved:true,register:{films:['saved']},commit:'1'.repeat(40)}),GET:async()=>Response.json({error:'offline'},{status:503})}});
 assert.equal((await fetch('/api/films',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,503);
 assert.equal((await fetch('/api/films')).status,503);
});
test('retrying an older integration never regresses a newer resource fence or cached model',async()=>{
 const env=environment(),key='api-read:v1:/api/films';let fail=true,write=0;
 env.kv.set(key,{status:200,body:new TextEncoder().encode('{}').buffer,headers:[],savedAt:'before',confirmedThrough:0});
 const remove=env.durableDelete;env.durableDelete=async k=>{if(k===key&&fail)throw Error('interrupted integration');return remove(k)};
 const outbox=await apiEnvironment(env,{films:{POST:async()=>{write++;return Response.json({saved:true,register:{films:[write===1?'A':'B']},commit:String(write).repeat(40)})},GET:async()=>Response.json({error:'offline'},{status:503})}});
 assert.equal((await fetch('/api/films',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({film:{imdbId:'tt1000001'}})})).status,503);
 const [older]=await outbox.pendingWrites();fail=false;
 assert.equal((await fetch('/api/films',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({film:{imdbId:'tt1000002'}})})).status,200);
 await outbox.retryPendingWrites(older.id);
 assert.equal(write,2);assert.deepEqual((await (await fetch('/api/films')).json()).register.films,['B']);
 assert.equal(env.kv.get(key).confirmedThrough,2);
});
