import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
let code=fs.readFileSync(new URL('../lib/navigation-motion.ts',import.meta.url),'utf8').replace("import {retainLocalImage} from '@/platform/resources';",'const retainLocalImage=()=>({release(){}});').replace("import {flushSync} from 'react-dom';",'const flushSync=fn=>fn();').replace("import './navigation-motion.css';",'').replace("from './motion-lifecycle.mjs'",'from '+JSON.stringify(new URL('../lib/motion-lifecycle.mjs',import.meta.url).href));
code=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {navigateMotion}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
class Image{constructor(){this.dataset={nexusPoster:'test',posterKind:'films'};this.currentSrc='blob:test';this.style={removeProperty(key){delete this[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}};}getBoundingClientRect(){return {width:100,height:150};}getAttribute(){return null;}}
function setup(startViewTransition){globalThis.HTMLImageElement=Image;const source=new Image();globalThis.window={matchMedia:()=>({matches:false}),scrollTo(){}};globalThis.document={querySelectorAll:()=>[source],querySelector:()=>null,activeElement:null,documentElement:{dataset:{}},startViewTransition};return source;}
test('synchronous capture rejection cleans source names and root state, while navigation runs once',async()=>{
 const source=setup(()=>{throw Error('capture unsupported');});let count=0;await navigateMotion(()=>count++,'detail',{kind:'films',key:'test'});assert.equal(count,1);assert.equal(source.style.viewTransitionName,undefined);assert.deepEqual(document.documentElement.dataset,{});
});
test('rapid actions serialize updates, skip old animation and leave no permanent names',async()=>{
 const finishes=[];let skipped=0;const source=setup(update=>{
  let finish;const finished=new Promise(resolve=>finish=resolve);finishes.push(finish);const updateCallbackDone=Promise.resolve().then(update);return {updateCallbackDone,ready:Promise.resolve(),finished,skipTransition(){skipped++;finish();}};
 });const seen=[];await Promise.all([navigateMotion(()=>seen.push(1),'detail',{kind:'films',key:'test'}),navigateMotion(()=>seen.push(2),'back',{kind:'films',key:'test'})]);for(const finish of finishes)finish();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(seen,[1,2]);assert.equal(skipped,1);assert.equal(source.style.viewTransitionName,undefined);assert.deepEqual(document.documentElement.dataset,{});
});

test('missing capture API still animates the new content once',async()=>{
 setup(undefined);const motions=[];const stage={animate(frames,options){motions.push({frames,options});return {cancel(){}};}};document.querySelector=()=>stage;let updated=0;await navigateMotion(()=>updated++,'forward');assert.equal(updated,1);assert.equal(motions.length,1);assert.ok(motions[0].options.duration>=250);
});
test('failed capture readiness falls back to content motion without repeating navigation',async()=>{
 setup(update=>{const updateCallbackDone=Promise.resolve().then(update);return {updateCallbackDone,ready:Promise.reject(Error('capture rejected')),finished:updateCallbackDone,skipTransition(){}};});const motions=[];document.querySelector=()=>({animate(){motions.push(1);return {cancel(){}};}});let count=0;await navigateMotion(()=>count++);await new Promise(r=>setImmediate(r));assert.equal(count,1);assert.equal(motions.length,1);
});
test('reduced motion performs navigation with no capture or fallback animation',async()=>{
 setup(()=>{throw Error('must not capture');});window.matchMedia=()=>({matches:true});document.querySelector=()=>({animate(){throw Error('must not animate');}});let count=0;await navigateMotion(()=>count++);assert.equal(count,1);
});
test('Android module navigation uses live content motion and never installs a snapshot input layer',async()=>{
 let snapshots=0;setup(update=>{snapshots++;const updateCallbackDone=Promise.resolve().then(update);return {updateCallbackDone,ready:Promise.resolve(),finished:updateCallbackDone,skipTransition(){}};});
 window.Android={};const animations=[];document.querySelector=()=>({animate(frames,options){animations.push({frames,options});return {cancel(){}};}});
 let count=0;await navigateMotion(()=>count++,'forward');assert.equal(count,1);assert.equal(snapshots,0);assert.equal(animations.length,1);assert.deepEqual(document.documentElement.dataset,{});
});
