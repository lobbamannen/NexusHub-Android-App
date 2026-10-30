import test from 'node:test';
import assert from 'node:assert/strict';
import {mutationActivities, snapshotActivities, fileActivities} from '../lib/activity-events.mjs';
test('story read writes preserve the object and exact selected state, without recording reads or secrets',()=>{
 assert.deepEqual(mutationActivities('/api/story-status','GET',{},{}),[]);
 const [e]=mutationActivities('/api/story-status','POST',{action:'set',path:'Berattelser/A.md',field:'read',value:true,token:'secret'},{saved:true});
 assert.equal(e.category,'stories');assert.equal(e.objectId,'Berattelser/A.md');assert.deepEqual(e.details.changes,{read:true});assert.ok(!JSON.stringify(e).includes('secret'));
});
test('batch media changes record each title and seen/favourite fields',()=>{
 const events=mutationActivities('/api/media-register','POST',{kind:'films',edits:[{target:'tt1234567',changes:{status:'seen',favorite:true}}]},{saved:true,register:{films:[{imdbId:'tt1234567',title:'Testfilm'}]}});
 assert.equal(events.length,1);assert.equal(events[0].title,'Testfilm');assert.equal(events[0].details.changes.status,'seen');assert.equal(events[0].objectId,'tt1234567');
});
test('snapshot comparison distinguishes additions, changed read state, deletion and unchanged snapshots',()=>{
 const a={items:[{id:'a',text:'Äldre uppgift',done:false}]},b={items:[{id:'a',text:'Äldre uppgift',done:true},{id:'b',text:'Ny uppgift',done:false}]};
 const events=snapshotActivities('todos',a,b);assert.equal(events.length,2);assert.equal(events.find(e=>e.objectId==='a').details.after.done,true);assert.equal(events.find(e=>e.objectId==='b').action,'added');
 assert.equal(snapshotActivities('todos',null,b).length,0,'first observation is a baseline, not invented history');
 assert.equal(snapshotActivities('todos',b,b).length,0);assert.equal(snapshotActivities('todos',b,a).find(e=>e.objectId==='b').action,'deleted');
});
test('file history ignores log archives, labels external observations honestly and retains deleted names',()=>{
 const previous=[{path:'Berattelser/A.md',sha:'a'},{path:'System/NexusHub/Aktivitetslogg/x.json',sha:'b'}],next=[{path:'Berattelser/B.md',sha:'c'}];
 const events=fileActivities(previous,next);assert.equal(events.length,2);assert.ok(events.every(e=>e.source==='github'));assert.ok(events.some(e=>e.action==='deleted'&&e.path==='Berattelser/A.md'));assert.equal(fileActivities(null,next).length,0);
});
