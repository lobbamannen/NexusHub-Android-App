import test from 'node:test';
import assert from 'node:assert/strict';
const {upsertQuickTask,inboxIdeas}=await import('../lib/personal-capture.mjs').catch(()=>({}));
const id='12345678-1234-4234-8234-123456789abc',ideaId='22345678-1234-4234-8234-123456789abc';
test('quick task retry updates its stable ID and preserves other draft data',()=>{
 assert.equal(typeof upsertQuickTask,'function');
 const original={schemaVersion:1,extra:'keep',items:[{id:ideaId,text:'Existing local edit',done:true,extra:3}]};
 const first=upsertQuickTask(original,{id,text:' New task ',ideaId});
 const retry=upsertQuickTask(first,{id,text:'Revised task',ideaId});
 assert.equal(retry.items.length,2);assert.deepEqual(retry.items[0],original.items[0]);assert.equal(retry.extra,'keep');assert.equal(original.items.length,1);
 assert.deepEqual(retry.items[1],{id,text:'Revised task',done:false,ideaId});
 assert.equal(upsertQuickTask(retry,{id,text:'Without link'}).items[1].ideaId,undefined);
});
test('quick task rejects blank text and invalid identity',()=>{
 assert.equal(typeof upsertQuickTask,'function');
 for(const draft of [{id,text:' '},{id:'../file',text:'A'},{id,text:'A',ideaId:'bad'}])assert.throws(()=>upsertQuickTask({schemaVersion:1,items:[]},draft));
});
test('inbox keeps new/investigating/ready and local conflict drafts; terminal ideas move to archive view',()=>{
 assert.equal(typeof inboxIdeas,'function');
 const rows=['new','investigating','ready','completed','dismissed'].map((status,i)=>({idea:{id:String(i),status}}));
 assert.deepEqual(inboxIdeas(rows,{}).map(x=>x.idea.status),['new','investigating','ready']);
 assert.equal(inboxIdeas(rows,{'3':{status:'conflict'}}).length,4);
});
const {ideasGithub}=await import('../lib/ideas-github.mjs');
import {gitBlobSha} from '../lib/github-inbox.mjs';
import {replicaView} from '../lib/replica-projections.mjs';
test('archive reads archived UUID files without mixing them into active inbox',async()=>{
 const a={schemaVersion:1,id,text:'Archived original',status:'completed',createdAt:'2026-10-25T16:00:00.000Z',updatedAt:'2026-10-25T16:00:00.000Z'};
 const b={...a,id:ideaId,text:'Active original',status:'new'};
 const files=await Promise.all([[`Ideer/Genomforda/${id}.json`,a],[`Ideer/${ideaId}.json`,b]].map(async([path,data])=>{const bytes=new TextEncoder().encode(JSON.stringify(data));return {path,type:'blob',sha:await gitBlobSha(bytes),data,bytes};}));
 const calls=[];
 const call=async path=>{calls.push(path);if(path.includes('/git/trees/'))return Response.json({tree:files,truncated:false});if(path.includes('/git/blobs/')){const f=files.find(x=>path.endsWith(x.sha));return Response.json({sha:f.sha,encoding:'base64',content:Buffer.from(f.bytes).toString('base64')});}return Response.json({},{status:404});};
 const c=ideasGithub('lobbamannen/Databas',call,gitBlobSha,bytes=>Buffer.from(bytes).toString('base64'));
 assert.deepEqual((await c.listIdeas({archive:true})).items.map(x=>x.idea.text),['Archived original']);
 assert.deepEqual((await c.listIdeas()).items.map(x=>x.idea.text),['Active original']);
 const reader={current:async()=>({files,commit:'a'.repeat(40)}),json:async(_,path)=>files.find(x=>x.path===path)?.data??null,file:async(_,path)=>files.find(x=>x.path===path)};
 assert.deepEqual((await replicaView('/api/ideas',new URLSearchParams('archive=true'),reader)).items.map(x=>x.idea.text),['Archived original']);
 assert.deepEqual((await replicaView('/api/ideas',new URLSearchParams(),reader)).items.map(x=>x.idea.text),['Active original']);
 assert.ok(calls.every(x=>!x.includes('PUT')));
});
test('unsaved terminal status remains editable after closing editor',()=>{
 const row={idea:{id,status:'completed'}};
 assert.deepEqual(inboxIdeas([row],{}, {[id]:row}),[row]);
});
