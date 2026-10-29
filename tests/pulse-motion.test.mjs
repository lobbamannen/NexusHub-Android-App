import test from 'node:test';import assert from 'node:assert/strict';
import {pulseActions} from '../lib/home-pulse.mjs';
import {runTransition} from '../lib/motion-lifecycle.mjs';
const now=new Date('2026-10-29T12:00:00Z');
const event=(id,start,end)=>({id,title:id,source:'nexus',temporal:{kind:'timed',startsAt:start,endsAt:end}});
test('Pulse selects next/ongoing events, groups confirmed unread releases and caps at two',()=>{
 const calendar=[event('past','2026-10-29T09:00Z','2026-10-29T10:00Z'),event('next','2026-10-29T14:00Z','2026-10-29T15:00Z'),event('later','2026-10-30T14:00Z','2026-10-30T15:00Z')];
 const releases=[{id:'a',seriesKey:'series1',title:'Series',availability:'confirmed_available',season:2,episode:1},{id:'b',seriesKey:'series1',title:'Series',availability:'confirmed_available',season:2,episode:2},{id:'c',seriesKey:'other',availability:'unknown'}];
 const rows=pulseActions(calendar,releases,now);assert.equal(rows.length,2);assert.equal(rows[0].id,'next');assert.equal(rows[1].count,2);
 assert.deepEqual(pulseActions([],[],now),[]);
});
test('Pulse respects Stockholm all-day exclusive end, rejects invalid dates, deduplicates and excludes distant events',()=>{
 const allDay={id:'day',title:'Day',temporal:{kind:'allDay',startDate:'2026-10-29',endDateExclusive:'2026-10-30'}};
 assert.equal(pulseActions([allDay,allDay],[],now).length,1);
 assert.equal(pulseActions([allDay],[],new Date('2026-10-29T23:30Z')).length,0);
 assert.equal(pulseActions([event('bad','xxx','xxx'),event('far','2026-12-01T12:00Z','2026-12-01T13:00Z')],[],now).length,0);
});
test('motion fallback and failures apply a navigation exactly once',async()=>{
 let count=0;await runTransition(()=>{count++;},null);assert.equal(count,1);
 await runTransition(()=>{count++;},{startViewTransition(){throw Error('unsupported');}});assert.equal(count,2);
 const failure=Error('update failed');await assert.rejects(runTransition(()=>{throw failure;},null),failure);
});
test('queued transitions apply callbacks in order, even after an earlier failure',async()=>{
 const {createTransitionQueue}=await import('../lib/motion-lifecycle.mjs');const queue=createTransitionQueue(),seen=[];let release,start;const started=new Promise(resolve=>{start=resolve;});
 const first=queue(()=>new Promise(resolve=>{release=()=>{seen.push(1);resolve();};start();}));
 const second=queue(()=>{seen.push(2);});await started;assert.deepEqual(seen,[]);release();await Promise.all([first,second]);assert.deepEqual(seen,[1,2]);
 await assert.rejects(queue(()=>{throw Error('test');}));await queue(()=>seen.push(3));assert.deepEqual(seen,[1,2,3]);
});
