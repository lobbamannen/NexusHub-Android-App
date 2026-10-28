import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
test('file selection persists idea destination without upload; partial retry preserves receipts',async()=>{
 const kv=new Map();globalThis.window=new EventTarget();
 globalThis.__attachmentStore={durableGet:async k=>structuredClone(kv.get(k)),durableSet:async(k,v)=>kv.set(k,structuredClone(v)),durableEntries:async prefix=>[...kv].filter(([k])=>k.startsWith(prefix)).map(([k,v])=>[k,structuredClone(v)]),durableDelete:async k=>kv.delete(k)};
 let source=readFileSync(new URL('../platform/incoming-store.ts',import.meta.url),'utf8').replace("import {durableGet,durableSet,durableEntries,durableDelete} from './local-store';","const {durableGet,durableSet,durableEntries,durableDelete}=globalThis.__attachmentStore;").replace("'@/lib/pasted-text.mjs'",JSON.stringify(new URL('../lib/pasted-text.mjs',import.meta.url).href)).replace("'@/lib/github-inbox.mjs'",JSON.stringify(new URL('../lib/github-inbox.mjs',import.meta.url).href));
 const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
 const requests=[];let failed=false;globalThis.fetch=async(_,init)=>{const body=JSON.parse(init.body);requests.push(body);if(body.name==='b.txt'&&!failed){failed=true;return Response.json({error:'Nätfel'},{status:503});}return Response.json({saved:true,path:'Ideer/Bilagor/'+body.fileId,sha:'a'.repeat(40),commit:'b'.repeat(40)});};
 const item=await m.saveIncoming([new File(['Första'],'a.txt'),new File(['Andra'],'b.txt')],'',['idea:test-id']);
 assert.equal(requests.length,0);let stored=(await m.incomingItems())[0];assert.deepEqual(stored.destinations,['idea:test-id']);assert.equal(await stored.files[0].blob.text(),'Första');
 await assert.rejects(()=>m.deliverIncoming(stored,['idea:test-id']),/Nätfel/);stored=(await m.incomingItems())[0];assert.equal(Object.keys(stored.sent).length,1);assert.equal(m.incomingComplete(stored),false);
 await m.deliverIncoming(stored,['idea:test-id']);assert.equal(m.incomingComplete((await m.incomingItems())[0]),true);assert.deepEqual(requests.map(r=>r.name),['a.txt','b.txt','b.txt']);assert.ok(requests.every(r=>r.ideaId==='test-id'));
});
