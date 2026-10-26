import test from 'node:test';
import assert from 'node:assert/strict';
import { replicaView } from '../lib/replica-projections.mjs';

const id='12345678-1234-4123-8123-123456789abc';
const sha='a'.repeat(40);
const at='2026-10-26T20:00:00.000Z';
const idea={schemaVersion:1,id,text:'Testidé',status:'new',createdAt:at,updatedAt:at};
const files={
 ['Ideer/'+id+'.json']:idea,
 'Ideer/System/nummer.json':{schemaVersion:1,nextNumber:2,entries:[{id,number:1,createdAt:at}],dailyCounts:{}},
 'Att-gora/register.json':{schemaVersion:1,items:[]},
 'Ekonomi/Robin/budget.json':{schema_version:1,entries:[]},
 'Ekonomi/Rebecca/budget.json':{schema_version:1,entries:[]},
 ['Fardiga-ideer/'+id+'/metadata.json']:{schemaVersion:1,ideaId:id,title:'Planen',summary:'Sammanfattning',preparedAt:at,sourceIdeaSha:sha},
 ['Fardiga-ideer/'+id+'/implementation-plan.md']:'# Implementation\n\nArbeta med projektet.',
 ['Fardiga-ideer/'+id+'/research.md']:'# Research',
};
const reader={
 current:async repo=>repo==='databas'?{commit:sha,fetchedAt:at,files:Object.keys(files).map(path=>({path,sha,size:1}))}:null,
 json:async(_,path)=>path in files?files[path]:null,
 text:async(_,path)=>typeof files[path]==='string'?files[path]:null,
 file:async(_,path)=>path in files?{sha}:null,
};

test('projects ideas and numbering from immutable local files',async()=>{
 const list=await replicaView('/api/ideas',new URLSearchParams(),reader);
 assert.equal(list.items[0].idea.id,id);
 assert.equal(list.items[0].sha,sha);
 assert.equal(list.numbering.nextNumber,2);
 assert.deepEqual(await replicaView('/api/ideas',new URLSearchParams({id}),reader),{idea,sha});
});
test('projects plan packages and todos without remote GitHub reads',async()=>{
 const plans=await replicaView('/api/idea-plans',new URLSearchParams(),reader);
 assert.equal(plans.plans.length,1);
 assert.equal(plans.plans[0].title,'Planen');
 assert.equal(plans.plans[0].files.length,3);
 assert.deepEqual(await replicaView('/api/todos',new URLSearchParams(),reader),{sha,data:{schemaVersion:1,items:[]}});
});
test('projects economy with original SHA for conflict-protected writes',async()=>{
 const economy=await replicaView('/api/economy',new URLSearchParams(),reader);
 assert.equal(economy.files.length,2);
 assert.equal(economy.files[0].sha,sha);
 assert.equal(economy.commit,sha);
});
test('refuses a partial replica instead of publishing incomplete projection',async()=>{
 const partial={...reader,json:async()=>null};
 await assert.rejects(()=>replicaView('/api/ideas',new URLSearchParams(),partial));
 assert.equal(await replicaView('/api/nonexistent',new URLSearchParams(),reader),null);
});
test('portal catalog resolves active knowledge chunks from local topic metadata',async()=>{
 const topic='Kunskap/Kunskapsbanken/records/topic-local.json';
 const revision='Kunskap/Kunskapsbanken/records/revision-abc.json';
 const chunk='Kunskap/Kunskapsbanken/records/chunk-xyz.json';
 const more={...files,[topic]:{record:{topic_id:'local',title:'Lokalt ämne',category:'Vetenskap',description:'Fakta',active_revision:'abc',tags:['test']}},[revision]:{record:{sections:[{title:'Avsnitt',chunk_ids:['xyz']}]}},[chunk]:{record:{title:'Text',body:'innehåll'}}};
 const richer={...reader,current:async repo=>repo==='databas'?{commit:sha,fetchedAt:at,files:Object.keys(more).map(path=>({path,sha,size:1}))}:null,json:async(_,path)=>more[path]??null};
 const overview=await replicaView('/api/portal/overview',new URLSearchParams(),richer);
 assert.equal(overview.repositories.databas.knowledgeTopics[0].title,'Lokalt ämne');
 assert.equal(overview.repositories.databas.documents.find(row=>row.path===chunk).topicPath,topic);
});
