import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrainingMonth,filterTraining,monthPath} from '../lib/training-archive.mjs';
import {connectionNodes,connectionEdges,connectionsFor,applyConnectionChange,extractReferences} from '../lib/connections.mjs';
import {parseCommand} from '../lib/commands.mjs';
import {guardianFindings} from '../lib/guardian.mjs';

const record=(id,date,title='Pass 2',sets=[{count:1,reps:10,weight_kg:0,rir:null}])=>({id,data:{date,jsonLog:{daily_master_log:{workout:{status:'COMPLETED',title,exercises:[{name:'Press',canonical_name:'press',sets}]}}},journal:{dailyWin:'Bra',commentary:'<img onerror=x>'}}});
test('training retains calendar dates, original set fields, nulls and separate sessions',()=>{
 const a=record('a','2026-10-25'),b=record('b','2026-10-25','Fullbody');
 const r=normalizeTrainingMonth({records:[a,a,b,record('c','2026-02-31'),record('d','2026-09-01'),{...a,id:'x',deletedAt:'yes'}]},'2026-10',{path:monthPath('2026-10'),blobSha:'a'});
 assert.equal(r.entries.length,2);assert.equal(r.entries[0].date,'2026-10-25');assert.equal(r.entries[0].exercises[0].sets[0].weightKg,0);assert.equal(r.entries[0].exercises[0].sets[0].rir,null);assert.equal(r.entries[1].passType,'other');assert.equal(r.entries[0].journal.commentary,'<img onerror=x>');assert.ok(r.warnings.length);
 assert.equal(filterTraining(r.entries,{pass:'2',exercise:'press'}).length,1);assert.throws(()=>monthPath('../bad'));
});
test('training ignores noncompleted sessions and refuses corrupt month schema',()=>{
 const a=record('a','2026-10-01');a.data.jsonLog.daily_master_log.workout.status='NO_DATA';assert.equal(normalizeTrainingMonth({records:[a]},'2026-10',{}).entries.length,0);assert.throws(()=>normalizeTrainingMonth({},'2026-10',{}));
});
test('connections group formats and admit structured content without exposing backups',()=>{
 const docs=[{path:'Research/A.md',title:'Rapport',formats:[{path:'Research/A.md'},{path:'Research/A.pdf'}]},{path:'Kunskap/Kunskapsbanken/records/chunk-a.json',title:'Kunskap',technical:false},{path:'Cortex/Original/dump.json',title:'Backup',technical:true}];
 const n=connectionNodes(docs);assert.equal(n.length,2);assert.equal(n[0].paths.length,2);assert.equal(n[1].kind,'Kunskap');
});
test('multi-format content chooses readable Markdown and includes news records',()=>{
 const nodes=connectionNodes([{path:'Research/A.docx',title:'A'},{path:'Research/A.md',title:'Rätt titel',category:'Forskning'},{path:'Nyhetsradarn/records/event-a.json',title:'Nyhet',technical:true}]);
 assert.equal(nodes.length,2);assert.equal(nodes[0].path,'Research/A.md');assert.equal(nodes[0].title,'Rätt titel');assert.equal(nodes[1].kind,'Nyhet');
});
test('relations label references, suggestions and approved links without inventing causality',()=>{
 const n=connectionNodes([{path:'Research/A.md',title:'Gemma lokal',category:'AI'},{path:'Kunskap/B.md',title:'Gemma mobil',category:'AI'},{path:'Ideer/a.json',title:'Idé'}]);
 const refs=extractReferences('[Läs](../Kunskap/B.md)\nhttps://example.com/paper','Research/A.md');assert.ok(refs.paths.includes('Kunskap/B.md'));
 const e=connectionEdges(n,[{id:'r',from:n[0].id,to:n[2].id,type:'builds_on',note:'Underlag',status:'active'}],{[n[0].id]:refs});
 assert.ok(e.some(x=>x.type==='references'&&x.to===n[1].id));assert.ok(e.some(x=>x.type==='builds_on'&&x.origin==='user'));
 const rel=connectionsFor(n[0].id,n,e);assert.ok(rel.some(x=>x.node.id===n[1].id&&x.edge.origin==='document'));
 assert.equal(connectionEdges(n,[],{}).length,0,'same words do not create proven edges');
});
test('relation register preserves unknown metadata and revokes without erasing history',()=>{
 const data={schemaVersion:1,custom:'keep',relations:[]};const change={id:'r1',from:'a',to:'b',type:'related',note:'Min koppling'};
 const a=applyConnectionChange(data,{action:'add',relation:change},'now');assert.equal(a.custom,'keep');const b=applyConnectionChange(a,{action:'revoke',id:'r1'},'later');assert.equal(b.relations.length,1);assert.equal(b.relations[0].status,'revoked');assert.throws(()=>applyConnectionChange(data,{action:'add',relation:{...change,to:'a'}},'now'));
});
test('commands are explicit Swedish navigation and search; unknown phrases remain search',()=>{
 assert.equal(parseCommand('Öppna träningsarkivet').view,'traning');assert.equal(parseCommand('visa kopplingar').view,'connections');assert.equal(parseCommand('guardian').view,'guardian');assert.equal(parseCommand('sök kunskap om Gemma').query,'Gemma');assert.equal(parseCommand('ta bort alla filmer').kind,'search');assert.equal(parseCommand('Star Wars').query,'Star Wars');
});
test('Guardian separates detected issues, incomplete checks and healthy results',()=>{
 const r=guardianFindings({replica:{running:false,error:'Nätfel'},audit:null,links:{broken:[{from:'a',path:'missing.md'}],complete:false},posterMissing:[],posterChecked:false});assert.ok(r.some(x=>x.state==='issue'&&x.id==='sync'));assert.ok(r.some(x=>x.state==='unknown'&&x.id==='audit'));assert.ok(r.some(x=>x.state==='issue'&&x.id==='links'));assert.ok(r.some(x=>x.state==='unknown'&&x.id==='posters'));
});
