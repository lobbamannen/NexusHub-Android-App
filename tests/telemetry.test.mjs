import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeEvent,createTelemetry,bucketDuration,categoryForPath,confirmedActions} from '../lib/telemetry.mjs';
test('allowlist removes private content and rejects invalid enum values',()=>{
 const e=sanitizeEvent('section_viewed',{module:'ideer',title:'CANARY secret',token:'github_pat_CANARY',path:'/private'});
 assert.deepEqual(e,{name:'section_viewed',properties:{module:'ideer'}});
 assert.equal(sanitizeEvent('secret_CANARY',{}),null);
 assert.equal(sanitizeEvent('section_viewed',{module:'CANARY'}),null);
 assert.equal(sanitizeEvent('section_viewed',{module:{text:'CANARY'}}),null);
});
test('disabled, unsupported and throwing telemetry never affect app actions',async()=>{
 const sent=[];const t=createTelemetry({send:async e=>sent.push(e),enabled:()=>false});
 await t.capture('section_viewed',{module:'hem'});assert.equal(sent.length,0);
 const broken=createTelemetry({send:async()=>{throw Error('CANARY')},enabled:()=>true});
 await assert.doesNotReject(broken.capture('section_viewed',{module:'hem'}));
});
test('navigation deduplicates by actual module without object identity',async()=>{
 const sent=[];const t=createTelemetry({send:async e=>sent.push(e),enabled:()=>true});
 await t.section('hem');await t.section('hem');await t.section('filmer');await t.section('filmer');
 assert.equal(sent.length,2);assert.equal(sent[1].properties.module,'filmer');
});
test('technical samples capped, writes not sampled',async()=>{
 const sent=[];const t=createTelemetry({send:async e=>sent.push(e),enabled:()=>true});
 for(let i=0;i<30;i++)await t.capture('image_load_slow',{screen_group:'library',duration_bucket:'over3s'});
 for(let i=0;i<25;i++)await t.capture('github_write_conflict',{category:'media'});
 assert.equal(sent.filter(e=>e.name==='image_load_slow').length,20);assert.equal(sent.filter(e=>e.name==='github_write_conflict').length,25);
});
test('only confirmed writes derive safe domain events',()=>{
 const body={kind:'json',text:JSON.stringify({kind:'series',edits:[{changes:{releaseWatch:{enabled:true},status:'Sedd'},target:{title:'CANARY'}}]})};
 const actions=confirmedActions('/api/media-register',body);
 assert(actions.some(e=>e.name==='series_watch_toggled'&&e.properties.state==='on'));
 assert(!JSON.stringify(actions).includes('CANARY'));assert.equal(categoryForPath('/api/media-register'),'media');
 assert.equal(bucketDuration(1200),'1to3s');
});
test('malformed action metadata cannot turn a confirmed write into a failure',()=>{
 for(const input of [null,{edits:{}},{edits:[null]},42])assert.doesNotThrow(()=>confirmedActions('/api/media-register',{kind:'json',text:JSON.stringify(input)}));
});
