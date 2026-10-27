import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedIncomingGithub,incomingPrefix,incomingDocumentCount} from '../lib/shared-incoming.mjs';
import {makeCatalog} from '../lib/catalog.mjs';
import {gitBlobSha,base64} from '../lib/github-inbox.mjs';
const id='11111111-1111-4111-8111-111111111111',fid='22222222-2222-4222-8222-222222222222';
const input={id,text:'Läs denna rapport',createdAt:'2026-10-27T13:00:00Z',files:[{id:fid,name:'rapport.pdf',mime:'application/pdf',base64:base64(new Uint8Array([0,255,1,128,42]))}]};
function fake(){
 let next=1,head;const hash=()=>String(next++).padStart(40,'0'),blobs=new Map(),trees=new Map(),commits=new Map(),history=new Set();
 head=hash();const initialTree=hash();trees.set(initialTree,new Map([['bevara.txt','a'.repeat(40)]]));commits.set(head,{tree:initialTree,parents:[]});
 const tree=()=>trees.get(commits.get(head).tree);
 const call=async(path,init={})=>{const method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
  if(path==='/git/ref/heads/main')return Response.json({object:{sha:head}});
  if(path.startsWith('/git/commits/')&&method==='GET'){const c=commits.get(path.slice(13));return Response.json({tree:{sha:c.tree}});}
  if(path.startsWith('/git/trees/')&&method==='GET'){const key=path.slice(11).split('?')[0],t=trees.get(commits.get(key)?.tree||key);return Response.json({tree:[...t].map(([path,sha])=>({path,sha,type:'blob'})),truncated:false});}
  if(path.startsWith('/git/blobs/')&&method==='GET'){const sha=path.slice(11);return Response.json({sha,encoding:'base64',content:blobs.get(sha)});}
  if(path.startsWith('/commits?'))return Response.json(history.has(decodeURIComponent(path.split('path=')[1].split('&')[0]))?[{sha:head}]:[]);
  if(path==='/git/blobs'&&method==='POST'){const sha=await gitBlobSha(Uint8Array.from(atob(body.content),c=>c.charCodeAt(0)));blobs.set(sha,body.content);return Response.json({sha});}
  if(path==='/git/trees'&&method==='POST'){const t=new Map(trees.get(body.base_tree));for(const e of body.tree){if(e.sha===null)t.delete(e.path);else t.set(e.path,e.sha);}const sha=hash();trees.set(sha,t);return Response.json({sha});}
  if(path==='/git/commits'&&method==='POST'){const sha=hash();commits.set(sha,{tree:body.tree,parents:body.parents});return Response.json({sha});}
  if(path==='/git/refs/heads/main'&&method==='PATCH'){if(commits.get(body.sha).parents[0]!==head)throw Error('non-fast-forward');head=body.sha;for(const p of tree().keys())history.add(p);return Response.json({object:{sha:head}});}
  throw Error('Unexpected '+method+' '+path);
 };
 return {client:sharedIncomingGithub('lobbamannen/Databas',call,gitBlobSha,base64),tree,blobs,externalDelete(){for(const p of tree().keys())if(p.startsWith(incomingPrefix(id)))tree().delete(p);},modify(){tree().set(incomingPrefix(id)+'extra.txt','f'.repeat(40));}};
}
test('atomic package preserves binary bytes, shared text, unrelated paths and retry identity',async()=>{
 const f=fake(),saved=await f.client.saveSharedIncoming(input);assert.equal(saved.saved,true);assert.equal(saved.entries.length,3);assert.ok(f.tree().has('bevara.txt'));
 const read=await f.client.readSharedIncomingFile(id,fid);assert.equal(read.base64,input.files[0].base64);
 const list=await f.client.listSharedIncoming();assert.equal(list.items.length,1);assert.equal(list.items[0].metadata.text,input.text);assert.equal(list.items[0].metadata.files[0].name,'rapport.pdf');
 const retry=await f.client.saveSharedIncoming(input);assert.equal(retry.reconciled,true);assert.equal(f.tree().size,4);
 await f.client.deleteSharedIncoming(id,saved.entries);assert.deepEqual([...f.tree().keys()],['bevara.txt']);assert.equal((await f.client.listSharedIncoming()).items.length,0);
 assert.equal((await f.client.deleteSharedIncoming(id,saved.entries)).reconciled,true);
 assert.equal((await f.client.saveSharedIncoming(input)).deleted,true,'never resurrect a package deleted by a chat after an uncertain response');
});
test('deletion cannot destroy changed, extra or unrelated files',async()=>{
 const f=fake(),saved=await f.client.saveSharedIncoming(input);f.modify();await assert.rejects(()=>f.client.deleteSharedIncoming(id,saved.entries),/ändrats/);assert.ok(f.tree().has(incomingPrefix(id)+'extra.txt'));
 await assert.rejects(()=>f.client.deleteSharedIncoming(id,[{path:'00-Inkorg/viktig.pdf',sha:'f'.repeat(40)}]),/Ogiltigt/);
 await assert.rejects(()=>f.client.saveSharedIncoming({...input,text:'annan text'}),/ändrats/);
 assert.ok(f.tree().has('bevara.txt'));
});
test('count includes actual documents/shared text but no metadata; UUID scope rejects traversal',()=>{
 assert.equal(incomingDocumentCount([{files:[{},{}],text:'x'},{files:[],text:' '},{files:[{}],text:''}]),4);
 assert.throws(()=>incomingPrefix('../00-Inkorg'),/Ogiltigt/);
});

test('temporary intake is available in files without being classified as permanent knowledge',()=>{
 const catalog=makeCatalog({tree:[{path:incomingPrefix(id)+fid+'-rapport.pdf',type:'blob',sha:'a'.repeat(40),size:10}],commit:'b'.repeat(40)});
 assert.equal(catalog.documents.length,1);assert.equal(catalog.documents[0].technical,true);assert.notEqual(catalog.documents[0].module,'databas');
});
test('renamed packages prove the exact legacy receipt without hiding changed content',async()=>{
 const f=fake(),saved=await f.client.saveSharedIncoming(input),prefix=incomingPrefix(id),metaPath=prefix+'metadata.json';
 const meta=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.blobs.get(f.tree().get(metaPath))),c=>c.charCodeAt(0))));const legacy={...meta,files:meta.files.map(x=>({...x,path:x.path.replace('NexusHub inkorg/','Mottagningsinkorg/')}))};
 const legacyHash=await gitBlobSha(new TextEncoder().encode(JSON.stringify(legacy,null,2)+'\n'));
 const list=await f.client.listSharedIncoming();assert.equal(list.items[0].legacyManifestSha,legacyHash);assert.ok(list.items[0].legacyEntries.every(x=>x.path.startsWith('Mottagningsinkorg/')));
 const legacyEncoded=base64(new TextEncoder().encode(JSON.stringify(legacy,null,2)+'\n'));f.blobs.set(legacyHash,legacyEncoded);
 for(const [p,h] of [...f.tree()])if(p.startsWith(prefix)){f.tree().delete(p);f.tree().set(p.replace('NexusHub inkorg/','Mottagningsinkorg/'),p.endsWith('/metadata.json')?legacyHash:h);}
 const old=await f.client.listSharedIncoming();assert.equal(old.items.length,1);assert.equal((await f.client.saveSharedIncoming(input)).reconciled,true);
 await f.client.deleteSharedIncoming(id,old.items[0].entries);assert.deepEqual([...f.tree().keys()],['bevara.txt']);
});
