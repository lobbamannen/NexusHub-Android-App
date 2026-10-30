import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeActivity,queryActivity,activityCursor} from '../lib/activity-log.mjs';
const event=(id,extra={})=>({id,at:'2026-10-30T12:00:00.000Z',category:'inbox',action:'document.added',status:'succeeded',source:'app',title:'Forskningsrapport',...extra});
test('activity rejects navigation and malformed events, without inventing history',()=>{
 assert.throws(()=>normalizeActivity(event('a',{action:'page.view'})),/navig/i);
 assert.throws(()=>normalizeActivity(event('a',{at:'bad'})),/tid/i);
 assert.throws(()=>normalizeActivity(event('a',{category:'untrusted'})),/kategori/i);
 assert.deepEqual(queryActivity([],{}),{items:[],nextCursor:null,total:0});
});
test('activity retains useful state but removes credentials and raw report bodies recursively',()=>{
 const value=normalizeActivity(event('safe',{title:'API github_pat_abcdefghijklmnopqrstuvwxyz0123456789',details:{before:{read:false},after:{read:true},token:'secret',body:'full report',nested:{authorization:'Bearer secret',note:'value ghp_abcdefghijklmnopqrstuvwxyz0123456789'}}}));
 assert.deepEqual(value.details.before,{read:false});assert.deepEqual(value.details.after,{read:true});
 assert.equal(value.details.token,undefined);assert.equal(value.details.body,undefined);assert.equal(value.details.nested.authorization,undefined);
 assert.ok(!JSON.stringify(value).includes('abcdefghijklmnopqrstuvwxyz'));assert.match(value.title,/dold/i);
});
test('pagination uses stable time plus identity and does not duplicate equal-time rows',()=>{
 const rows=['a','b','c','d','e'].map(id=>event(id));const first=queryActivity(rows,{limit:2});
 assert.deepEqual(first.items.map(x=>x.id),['e','d']);assert.equal(first.total,5);
 const second=queryActivity(rows,{limit:2,cursor:first.nextCursor});assert.deepEqual(second.items.map(x=>x.id),['c','b']);
 const third=queryActivity(rows,{limit:2,cursor:second.nextCursor});assert.deepEqual(third.items.map(x=>x.id),['a']);assert.equal(third.nextCursor,null);
 assert.equal(activityCursor(first.items[1]),first.nextCursor);
});
test('filters apply category status search date and keep total independent of cursor',()=>{
 const rows=[event('a'),event('b',{category:'ideas',title:'Ny idé',status:'failed'}),event('c',{at:'2026-10-31T12:00:00Z'}),event('d',{path:'Ideer/abc.json',details:{after:{read:true}}})];
 assert.equal(queryActivity(rows,{category:'ideas',status:'failed',search:'idé'}).total,1);
 assert.deepEqual(queryActivity(rows,{search:'ideer/abc'}).items.map(x=>x.id),['d']);
 assert.equal(queryActivity(rows,{from:'2026-10-30T00:00:00Z',toExclusive:'2026-10-31T00:00:00Z'}).total,3);
 assert.throws(()=>queryActivity(rows,{cursor:'not-json'}),/markör/i);
});

test('sanitization excludes camelCase credentials and caps large details without losing event identity',()=>{
 const normalized=normalizeActivity(event('metadata',{details:{githubToken:'leak',accessToken:'leak',api_key:'leak',nested:{clientSecret:'leak',safe:'yes'},many:Array.from({length:100},()=>('long'.repeat(250)))}}));
 assert.ok(!JSON.stringify(normalized).includes('leak'));assert.equal(normalized.id,'metadata');assert.equal(normalized.details.omitted,true);assert.ok(JSON.stringify(normalized).length<24000);
 const redacted=normalizeActivity(event('bearer',{title:'Value Bearer abcdefg and ghp_abcdefghijklmnopqrstuvwxyz'}));assert.ok(!redacted.title.includes('abcdefg'));
});

async function platformSetup(){
 const {readFileSync}=await import('node:fs'),ts=(await import('typescript')).default,kv=new Map();globalThis.window=new EventTarget();
 globalThis.__activityTestStore={fail:false,durableEntries:async prefix=>{if(globalThis.__activityTestStore.fail)throw Error('Disk full');return [...kv].filter(([k])=>k.startsWith(prefix));},durableDelete:async key=>kv.delete(key),durableGet:async key=>kv.get(key),durableSet:async(key,value)=>{if(globalThis.__activityTestStore.fail)throw Error('Disk full');kv.set(key,structuredClone(value));}};
 let source=readFileSync(new URL('../platform/activity.ts',import.meta.url),'utf8').replace("import {durableDelete,durableEntries,durableGet,durableSet} from './local-store';","const {durableDelete,durableEntries,durableGet,durableSet}=globalThis.__activityTestStore;").replace("'@/lib/activity-log.mjs'",JSON.stringify(new URL('../lib/activity-log.mjs',import.meta.url).href));
 const m=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64')+'#'+crypto.randomUUID());return {m,kv};
}
test('oversized operation IDs become stable identities rather than breaking the real write',async()=>{
 const {m}=await platformSetup();const input=event('source:'+('very/long/path/'.repeat(35)));await m.recordActivity(input);await m.recordActivity(input);
 const result=await m.activityPage();assert.equal(result.total,1);assert.equal(result.items[0].title,'Forskningsrapport');assert.ok(result.items[0].id.length<=200);
});
test('activity storage failure cannot reject a successful operation and retained records retry later',async()=>{
 const {m}=await platformSetup();globalThis.__activityTestStore.fail=true;
 await assert.doesNotReject(m.recordActivity(event('retained')));assert.ok(m.activityHealth());
 globalThis.__activityTestStore.fail=false;await m.recordActivity(event('later'));
 const page=await m.activityPage();assert.equal(page.total,2);assert.ok(page.items.some(e=>e.id==='retained'));
});
test('fallback migrates by immutable ID when the native journal returns',async()=>{
 const {m,kv}=await platformSetup();await m.recordActivity(event('one'));assert.equal(kv.size,1);
 const nativeRows=new Map();window.Android={appendActivity:raw=>{const e=JSON.parse(raw);if(!nativeRows.has(e.id))nativeRows.set(e.id,e);return true;},activityPage:raw=>JSON.stringify(queryActivity([...nativeRows.values()],JSON.parse(raw)))};
 await m.recordActivity(event('one',{title:'Replacement'}));const page=await m.activityPage();assert.equal(page.total,1);assert.equal(page.items[0].title,'Forskningsrapport');assert.equal(kv.size,0);
});
