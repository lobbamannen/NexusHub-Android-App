import test from 'node:test';
import assert from 'node:assert/strict';
import {planReplica} from '../lib/replica-plan.mjs';
test('adopts previously mirrored versions without downloading; missing bytes and changed SHA are fetched',()=>{
 const files=[{path:'old',sha:'a',size:10},{path:'changed',sha:'new',size:20},{path:'lost',sha:'c',size:30},{path:'repair',sha:'d',size:40}];
 const rows=[{path:'old',blob_sha:'a',object_key:'mirror/databas/a'},{path:'changed',blob_sha:'old',object_key:'mirror/databas/old'},{path:'lost',blob_sha:'c',object_key:'mirror/databas/c'},{path:'repair',blob_sha:'d',object_key:'mirror/repairs/databas/d/custom'}];
 const p=planReplica(files,rows,['mirror/databas/a','mirror/databas/old','mirror/repairs/databas/d/custom'],'databas');
 assert.deepEqual(new Set(p.missing.map(f=>f.path)),new Set(['changed','lost']));assert.equal(p.done,2);assert.equal(p.totalBytes,100);assert.equal(p.doneBytes,50);
});
test('no artificial file count or size ceiling; prioritizes registers',()=>{
 const files=Array.from({length:5000},(_,i)=>({path:'image-'+i+'.jpg',sha:String(i),size:12000000}));files.push({path:'Filmer/register.json',sha:'register',size:100});
 const p=planReplica(files,[],[],'databas');assert.equal(p.missing.length,5001);assert.equal(p.missing[0].path,'Filmer/register.json');
});

test('an existing object marked corrupt is re-fetched despite matching inventory keys',()=>{
 const file={path:'Berattelser/x.md',sha:'a'.repeat(40),size:12};
 const key='mirror/databas/'+file.sha;
 const result=planReplica([file],[{path:file.path,blob_sha:file.sha,object_key:key}],[key],'databas',new Set([file.path+'\0'+file.sha]));
 assert.equal(result.missing.length,1);
 assert.equal(result.current.length,0);
});

test('a corrupted path is repaired without forcing unrelated same-SHA paths',()=>{
 const sha='1'.repeat(40),files=[{path:'one.md',sha,size:8},{path:'two.md',sha,size:8}];
 const versions=files.map(f=>({path:f.path,blob_sha:sha,object_key:'mirror/databas/'+sha}));
 const result=planReplica(files,versions,['mirror/databas/'+sha],'databas',new Set(['one.md\0'+sha]));
 assert.deepEqual(result.missing.map(f=>f.path),['one.md']);
 assert.deepEqual(result.current.map(f=>f.path),['two.md']);
});
