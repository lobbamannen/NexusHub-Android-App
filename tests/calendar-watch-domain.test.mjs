import test from 'node:test';import assert from 'node:assert/strict';
import {applyCalendarChange,applyReleaseWatch,mergeWatchHistory,watchSettings,calendarMediaEvents} from '../lib/calendar/domain.mjs';
const id='389420c0-12c9-4b89-8277-c156f103b85f';
test('own calendar patch preserves unrelated records and rejects private provider events',()=>{
 const a={id,title:'Träning',kind:'timed',start:'2026-10-26T18:00:00+01:00',end:'2026-10-26T19:00:00+01:00',timezone:'Europe/Stockholm',source:'nexushub',notes:''};
 const base={schemaVersion:1,custom:123,events:[{...a,id:'a19e008c-12c9-4b89-8277-c156f103b85f'}]};
 const next=applyCalendarChange(base,{action:'upsert',event:a});assert.equal(next.events.length,2);assert.equal(next.custom,123);
 assert.throws(()=>applyCalendarChange(base,{action:'upsert',event:{...a,source:'phone'}}));
 const deleted=applyCalendarChange(next,{action:'delete',id});assert.ok(deleted.events.find(e=>e.id===id).deletedAt);assert.equal(deleted.events.length,2);
 assert.throws(()=>applyCalendarChange(base,{action:'upsert',event:{...a,end:a.start}}));
});
test('release patch preserves ratings, viewing history and unknown fields',()=>{
 const item={title:'Test',startYear:2025,imdbId:'tt1234567',ourRating:8,watchedSeasons:[1],future:42};
 const next=applyReleaseWatch({schemaVersion:1,series:[item]},item,{enabled:true,episodes:true,seasons:true,providerMode:'my_subscriptions',providerIds:[]});
 assert.deepEqual({...next.series[0],releaseWatch:undefined},{...item,releaseWatch:undefined});assert.equal(next.series[0].releaseWatch.enabled,true);
});
test('merge event history is idempotent, keeps latest facts/read receipt and never turns discovery into release date',()=>{
 const a={id:'episode:1',seriesKey:'tt1234567',title:'Test',season:1,episode:2,provider:'netflix',country:'SE',kind:'episode',availability:'confirmed_available',sourceName:'Källa',observedAt:'2026-10-26T12:00:00Z'};
 const merged=mergeWatchHistory({schemaVersion:1,events:[{...a,readAt:'2026-10-26T13:00:00Z'}]},[a]);assert.equal(merged.events.length,1);assert.ok(merged.events[0].readAt);
 assert.equal(calendarMediaEvents(merged.events).length,0);
 assert.equal(calendarMediaEvents([{...a,releaseDate:'2026-10-27',datePrecision:'day'}]).length,1);
});
test('settings validate providers and quiet-hour times',()=>{assert.equal(watchSettings({providers:['netflix']}).checkIntervalHours,6);assert.throws(()=>watchSettings({providers:['unknown']}));assert.throws(()=>watchSettings({quietHours:{enabled:true,from:'25:00',to:'08:00'}}));});
test('history compares instants rather than ISO text when source precision differs',()=>{const e={id:'precision',seriesKey:'tt1234567',title:'Test',season:1,episode:2,provider:'netflix',country:'SE',kind:'episode',availability:'confirmed_upcoming',sourceName:'Test',observedAt:'2026-10-26T12:00:00.123Z',readAt:'2026-10-26T12:00:00.123Z',notifiedAt:'2026-10-26T12:00:00.123Z'};const later=mergeWatchHistory({schemaVersion:1,events:[e]},[{...e,availability:'confirmed_available',observedAt:'2026-10-26T12:00:00Z',readAt:'2026-10-26T12:00:00Z',notifiedAt:'2026-10-26T12:00:00Z'}]);assert.equal(later.events[0].availability,'confirmed_upcoming');assert.equal(later.events[0].readAt,e.readAt);assert.equal(later.events[0].notifiedAt,e.notifiedAt);});
