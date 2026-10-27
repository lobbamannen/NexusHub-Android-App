import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {create,act} from 'react-test-renderer';
const root=new URL('../',import.meta.url),cache=new Map();
function loadTsx(url){
 if(cache.has(url.href))return cache.get(url.href);
 let code=ts.transpileModule(fs.readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 code=code.replace(/from (["'])([^"']+)\1/g,(full,quote,path)=>{
  let resolved;
  if(path.startsWith('@/'))resolved=new URL(path.slice(2),root);
  else if(path.startsWith('.'))resolved=new URL(path,url);
  if(resolved){if(!/\.[a-z]+$/i.test(resolved.pathname))resolved=new URL(resolved.href+'.tsx');return 'from '+JSON.stringify(resolved.pathname.endsWith('.tsx')?loadTsx(resolved):resolved.href);}
  return 'from '+JSON.stringify(import.meta.resolve(path));
 });
 const data='data:text/javascript;base64,'+Buffer.from(code).toString('base64');cache.set(url.href,data);return data;
}
const {default:ModuleGrid}=await import(loadTsx(new URL('components/home/ModuleGrid.tsx',root)));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const counts={incoming:3,ideas:5,ideasStale:false,files:4484,knowledgeFiles:1214,stories:28,plugins:21,films:251,series:154,watchlist:4,watchNew:1};
async function mount(values=counts){let tree;const routes=[];await act(async()=>{tree=create(React.createElement(ModuleGrid,{counts:values,onNavigate:route=>routes.push(route)}));});return {tree,routes};}
const text=node=>node.children.map(x=>typeof x==='string'?x:text(x)).join('');
test('related routes form two full-width semantic groups with independent buttons',async()=>{
 const {tree,routes}=await mount(),groups=tree.root.findAllByType('article');
 assert.equal(groups.length,2);
 for(const [i,expected] of [['filmer','villse','bevakning'],['databas','filer','mottaget']].entries()){
  const buttons=groups[i].findAllByType('button');assert.equal(buttons.length,3);
  for(const [j,b] of buttons.entries()){assert.equal(b.findAllByType('button').length,1,'no nested interactive controls');await act(async()=>b.props.onClick());assert.equal(routes.at(-1),expected[j]);}
 }
 const all=tree.root.findAllByType('button');assert.equal(all.length,13);
 for(const b of all)await act(async()=>b.props.onClick());
 assert.deepEqual(routes.slice(-13).sort(),['attgora','ideer','filmer','villse','bevakning','databas','filer','mottaget','berattelser','plugins','ekonomi','traning','kalender'].sort());
 assert.deepEqual(routes.slice(-13),['attgora','ideer','kalender','filmer','villse','bevakning','berattelser','plugins','ekonomi','traning','databas','filer','mottaget']);
 assert.match(text(all[5]),/Bevakning/);assert.match(text(all[12]),/Mottagning/);assert.equal(tree.root.findByProps({className:'nh-incoming-badge'}).children.join(''),'3');
 await act(async()=>tree.unmount());
});
test('new indicators and unknown/stale counts remain honest',async()=>{
 const {tree}=await mount();assert.ok(tree.root.findAllByProps({'data-new':true}).length>=2);assert.match(text(tree.root),/5 nya idéer/);assert.match(text(tree.root),/1 nytt/);await act(async()=>tree.unmount());
 const next=await mount({...counts,incoming:0,ideas:null,watchNew:0});assert.equal(next.tree.root.findAllByProps({className:'nh-incoming-badge'}).length,0);assert.match(text(next.tree.root),/Kunde inte verifiera antal/);assert.equal(next.tree.root.findAllByProps({'data-new':true}).length,0);await act(async()=>next.tree.unmount());
 const stale=await mount({...counts,ideasStale:true});assert.match(text(stale.tree.root),/lokal vy/);await act(async()=>stale.tree.unmount());
});
