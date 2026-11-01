import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {loadReactModule} from './helpers/react-module.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve()};
test('RAG metrics and visible source limits describe only complete excerpts sent to native',async()=>{
 const evidence=loadReactModule('platform/rag-evidence.ts');
 const hits=Array.from({length:6},(_,i)=>({chunk:{path:'Research/doc'+i+'.md',id:'chunk'+i,index:i,text:'source'+i+' '+('x'.repeat(1800)),sha:'a'.repeat(40),title:'Source '+i},score:1,reason:'lexical'}));
 let prompt,finish;const pending=new Promise(resolve=>finish=resolve);
 const {default:Component}=loadReactModule('components/intelligence/RetrievalLab.tsx',{
  '@/platform/rag-evidence':evidence,'@/platform/idea-retrieval':{buildIdeaCorpus:async()=>({docs:[],semanticReady:6,semanticTotal:6,commit:'c'.repeat(40)}),searchCorpus:async()=>({hits,mode:'lexical',embeddingMs:0,scanMs:1}),sourceLink:p=>p},
  '@/platform/embedding-bridge':{embeddingStatus:()=>({installed:true}),importEmbeddingModel:()=>true,gemmaRag:async value=>{prompt=value;return pending}},
 },{setInterval:()=>1,clearInterval(){}});
 let view;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(Component));await flush()});
  const buttons=()=>view.root.findAllByType('button');
  await act(async()=>{await buttons()[0].props.onClick();await flush()});
  const question='Q'.repeat(3000);await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:question}}));
  await act(async()=>{buttons().find(b=>b.props.className==='primary').props.onClick();await flush()});
  const used=hits.filter(h=>prompt.includes(h.chunk.path));assert.ok(used.length>0&&used.length<6);assert.ok(prompt.includes(question));
  const stats=()=>Object.fromEntries(view.root.findAllByProps({className:'nh-gemma-stat'}).map(node=>[node.findByType('small').children.join(''),node.findByType('strong').children.join('')]));
  assert.equal(Number(stats().selectedCount),used.length);assert.equal(Number(stats().omittedSourceCount),6-used.length);
  assert.equal(stats().selectedChunkIds,used.map(h=>h.chunk.id).join(' | '));
  for(const hit of hits)assert.equal(stats().sourceWindows.includes(hit.chunk.path),used.includes(hit));
  assert.ok(JSON.stringify(view.toJSON()).includes('Källurval begränsat'));
  await act(async()=>{finish({text:'answer',finishReason:'stop'});await flush()});
  assert.equal(Number(stats().selectedCount),used.length);assert.ok(JSON.stringify(view.toJSON()).includes('Källurval begränsat'));
  await act(async()=>{await buttons()[0].props.onClick();await flush()});
  assert.equal(view.root.findAllByProps({className:'nh-idea-match'}).length,0);assert.deepEqual(stats(),{});assert.ok(!JSON.stringify(view.toJSON()).includes('answer'));
  assert.ok(!JSON.stringify(view.toJSON()).includes('Källurval begränsat'));
 }finally{if(view)await act(async()=>view.unmount())}
});
