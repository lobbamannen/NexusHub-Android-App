import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const shared={entries:[{path:'Mottagningsinkorg/test/metadata.json',sha:'a'.repeat(40)}],manifestSha:'a'.repeat(40),commit:'b'.repeat(40)};
async function setup(){const kv=new Map();globalThis.window=new EventTarget();globalThis.__attachmentStore={durableGet:async k=>{if(globalThis.__attachmentStore.failRead)throw Error('Read failed');return structuredClone(kv.get(k));},durableSet:async(k,v)=>{if(globalThis.__attachmentStore.failWrite)throw Error('Disk full');kv.set(k,structuredClone(v));},durableEntries:async prefix=>[...kv].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]),durableDelete:async k=>kv.delete(k)};
 let source=readFileSync(new URL('../platform/incoming-store.ts',import.meta.url),'utf8').replace("import {durableGet,durableSet,durableEntries,durableDelete} from './local-store';","const {durableGet,durableSet,durableEntries,durableDelete}=globalThis.__attachmentStore;").replace("'@/lib/pasted-text.mjs'",JSON.stringify(new URL('../lib/pasted-text.mjs',import.meta.url).href)).replace("'@/lib/github-inbox.mjs'",JSON.stringify(new URL('../lib/github-inbox.mjs',import.meta.url).href));
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
test('an already committed own package reconciles even when another identical document exists',async()=>{
 const {m}=await setup();const item=await m.saveIncoming([new File(['same'],'report.md')]);let posts=0;
 globalThis.fetch=async(_,init)=>{if(init.method==='GET')return Response.json({items:[{...shared,metadata:{id:item.id,files:[]}},{metadata:{id:'other',files:[{sha:item.files[0].sha}]}}]});posts++;return Response.json({saved:true,...shared});};
 await m.syncIncoming();assert.equal(posts,1);assert.ok((await m.incomingItems())[0].shared);assert.equal((await m.incomingItems())[0].sharedError,'');
});
test('a folder rename rebases only an exactly proven old receipt, without re-upload or local removal',async()=>{
 const {m}=await setup();const item=await m.saveIncoming([new File(['x'],'report.md')]);item.shared=shared;await m.saveIncomingItem(item);
 const renamed={entries:[{path:'NexusHub inkorg/test/metadata.json',sha:'c'.repeat(40)}],manifestSha:'c'.repeat(40),commit:'d'.repeat(40)};let writes=0;
 globalThis.fetch=async(_,init)=>{if(init.method==='GET')return Response.json({items:[{...renamed,legacyManifestSha:shared.manifestSha,legacyEntries:shared.entries,metadata:{id:item.id,files:[]}}]});writes++;throw Error('must not write');};
 await m.syncIncoming();assert.equal(writes,0);assert.equal((await m.incomingItems())[0].shared.manifestSha,renamed.manifestSha);assert.equal((await m.incomingItems()).length,1);
});
test('pasted research is durable before immediate mirror, source separate, retry keeps exact bytes and identity',async()=>{
 const {m,kv}=await setup();const raw=' # Forskning 😎\r\n```mermaid\nA-->B\n```\nhttps://example.com\n\n';let offline=true,firstId,firstFileId,posts=0;
 globalThis.fetch=async(_,init)=>{assert.equal([...kv.keys()].filter(k=>k.startsWith('incoming:v1:')).length,1,'local commit precedes any request');if(offline)throw Error('Offline');if(init.method==='GET')return Response.json({items:[]});const b=JSON.parse(init.body);posts++;firstId??=b.item.id;firstFileId??=b.item.files[0].id;assert.equal(b.item.id,firstId);assert.equal(b.item.files[0].id,firstFileId);assert.equal(b.item.sourceLabel,'DeepSeek');assert.equal(b.item.text,'');assert.equal(new TextDecoder().decode(Uint8Array.from(atob(b.item.files[0].base64),c=>c.charCodeAt(0))),raw);return Response.json({...shared,saved:true});};
 const item=await m.savePastedText(raw,'DeepSeek');assert.equal(item.sourceLabel,'DeepSeek');assert.equal(await item.files[0].blob.text(),raw);assert.equal(item.shared,undefined);assert.match(m.incomingSyncError,/Offline/);
 offline=false;await m.syncIncoming();assert.equal(posts,1);const saved=(await m.incomingItems())[0];assert.ok(saved.shared);assert.equal(saved.id,item.id);assert.equal((await m.incomingItems()).length,1);
});
test('local storage failure and empty pasted text never attempt remote upload',async()=>{
 const {m}=await setup();let requests=0;globalThis.fetch=async()=>{requests++;throw Error('must not request');};
 await assert.rejects(m.savePastedText('  \n',''));assert.equal(requests,0);
 globalThis.__attachmentStore.failWrite=true;await assert.rejects(m.savePastedText('Body',''),/Disk full/);assert.equal(requests,0);
});
test('paste during an older sync snapshot is sent immediately after that sync finishes',async()=>{
 const {m}=await setup();const old=await m.saveIncoming([new File(['old'],'old.md')]);const cloud=new Map();let release,entered;const paused=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let count=0;
 globalThis.fetch=async(_,init)=>{if(init.method==='GET')return Response.json({items:[...cloud.values()]});const b=JSON.parse(init.body);if(b.item.id===old.id){entered();await gate;}count++;const c={...shared,metadata:{...b.item,files:b.item.files.map(f=>({...f,sha:'c'.repeat(40)}))}};cloud.set(b.item.id,c);return Response.json({...shared,saved:true});};
 const running=m.syncIncoming();await paused;const pasted=m.savePastedText('new research','');await new Promise(r=>setTimeout(r,10));release();await running;const item=await pasted;assert.ok(item.shared);assert.equal(count,2);assert.equal((await m.incomingItems()).length,2);
});

test('a read failure after commit cannot turn a durable save into a second intake',async()=>{
 const {m}=await setup();globalThis.__attachmentStore.failRead=true;globalThis.fetch=async()=>{throw Error('Offline');};
 const result=await m.savePastedText('Committed body','DeepSeek');assert.ok(result.id);assert.equal((await m.incomingItems()).length,1);assert.equal(await result.files[0].blob.text(),'Committed body');
});
