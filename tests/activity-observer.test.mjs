import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {mutationActivities,snapshotActivities,fileActivities} from '../lib/activity-events.mjs';

async function observer({failRead=false,failWrite=false}={}){
 const history=[],store=new Map();let leases=0;
 const bindings={mutationActivities,snapshotActivities,fileActivities,
  recordActivity:async event=>history.push(event),
  durableGet:async key=>{if(failRead)throw Error('History read failed');return store.get(key);},
  durableSet:async(key,value)=>{if(failWrite)throw Error('History write failed');store.set(key,structuredClone(value));},
  backgroundWork:async(_label,work)=>{leases++;return work();},bucket:()=>({get:async()=>null}),
 };
 const key='__activityObserver'+crypto.randomUUID().replaceAll('-','');globalThis[key]=bindings;
 const source=readFileSync(new URL('../platform/activity-observer.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const compiled=ts.transpileModule('const {'+Object.keys(bindings).join(',')+'}=globalThis['+JSON.stringify(key)+'];\n'+source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const module=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 return {module,history,store,leases:()=>leases};
}

test('history projection read or write failures cannot turn confirmed saves into failed requests',async()=>{
 for(const fault of [{failRead:true},{failWrite:true}]){
  const {module,history}=await observer(fault);let performed=0;
  const request=new Request('https://nexus.test/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{schemaVersion:1,items:[{id:'t',text:'Save once',done:false}]},expectedSha:null})});
  const response=await module.auditMutation(request,async()=>{performed++;return Response.json({saved:true,sha:'a'.repeat(40),data:{schemaVersion:1,items:[{id:'t',text:'Save once',done:false}]}});});
  assert.equal(performed,1);assert.equal(response.status,200);assert.equal((await response.json()).saved,true);
  assert.ok(history.some(e=>e.status==='succeeded'));assert.ok(!history.some(e=>e.action==='save_failed'));
 }
});

test('ordinary reads and navigation never create journal entries or active-save leases',async()=>{
 const state=await observer();
 const response=await state.module.auditMutation(new Request('https://nexus.test/api/ideas'),async()=>Response.json({items:[]}));
 assert.equal(response.status,200);assert.deepEqual(state.history,[]);assert.equal(state.leases(),0);
});

test('a conflict stays a conflict and is never logged as a completed save',async()=>{
 const {module,history}=await observer();
 const request=new Request('https://nexus.test/api/ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idea:{id:'idea',text:'A thought',status:'new'},expectedSha:'a'.repeat(40)})});
 const response=await module.auditMutation(request,async()=>Response.json({saved:false,error:'Source changed'},{status:409}));
 assert.equal(response.status,409);assert.ok(history.some(e=>e.status==='conflict'));assert.ok(!history.some(e=>e.status==='succeeded'));
});

test('register baseline does not invent history but later observed read-state changes are retained',async()=>{
 const {module,history}=await observer();
 await module.observeSnapshot('/api/story-status',{sha:'a'.repeat(40),register:{entries:{'Berattelser/A.md':{read:false}}}});
 assert.equal(history.length,0);
 await module.observeSnapshot('/api/story-status',{sha:'b'.repeat(40),register:{entries:{'Berattelser/A.md':{read:true}}}});
 assert.equal(history.length,1);assert.equal(history[0].objectId,'Berattelser/A.md');assert.equal(history[0].source,'github');assert.equal(history[0].details.before.read,false);assert.equal(history[0].details.after.read,true);
});
