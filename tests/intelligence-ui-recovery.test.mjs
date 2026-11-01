import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {loadReactModule} from './helpers/react-module.mjs';
import {buildGemmaContext} from '../lib/gemma-context.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
function harness(){
 const data=new Map(),events=[],timers=new Set();let fail=false,back,focused='',opened=0,closed=0;
 const document=new EventTarget();Object.assign(document,{body:{style:{overflow:'auto'}},activeElement:null});
 const controls=['first','last'].map(name=>({focus(){focused=name;document.activeElement=this}}));
 const window=new EventTarget();Object.assign(window,{setInterval:fn=>{timers.add(fn);return fn},clearInterval:fn=>timers.delete(fn),Android:{gemmaStatus:()=>JSON.stringify({imported:true,config:{temperature:0.7,topP:0.9}}),gemmaChatSend:()=>true,gemmaLatestResult:()=> '{}',gemmaSaveProfile:()=> '{}'}});
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>{events.push('set:'+k);if(fail&&k==='nexus_gemma_chat_v1')throw Error('full');data.set(k,v)},removeItem:k=>{events.push('remove:'+k);data.delete(k)}};
 const {default:Component}=loadReactModule('components/intelligence/NexusIntelligence.tsx',{
  './RetrievalLab':()=>null,'@/lib/gemma-context.mjs':{buildGemmaContext},'@/components/NativeBackBridge':{useBackHandler:(_priority,fn)=>{back=fn}},
 },{window,document,localStorage:storage,crypto:{randomUUID:()=> 'request-1'}});
 const nodeMock=element=>{
  if(element.type==='dialog')return {showModal(){opened++},close(){closed++}};
  if(element.props.role==='dialog')return {querySelector:()=>controls[0],querySelectorAll:()=>controls,focus(){focused='container'}};
  return {focus(){focused='trigger'},scrollTo(){},scrollHeight:0};
 };
 return {Component,data,events,window,document,nodeMock,controls,get opened(){return opened},get closed(){return closed},get focused(){return focused},set fail(value){fail=value},back:()=>back()};
}
async function scenario(run){const h=harness();let view;try{await act(async()=>{view=Renderer.create(React.createElement(h.Component),{createNodeMock:h.nodeMock});await flush()});await run(h,view);}finally{if(view)await act(async()=>view.unmount())}}
const button=(view,label)=>view.root.findAllByType('button').find(b=>b.children.includes(label));
test('native reply remains recoverable until the transcript is durable, then replay is idempotent',async()=>scenario(async(h,view)=>{
 await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'question'}}));
 await act(async()=>button(view,' Skicka').props.onClick());
 const reply={requestId:'request-1',ok:true,result:{text:'Saved answer',finishReason:'stop'}};
 const deliver=()=>{const e=new Event('nexus-gemma-chat');e.detail=reply;h.window.dispatchEvent(e)};
 h.fail=true;await act(async()=>deliver());assert.equal(h.data.get('nexus_gemma_pending_v1'),'request-1');
 h.fail=false;h.events.length=0;await act(async()=>deliver());
 assert.equal(h.data.has('nexus_gemma_pending_v1'),false);
 assert.ok(h.events.indexOf('set:nexus_gemma_chat_v1')<h.events.indexOf('remove:nexus_gemma_pending_v1'));
 await act(async()=>deliver());assert.equal(JSON.parse(h.data.get('nexus_gemma_chat_v1')).filter(m=>m.id==='reply:request-1').length,1);
}));
test('settings use a native modal, contain initial reverse tab, and require a decision for unsaved edits',async()=>scenario(async(h,view)=>{
 await act(async()=>button(view,' Inställningar').props.onClick());assert.equal(h.opened,1);assert.equal(h.focused,'first');
 const tab=new Event('keydown',{cancelable:true});Object.assign(tab,{key:'Tab',shiftKey:true});await act(async()=>h.document.dispatchEvent(tab));assert.equal(tab.defaultPrevented,true);assert.equal(h.focused,'last');
 await act(async()=>view.root.findAllByType('input')[0].props.onChange({target:{value:'0.8'}}));
 await act(async()=>h.back());assert.equal(view.root.findAllByType('dialog').length,1);assert.ok(button(view,'Kasta ändringar'));
 await act(async()=>button(view,'Fortsätt redigera').props.onClick());assert.equal(view.root.findAllByType('dialog').length,1);
 const escape=new Event('keydown',{cancelable:true});Object.assign(escape,{key:'Escape'});await act(async()=>h.document.dispatchEvent(escape));assert.ok(button(view,'Kasta ändringar'));
 await act(async()=>button(view,'Kasta ändringar').props.onClick());assert.equal(view.root.findAllByType('dialog').length,0);assert.equal(h.document.body.style.overflow,'auto');assert.equal(h.focused,'trigger');
}));
