import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
const root=new URL('../',import.meta.url);
async function load(path,bindings){const key='__connectedTest'+Math.random().toString(36).slice(2);globalThis[key]=bindings;let code=fs.readFileSync(new URL(path,root),'utf8').replace(/^import \{replicaReader\} from '\.\/mirror-access';$/m,`const {replicaReader}=globalThis[${JSON.stringify(key)}];`).replace(/^import \{durableGet,durableSet\} from '\.\/local-store';$/m,`const {durableGet,durableSet}=globalThis[${JSON.stringify(key)}];`);code=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,path)=>'from '+JSON.stringify(path.startsWith('@/')?new URL(path.slice(2),root).href:import.meta.resolve(path)));try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}}
const bytes=text=>new TextEncoder().encode(text),sha='a'.repeat(40);
function model(entries){const map=new Map(entries),snapshot={commit:sha,files:entries.map(([path,body])=>({path,size:bytes(body).length,sha:sha,type:'blob'}))};return {snapshot,reader:{current:async()=>snapshot,file:async(repo,path)=>map.has(path)?{path,sha,commit:snapshot.commit,bytes:bytes(map.get(path))}:null,json:async(repo,path)=>map.has(path)?JSON.parse(map.get(path)):null}};}
test('same-blob relative references are resolved separately for each path',async()=>{
 const m=model([['Research/one/A.md','[target](target.md)'],['Research/two/A.md','[target](target.md)'],['Research/one/target.md','One'],['Research/two/target.md','Two']]),cache=new Map();
 const {buildConnectionIndex}=await load('platform/connection-index.ts',{replicaReader:m.reader,durableGet:async k=>cache.get(k),durableSet:async(k,v)=>cache.set(k,v)});
 const r=await buildConnectionIndex([],new AbortController().signal,()=>{});assert.deepEqual(r.references['databas:Research/one/A'].paths,['Research/one/target.md']);assert.deepEqual(r.references['databas:Research/two/A'].paths,['Research/two/target.md']);
});
test('connection indexing rejects a snapshot change during final media reads',async()=>{
 const m=model([['Filmer/register.json',JSON.stringify({films:[]})],['Serier/register.json',JSON.stringify({series:[]})]]);let reads=0;
 const change=()=>{if(++reads>=3)m.snapshot.commit='b'.repeat(40);};const originalFile=m.reader.file,originalJson=m.reader.json;m.reader.file=async(...args)=>{const result=await originalFile(...args);change();return result;};m.reader.json=async(...args)=>{change();return originalJson(...args);};
 const {buildConnectionIndex}=await load('platform/connection-index.ts',{replicaReader:m.reader,durableGet:async()=>null,durableSet:async()=>{}});
 await assert.rejects(()=>buildConnectionIndex([],new AbortController().signal,()=>{}),/uppdaterades|ändrades/);
});
test('Guardian refuses broken current poster catalogs instead of consulting a cached old index',async()=>{
 const m=model([['Filmer/register.json',JSON.stringify({films:[{title:'Test',year:2026,imdbId:'tt1234567'}]})],['Serier/register.json',JSON.stringify({series:[]})],['Media/poster-catalog.json',JSON.stringify({manualMoviePosters:[{title:'Test',year:2026,file:'missing.jpg'}]})]]);
 const {guardianAssets}=await load('platform/guardian-assets.ts',{replicaReader:m.reader});await assert.rejects(()=>guardianAssets(),/saknas/);
});
test('training distinguishes a missing month from unavailable bytes and refuses stale snapshot results',async()=>{
 const path='Cortex/Data/Dagsloggar/2026/2026-10.json',m=model([[path,JSON.stringify({records:[]})]]),cache=new Map();const {trainingArchive}=await load('platform/training-archive.ts',{replicaReader:m.reader,durableGet:async k=>cache.get(k),durableSet:async(k,v)=>cache.set(k,v)});
 assert.equal((await trainingArchive('2026-09')).state,'empty');m.reader.file=async()=>null;assert.equal((await trainingArchive('2026-10')).state,'unavailable');
});
