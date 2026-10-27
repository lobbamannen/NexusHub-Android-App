import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const shared={entries:[{path:'Mottagningsinkorg/test/metadata.json',sha:'a'.repeat(40)}],manifestSha:'a'.repeat(40),commit:'b'.repeat(40)};
async function setup(){const kv=new Map();globalThis.window=new EventTarget();globalThis.__attachmentStore={durableGet:async k=>structuredClone(kv.get(k)),durableSet:async(k,v)=>kv.set(k,structuredClone(v)),durableEntries:async prefix=>[...kv].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]),durableDelete:async k=>kv.delete(k)};
 let source=readFileSync(new URL('../platform/incoming-store.ts',import.meta.url),'utf8').replace("import {durableGet,durableSet,durableEntries,durableDelete} from './local-store';","const {durableGet,durableSet,durableEntries,durableDelete}=globalThis.__attachmentStore;").replace("'@/lib/github-inbox.mjs'",JSON.stringify(new URL('../lib/github-inbox.mjs',import.meta.url).href));
 const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64')+'#'+crypto.randomUUID());return {m,kv};}
test('automatic intake retries lost acknowledgments and persists offline deletion before cleanup',async()=>{
 const {m}=await setup();let cloud=null,lost=true,offlineDelete=false,uploads=0,deletes=0;
 globalThis.fetch=async(_,init)=>{if(init.method==='GET')return Response.json({items:cloud?[cloud]:[]});const body=JSON.parse(init.body);
 if(init.method==='POST'){uploads++;cloud={...shared,metadata:body.item};if(lost){lost=false;throw Error('Kvittensen försvann');}return Response.json({...shared,saved:true});}
 if(init.method==='DELETE'){deletes++;if(offlineDelete)throw Error('Offline');cloud=null;return Response.json({deleted:true});}};
 const item=await m.saveIncoming([new File(['rapport'],'a.txt')]);await m.syncIncoming();assert.equal((await m.incomingItems())[0].shared,undefined);assert.match((await m.incomingItems())[0].sharedError,/Kvittensen/);
 await m.syncIncoming();assert.equal(uploads,2);assert.ok((await m.incomingItems())[0].shared);assert.equal((await m.incomingItems()).length,1);
 offlineDelete=true;await m.removeIncoming(item);const pending=(await m.incomingItems())[0];assert.equal(pending.deleting,true);assert.equal(await pending.files[0].blob.text(),'rapport');assert.match(pending.sharedError,/Offline/);
 offlineDelete=false;await m.syncIncoming();assert.equal((await m.incomingItems()).length,0);assert.equal(cloud,null);assert.equal(deletes,2);
});
test('chat deletion removes a confirmed local intake without re-uploading; idea drafts stay local',async()=>{
 const {m}=await setup();let uploads=0;globalThis.fetch=async(_,init)=>{if(init.method==='GET')return Response.json({items:[]});uploads++;return Response.json({saved:true,...shared});};
 const item=await m.saveIncoming([new File(['x'],'a.txt')]);item.shared=shared;await m.saveIncomingItem(item);await m.syncIncoming();assert.equal((await m.incomingItems()).length,0);assert.equal(uploads,0);
 await m.saveIncoming([new File(['utkast'],'idé.txt')],'',['idea:123']);await m.syncIncoming();assert.equal((await m.incomingItems()).length,1);assert.equal(uploads,0);
});
test('pending deletion survives a total read outage and resumes after restart',async()=>{
 const {m,kv}=await setup();const item=await m.saveIncoming([new File(['x'],'fil.txt')]);globalThis.fetch=async()=>{throw Error('Nätet borta');};await m.removeIncoming(item);assert.equal((await m.incomingItems())[0].deleting,true);assert.match(m.incomingSyncError,/Nätet/);
 globalThis.fetch=async(_,init)=>Response.json(init.method==='GET'?{items:[]}:{deleted:true});await m.syncIncoming();assert.equal((await m.incomingItems()).length,0);assert.ok(kv.has('incoming-removed:v1:'+item.id));
});
test('multi-file intake reports all results and skips content-identical duplicates independent of names',async()=>{
 const {m}=await setup();globalThis.fetch=async()=>Response.json({items:[]});
 const first=await m.intakeIncomingFiles([new File(['same'],'one.md'),new File(['same'],'renamed.md'),new File(['different'],'one.md')]);
 assert.equal(first.added.length,2);assert.deepEqual(first.duplicates,['renamed.md']);assert.equal((await m.incomingItems()).length,2);
 const second=await m.intakeIncomingFiles([new File(['same'],'again.md')]);assert.equal(second.added.length,0);assert.deepEqual(second.duplicates,['again.md']);
 const bad=new File(['bad'],'broken.md');bad.arrayBuffer=async()=>{throw Error('Kan inte läsa');};const mixed=await m.intakeIncomingFiles([bad,new File(['valid'],'valid.md')]);assert.equal(mixed.errors.length,1);assert.equal(mixed.added.length,1);assert.equal(mixed.added[0].files[0].name,'valid.md');
});
test('a remote content hash is detected even before its package is downloaded to the phone',async()=>{
 const {m}=await setup();const {gitBlobSha}=await import('../lib/github-inbox.mjs');const sha=await gitBlobSha(new TextEncoder().encode('remote'));
 globalThis.fetch=async()=>Response.json({items:[{metadata:{files:[{sha}]}}]});
 const result=await m.intakeIncomingFiles([new File(['remote'],'new-name.pdf')]);assert.equal(result.added.length,0);assert.deepEqual(result.duplicates,['new-name.pdf']);
});
