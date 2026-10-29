import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import React from 'react';import {create,act} from 'react-test-renderer';
const root=new URL('../',import.meta.url);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// Render the production presentation with a stubbed image transport (no browser or native API).
let code=fs.readFileSync(new URL('components/home/HomePulse.tsx',root),'utf8');
code=code.replace(/^import .*from '\.\/use-pulse-calendar';$/m,'const usePulseCalendar=()=>({events:[],stale:false});');
code=code.replace(/^import RepositoryPoster.*$/m,'const RepositoryPoster=({children})=>children;');
code=code.replace(/^import '\.\/pulse-motion.css';$/m,'');
code=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from (["'])([^"']+)\1/g,(_,q,path)=>'from '+JSON.stringify(path.startsWith('@/')?new URL(path.slice(2),root).href:import.meta.resolve(path)));
const {PulseSurface}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('production Pulse hides empty state and zero counters, routes each visible action correctly',async()=>{
 let tree;const calls=[];const props={snapshot:{counts:{}},actions:[],stale:false,onNavigate:x=>calls.push(x),onOpenSeries:x=>calls.push(x)};
 await act(async()=>{tree=create(React.createElement(PulseSurface,props));});assert.equal(tree.toJSON(),null);
 await act(async()=>tree.update(React.createElement(PulseSurface,{...props,snapshot:{counts:{ideas:3,films:0}},actions:[{id:'s',kind:'release',title:'Test',count:2,imdbId:'tt123'}]})));
 const buttons=tree.root.findAllByType('button');assert.equal(buttons.length,2);await act(async()=>{buttons[0].props.onClick();buttons[1].props.onClick();});assert.deepEqual(calls,['ideer','tt123']);assert.equal(buttons[0].props['aria-label'],'3 nya idéer idag');
 await act(async()=>tree.unmount());
});
