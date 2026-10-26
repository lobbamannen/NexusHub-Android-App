import test from 'node:test';
import assert from 'node:assert/strict';
import {gitBlobSha} from '../lib/github-inbox.mjs';
import {createReplicaReader} from '../lib/replica-read.mjs';

const body=new TextEncoder().encode('{"hello":"local"}');
const make=async()=>{
 const sha=await gitBlobSha(body),commit='a'.repeat(40),path='System/test.json';
 const state={manifest:{commit,files:[{path,sha,size:body.length,type:'blob'}]},rows:new Map([[path+'\0'+sha,{blob_sha:sha,object_key:'mirror/databas/'+sha}]]),bytes:new Map([['mirror/databas/'+sha,body]])};
 const reader=createReplicaReader({
  manifest:async()=>state.manifest,
  record:async(_repo,p,version)=>state.rows.get(p+'\0'+version)||null,
  binary:async key=>state.bytes.get(key)||null,
 });
 return {reader,state,path,sha,commit};
};

test('a current verified local file is readable with its manifest commit and exact SHA',async()=>{
 const {reader,path,sha,commit}=await make();
 const item=await reader.file('databas',path);
 assert.equal(item.sha,sha);
 assert.equal(item.commit,commit);
 assert.deepEqual(await reader.json('databas',path),{hello:'local'});
});

test('a missing, stale or corrupted replica never impersonates current GitHub data',async()=>{
 const {reader,state,path,sha}=await make();
 assert.equal(await reader.file('databas','other.json'),null);
 state.manifest.files[0].sha='b'.repeat(40);
 assert.equal(await reader.file('databas',path),null);
 state.manifest.files[0].sha=sha;
 state.bytes.set('mirror/databas/'+sha,new TextEncoder().encode('{"hello":"tampered"}'));
 assert.equal(await reader.file('databas',path),null);
});

test('unsafe paths and incomplete manifests cannot be used for local projections',async()=>{
 const {reader,state}=await make();
 assert.equal(await reader.file('databas','../System/test.json'),null);
 state.manifest.truncated=true;
 assert.equal(await reader.file('databas','System/test.json'),null);
});
