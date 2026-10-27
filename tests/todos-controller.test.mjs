import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {create,act} from 'react-test-renderer';
const root=new URL('../',import.meta.url),file=p=>new URL(p,root).href;
const harness={values:new Map(),put:async()=>{},reads:0,posts:0,fail:false,sha:'a'.repeat(40),items:[]};
globalThis.__todoHarness=harness;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window=new EventTarget();globalThis.confirm=()=>true;
const storage=`export async function durableGet(k){return globalThis.__todoHarness.values.get(k)};export async function durableSet(k,v){await globalThis.__todoHarness.put(k,v);globalThis.__todoHarness.values.set(k,structuredClone(v));};export async function durableDelete(k){globalThis.__todoHarness.values.delete(k)}`;
let source=fs.readFileSync(new URL('../components/personal/use-todos.ts',import.meta.url),'utf8').replace("'react'",JSON.stringify(file('node_modules/react/index.js'))).replace("'@/platform/local-store'",JSON.stringify('data:text/javascript;base64,'+Buffer.from(storage).toString('base64'))).replace("'@/lib/personal-capture.mjs'",JSON.stringify(file('lib/personal-capture.mjs')));
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {useTodos}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
let controller;
function Probe(){controller=useTodos();return null;}
async function mount(){
 harness.values.clear();harness.put=async()=>{};harness.reads=0;harness.posts=0;harness.fail=false;harness.sha='a'.repeat(40);harness.items=[];
 globalThis.fetch=async(_,opts={})=>{if(opts.method==='POST'){harness.posts++;const b=JSON.parse(opts.body);if(harness.fail||b.expectedSha!==harness.sha)return Response.json({error:'Konflikt'},{status:409});harness.items=b.data.items;harness.sha='b'.repeat(40);return Response.json({saved:true,sha:harness.sha,data:b.data});}harness.reads++;harness.lastReadCache=opts.cache;return Response.json({sha:harness.sha,data:{schemaVersion:1,items:harness.items}});};
 let tree;await act(async()=>{tree=create(React.createElement(Probe));});return tree;
}
test('quick save locks before awaiting persistence; duplicate submit or editing cannot lose text',async()=>{
 const tree=await mount();let release;const gate=new Promise(r=>release=r);
 harness.put=async key=>{if(key==='todos:compose:v1')await gate;};
 await act(async()=>{controller.begin();});await act(async()=>{controller.changeCompose({...controller.compose,text:'Original'});});
 let save,second;await act(async()=>{save=controller.saveQuick();second=controller.saveQuick();});
 assert.equal(controller.busy,true,'whole save is locked before pending durable write finishes');
 await act(async()=>{controller.changeCompose({...controller.compose,text:'Should be blocked'});});
 assert.equal(controller.compose.text,'Original');
 await act(async()=>{release();assert.equal(await save,true);assert.equal(await second,false);});
 assert.equal(harness.posts,1);assert.equal(harness.items.length,1);assert.equal(harness.items[0].text,'Original');assert.equal(controller.compose,null);
 await act(async()=>tree.unmount());
});
test('failed quick save retains draft and stable ID; retry preserves other edits',async()=>{
 const tree=await mount();await act(async()=>controller.edit([{id:'22345678-1234-4234-8234-123456789abc',text:'Other edit',done:false}]));
 await act(async()=>controller.begin());await act(async()=>controller.changeCompose({...controller.compose,text:'Keep me'}));const id=controller.compose.id;
 harness.fail=true;await act(async()=>assert.equal(await controller.saveQuick(),false));
 assert.equal(controller.compose.text,'Keep me');assert.equal(controller.dirty,true);assert.equal(harness.values.get('todos:draft:v1').data.items.length,2);
 harness.fail=false;await act(async()=>assert.equal(await controller.saveQuick(),true));
 assert.deepEqual(harness.items.map(x=>x.text),['Other edit','Keep me']);assert.equal(harness.items[1].id,id);assert.equal(harness.values.has('todos:draft:v1'),false);
 await act(async()=>tree.unmount());
});
test('GitHub change reloads clean list but never replaces local draft',async()=>{
 const tree=await mount();assert.equal(harness.lastReadCache,'no-store','initial read keeps local-first API projection available');harness.items=[{id:'22345678-1234-4234-8234-123456789abc',text:'From GitHub',done:false}];
 await act(async()=>window.dispatchEvent(new Event('nexus-github-changed')));
 assert.equal(controller.snapshot.data.items[0]?.text,'From GitHub');
 await act(async()=>controller.edit([{...harness.items[0],text:'Local draft'}]));
 const reads=harness.reads;await act(async()=>window.dispatchEvent(new Event('nexus-github-changed')));
 assert.equal(harness.reads,reads);assert.equal(controller.snapshot.data.items[0].text,'Local draft');await act(async()=>tree.unmount());
});
