import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';

const require=createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const root=new URL('../',import.meta.url);
function load(path,stubs={},globals={}){
 const source=readFileSync(new URL(path,root),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const localRequire=name=>{
  if(Object.hasOwn(stubs,name))return stubs[name];
  if(name==='@/platform/derived-cache'){const store=stubs['@/platform/local-store'];return {derivedGet:store.durableGet,derivedSet:store.durableSet};}
  if(name==='react')return React;
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name.endsWith('.css'))return {};
  throw Error('Unexpected test dependency: '+name);
 };
 vm.runInNewContext(js,{module,exports:module.exports,require:localRequire,console,AbortController,DOMException,performance,...globals},{filename:path});
 return module.exports;
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const docPath='NexusHub inkorg/report.md';
const sourceSha='b'.repeat(40);
const hit={chunk:{path:docPath,id:docPath+'#0',text:'Förändringsbevakning upptäcker ändringar och skickar notifieringar.',title:'Förändringsbevakning och notifieringar',heading:'',index:0,sha:sourceSha,kind:'report'},cosine:null,score:0.5/61,lexicalRank:1,semanticRank:null,reason:'lexical'};
test('lexical fallback retains an explicit topical candidate without claiming semantic confidence',()=>{
 const {rankIdeaRelations}=load('platform/idea-relations.ts');
 const results=rankIdeaRelations('Förändringsbevakning upptäcker ändringar och skickar notifieringar.',[[hit]]);
 assert.equal(results.length,1);
 assert.equal(results[0].confidence,'possible');
 assert.equal(results[0].hit.cosine,null);
 assert.equal(rankIdeaRelations('Android app och databaser',[[{...hit,chunk:{...hit.chunk,title:'Android app',text:'Android app och databaser'}}]]).length,0);
});
test('idea inbox passes saved source text, excluding unsaved drafts',async()=>{
 const captured=[];
 const Icon=()=>null;
 const {default:Inbox}=load('components/ideas/IdeasInbox.tsx',{
  '@/lib/page-scroll-lock.mjs':{lockPageScroll:()=>()=>{}},
  '@/components/ideas/IdeaBulb':Icon,
  '@/components/MaterialIcon':Icon,
  '@/components/NativeBackBridge':{useBackHandler:()=>{}},
  '@/lib/ideas.mjs':{IDEA_STATUSES:{new:'Ny'}},
  '@/components/personal/IdeaAttachments':Icon,
  '@/lib/idea-numbers.mjs':{ideaDay:s=>s.slice(0,10)},
  './IdeaPlans':Icon,'./IdeasArchive':Icon,
  './IdeaIntelligence':props=>{captured.push(props.ideas);return null},
  '@/lib/personal-capture.mjs':{inboxIdeas:rows=>rows.filter(r=>!['completed','dismissed'].includes(r.idea.status))},
  '@/lib/library-state':{useLibraryState:(_key,initial)=>React.useState(initial)}
 });
 const saved={idea:{id:'saved',text:'Sparad källa',status:'new',createdAt:'2026-10-31T10:00:00Z',updatedAt:'2026-10-31T10:00:00Z'},sha:'a'.repeat(40)};
 const draft={...saved,idea:{...saved.idea,text:'Osparad ändring'}};
 const fresh={...draft,idea:{...draft.idea,id:'draft-only',text:'Helt osparad idé'},sha:null};
 const controller={items:[draft,fresh],savedItems:[saved],drafts:{saved:draft,'draft-only':fresh},pending:{},numbering:{entries:[]},confirmedIds:[],ready:true};
 let view;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(Inbox,{ideas:controller,onOpenPlan:()=>{}}));await flush()});
  assert.deepEqual(JSON.parse(JSON.stringify(captured.at(-1))),[{id:'saved',text:'Sparad källa'}]);
  await act(async()=>{view.update(React.createElement(Inbox,{ideas:{...controller,items:[{...draft,idea:{...draft.idea,text:'Fortsatt skrivande'}},fresh]},onOpenPlan:()=>{}}));await flush()});
  assert.deepEqual(JSON.parse(JSON.stringify(captured.at(-1))),[{id:'saved',text:'Sparad källa'}]);
 }finally{if(view)await act(async()=>view.unmount())}
});
function intelligenceHarness(decision){
 const timers=new Set(),window=new EventTarget(),cache=new Map();
 let status={installed:false,importing:false,processing:false,modelSha256:'',profileVersion:'v1',backend:'CPU',bytes:0},builds=0,copied='';
 const candidate={hit,confidence:'possible',evidenceClass:'direct',evidenceTerms:['förändringsbevakning'],distinctPassages:1,evidenceCount:1,score:1,matchedProbes:1,reason:'Textmatchning'};
 const corpus={commit:'c'.repeat(40),docs:[],profile:'',incomplete:false,semanticReady:0,semanticTotal:0,unsupportedFiles:0};
 const {default:Component}=load('components/ideas/IdeaIntelligence.tsx',{
  '@/platform/idea-retrieval':{buildIdeaCorpus:async()=>{builds++;return {...corpus,profile:status.modelSha256}},
   relatedReportCandidates:async()=>[candidate],relationExcerpt:()=>({text:hit.chunk.text,contextIndices:[0]}),sourceLink:()=>docPath},
  '@/platform/local-store':{durableGet:async key=>key.startsWith('nexus-idea-decision:')?decision:cache.get(key),durableSet:async(key,value)=>cache.set(key,value)},
  '@/platform/embedding-bridge':{embeddingStatus:()=>status,importEmbeddingModel:()=>true}
 },{window,navigator:{clipboard:{writeText:async text=>{copied=text}}},
    setInterval:fn=>{timers.add(fn);return fn},clearInterval:fn=>timers.delete(fn)});
 return {Component,get builds(){return builds},get copied(){return copied},importModel(){status={...status,installed:true,modelSha256:'d'.repeat(64)}},poll(){for(const fn of timers)fn()}};
}
test('handoff includes a new document version after an older version was dismissed',async()=>{
 const h=intelligenceHarness({state:'dismissed',sha:'a'.repeat(40),at:'2026-10-30T10:00:00Z'});
 let view;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(h.Component,{ideas:[{id:'idea',text:'Förändringsbevakning'}]}));await flush()});
  const button=view.root.findAllByType('button').find(b=>b.children.some(c=>typeof c==='string'&&c.includes('Kopiera underlag')));
  assert.ok(button);
  await act(async()=>{button.props.onClick();await flush()});
  assert.ok(h.copied.includes(docPath),'new SHA must be included in the copied source package');
 }finally{if(view)await act(async()=>view.unmount())}
});
test('handoff still excludes a dismissed current document version',async()=>{
 const h=intelligenceHarness({state:'dismissed',sha:sourceSha,at:'2026-10-30T10:00:00Z'});
 let view;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(h.Component,{ideas:[{id:'idea',text:'Förändringsbevakning'}]}));await flush()});
  const button=view.root.findAllByType('button').find(b=>b.children.some(c=>typeof c==='string'&&c.includes('Kopiera underlag')));
  await act(async()=>{button.props.onClick();await flush()});
  assert.ok(!h.copied.includes(docPath));
 }finally{if(view)await act(async()=>view.unmount())}
});
test('a newly installed embedding profile triggers one automatic rebuild',async()=>{
 const h=intelligenceHarness();
 let view;
 try{
  await act(async()=>{view=Renderer.create(React.createElement(h.Component,{ideas:[{id:'idea',text:'Förändringsbevakning'}]}));await flush()});
  assert.equal(h.builds,1);
  await act(async()=>{h.importModel();h.poll();await flush()});
  assert.equal(h.builds,2,'completed model import must rebuild with the new profile');
  await act(async()=>{h.poll();await flush()});
  assert.equal(h.builds,2,'unchanged polling must not loop or rebuild');
 }finally{if(view)await act(async()=>view.unmount())}
});
