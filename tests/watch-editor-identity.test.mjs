import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {loadReactModule} from './helpers/react-module.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function harness(){
 const store=new Map(),reads=[],writes=[];let editor,holdRead,holdCancel,holdWrite;
 const result=()=>({sha:'current',register:{series:[]}});
 const response=(data=result(),status=200)=>({ok:status===200,status,headers:{get:()=>null},json:async()=>data});
 const {useWatchEditor}=loadReactModule('components/watch/ReleaseWatch.tsx',{
  '@/components/MaterialIcon':()=>null,'@/lib/calendar/native-client':{},'@/lib/calendar/domain.mjs':{},
  '@/platform/local-store':{durableGet:async k=>store.get(k),durableSet:async(k,v)=>{store.set(k,v)},durableDelete:async k=>{store.delete(k)}},
  '@/platform/outbox':{cancelQueuedEdits:()=>holdCancel?.promise||Promise.resolve()},'@/platform/watch-sync':{syncWatchState:async()=>{}},'./use-watch-state':{},
 },{fetch:async(_url,options)=>{
  if(options?.method==='POST'){writes.push(JSON.parse(options.body));return holdWrite?.promise||response({...result(),saved:true})}
  reads.push(options);return options?.cache==='reload'&&holdRead?holdRead.promise:response();
 },crypto:{randomUUID:()=>String(Math.random())},window:new EventTarget(),CustomEvent:class extends Event{constructor(n,o){super(n);this.detail=o?.detail}}});
 function Component({id}){editor=useWatchEditor('series',id,()=>({id}),value=>{if(value.invalid)throw Error('Invalid settings');return {target:{id},value}});return null}
 return {Component,store,reads,writes,response,get editor(){return editor},holdRead(){return holdRead=deferred()},holdCancel(){return holdCancel=deferred()},holdWrite(){return holdWrite=deferred()}};
}
async function scenario(run){const h=harness();let view;try{
 await act(async()=>{view=Renderer.create(React.createElement(h.Component,{id:'A'}));await flush()});
 const switchTo=async id=>{await act(async()=>{view.update(React.createElement(h.Component,{id}));await flush()})};
 await run(h,switchTo);
}finally{if(view)await act(async()=>view.unmount())}}
test('late conflict resolution cannot replace B or a newly reopened A',async()=>scenario(async(h,switchTo)=>{
 await act(async()=>{await h.editor.edit({id:'A',enabled:true})});
 const held=h.holdRead();let work;
 await act(async()=>{work=h.editor.resolve(true);await flush()});
 await switchTo('B');await switchTo('A');
 await act(async()=>{await h.editor.edit({id:'A',enabled:false})});
 held.resolve(h.response());await act(async()=>{await work;await flush()});
 assert.equal(h.editor.value.enabled,false);assert.equal(h.store.get('watch:draft:A').value.enabled,false);assert.equal(h.editor.busy,false);
}));
test('late undo cannot clear the newly opened series draft',async()=>scenario(async(h,switchTo)=>{
 await act(async()=>{await h.editor.edit({id:'A'})});
 const held=h.holdCancel();let work;await act(async()=>{work=h.editor.undo();await flush()});
 await switchTo('B');await act(async()=>{await h.editor.edit({id:'B',enabled:true})});
 held.resolve();await act(async()=>{await work;await flush()});
 assert.equal(h.editor.value.id,'B');assert.equal(h.editor.value.enabled,true);assert.ok(h.store.has('watch:draft:A'));assert.equal(h.editor.notice,'Utkast sparat på telefonen. Välj Spara för GitHub.');
}));
test('a late save conflict remains bound to its original target and never sets B error or conflict',async()=>scenario(async(h,switchTo)=>{
 await act(async()=>{await h.editor.edit({id:'A'})});
 const held=h.holdWrite();let work;await act(async()=>{work=h.editor.save();await flush()});
 assert.equal(h.writes[0].target.id,'A');await switchTo('B');
 held.resolve(h.response({error:'conflict'},409));await act(async()=>{await work;await flush()});
 assert.equal(h.editor.value.id,'B');assert.equal(h.editor.error,'');assert.equal(h.editor.conflict,null);assert.equal(h.editor.busy,false);assert.ok(h.store.has('watch:draft:A'));
}));

test('invalid draft validation releases the editor and preserves undo',async()=>scenario(async(h)=>{
 await act(async()=>{await h.editor.edit({invalid:true})});
 await act(async()=>{await h.editor.save();await flush()});
 assert.equal(h.editor.busy,false);assert.match(h.editor.error,/Invalid settings/);assert.ok(h.editor.draft);assert.equal(h.writes.length,0);
 await act(async()=>{await h.editor.undo();await flush()});assert.equal(h.editor.draft,null);
}));
