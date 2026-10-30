import {bucketDuration,bucketFiles,bucketBytes,errorCategory} from '../lib/telemetry.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';import {planReplica} from '../lib/replica-plan.mjs';import {gitBlobSha} from '../lib/github-inbox.mjs';
test('one sync worker reuses existing copies, downloads only changes, resumes and reports failures honestly',async()=>{
 const kv=new Map(),objects=new Map(),versions=[],calls=[];let files=[],commit='a'.repeat(40),failPath='',onBlob=null,keyScans=0;
 const make=async(path,text)=>{const bytes=new TextEncoder().encode(text);return{path,type:'blob',size:bytes.length,sha:await gitBlobSha(bytes),bytes};};
 for(let i=0;i<28;i++)files.push(await make('file-'+i+'.txt','Text '+i));
 for(const f of files.slice(0,25)){objects.set('mirror/databas/'+f.sha,f.bytes);versions.push({repo:'databas',path:f.path,blob_sha:f.sha,object_key:'mirror/databas/'+f.sha});}
 const client=repo=>({head:async()=>commit,snapshot:async()=>({commit,fetchedAt:new Date().toISOString(),tree:repo==='databas'?files:[],truncated:false}),blob:async sha=>{const file=files.find(f=>f.sha===sha);calls.push(file.path);onBlob?.();if(file.path===failPath)throw Error('Simulerat nätfel');return file.bytes;}});
 const db={prepare(){return{bind(repo){return{all:async()=>({results:versions.filter(v=>v.repo===repo)}),run:async()=>({})}}}},batch:async()=>{}};
 globalThis.window=new EventTarget();window.setTimeout=setTimeout;
 globalThis.document={visibilityState:'visible'};
 globalThis.fetch=async()=>new Response('{}');
 globalThis.__replicaTest={telemetry:()=>{},bucketDuration,bucketFiles,bucketBytes,errorCategory,github:client,invalidatePortalCache(){},saveMirrorBatch:async(repo,items)=>{for(const {file,bytes}of items){objects.set('mirror/'+repo+'/'+file.sha,new Uint8Array(bytes));versions.push({repo,path:file.path,blob_sha:file.sha,object_key:'mirror/'+repo+'/'+file.sha});}},bucket:()=>({keys:async()=>{keyScans++;return [...objects.keys()]},get:async key=>objects.has(key)?{arrayBuffer:async()=>objects.get(key).slice().buffer}:null}),db:()=>db,durableGet:async key=>kv.get(key),durableSet:async(key,value)=>kv.set(key,value),hasGithubToken:()=>true,invalidateMedia(){},planReplica,gitBlobSha};
 let source=readFileSync(new URL('../platform/replica-sync.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 source='const beginBackgroundWork=()=>()=>{};const observeFiles=async()=>{};const recordActivity=async()=>{};\nconst {telemetry,bucketDuration,bucketFiles,bucketBytes,errorCategory,github,invalidatePortalCache,saveMirrorBatch,bucket,db,durableGet,durableSet,hasGithubToken,invalidateMedia,planReplica,gitBlobSha}=globalThis.__replicaTest;\n'+source;
 const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
 const first=m.syncReplicaNow();assert.equal(first,m.syncReplicaNow());await first;
 assert.equal(calls.length,3);assert.equal(m.replicaStatus().repositories.databas.done,28);assert.equal(keyScans,2);
 calls.length=0;await m.syncReplicaNow();assert.equal(calls.length,0);
 commit='b'.repeat(40);files[0]=await make('file-0.txt','Ändrad text');files.push(await make('new.txt','Ny text'));failPath='new.txt';
 await m.syncReplicaNow();assert.deepEqual(new Set(calls),new Set(['file-0.txt','new.txt']));assert.ok(m.replicaStatus().error);assert.equal(m.replicaStatus().repositories.databas.done,28);assert.equal(kv.get('replica-complete:v2:databas').commit,'a'.repeat(40));
 calls.length=0;failPath='';await m.syncReplicaNow();assert.deepEqual(calls,['new.txt']);assert.equal(m.replicaStatus().repositories.databas.done,29);assert.equal(m.replicaStatus().error,'');
 for(let i=0;i<8;i++)files.push(await make('more-'+i+'.txt','Nytt '+i));commit='c'.repeat(40);calls.length=0;onBlob=()=>m.pauseReplicaSync();await m.syncReplicaNow();assert.equal(m.replicaStatus().paused,true);assert.equal(calls.length,4);assert.equal(kv.get('replica-complete:v2:databas').commit,'b'.repeat(40));
 onBlob=null;await m.syncReplicaNow();assert.equal(m.replicaStatus().repositories.databas.done,37);assert.equal(m.replicaStatus().error,'');
});
