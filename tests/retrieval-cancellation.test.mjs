import test from 'node:test';
import assert from 'node:assert/strict';
import {loadReactModule} from './helpers/react-module.mjs';
test('query embedding receives cancellation and abort never becomes lexical fallback',async()=>{
 let entered;
 const start=new Promise(resolve=>entered=resolve);
 const {searchCorpus}=loadReactModule('platform/idea-retrieval.ts',{
  './idea-excerpt':{},'./mirror-access':{},'./derived-cache':{},'./idea-relations':{},
  './embedding-bridge':{embedBatch:(_items,signal)=>new Promise((_resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})})},
 });
 const controller=new AbortController(),vector=Array(256).fill(0),profile='profile';
 const work=searchCorpus({profile,docs:[{chunks:[{id:'id',text:'needle',title:'title',heading:'',vector,profile}]}]},'needle',undefined,32,controller.signal);
 await start;controller.abort();await assert.rejects(work,{name:'AbortError'});
 await assert.rejects(searchCorpus({docs:[]},'needle',undefined,32,controller.signal),{name:'AbortError'});
});
