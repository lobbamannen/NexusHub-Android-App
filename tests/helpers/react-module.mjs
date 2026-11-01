import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
export function loadReactModule(path,stubs={},globals={}) {
 const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const module={exports:{}};
 const require=name=>{
  if(Object.hasOwn(stubs,name))return stubs[name];
  if(name==='react')return React;
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  if(name.endsWith('.css'))return {};
  throw Error('Unexpected test dependency: '+name);
 };
 vm.runInNewContext(js,{module,exports:module.exports,require,console,URL,AbortController,DOMException,performance,...globals},{filename:path});
 return module.exports;
}
