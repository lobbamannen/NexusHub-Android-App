import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarDaySelection,eventInCalendarDay,closeDayFromSwipe,calendarDayEvents} from '../lib/calendar/view.mjs';

test('a day opens, the same day toggles shut, another day stays open, and a dialog blocks toggles',()=>{
 assert.deepEqual(calendarDaySelection({date:'2026-10-28',open:false},'2026-10-28'),{date:'2026-10-28',open:true});
 assert.deepEqual(calendarDaySelection({date:'2026-10-28',open:true},'2026-10-28'),{date:'2026-10-28',open:false});
 assert.deepEqual(calendarDaySelection({date:'2026-10-28',open:true},'2026-10-29'),{date:'2026-10-29',open:true});
 assert.deepEqual(calendarDaySelection({date:'2026-10-28',open:true},'2026-10-29',true),{date:'2026-10-28',open:true});
});
test('day membership respects Stockholm DST boundaries and exclusive event ends',()=>{
 const timed={temporal:{kind:'timed',startsAt:'2026-10-24T22:30:00Z',endsAt:'2026-10-25T23:00:00Z'}};
 assert.equal(eventInCalendarDay(timed,'2026-10-24'),false);
 assert.equal(eventInCalendarDay(timed,'2026-10-25'),true);
 assert.equal(eventInCalendarDay(timed,'2026-10-26'),false);
 const overnight={temporal:{kind:'timed',startsAt:'2026-10-28T22:30:00Z',endsAt:'2026-10-29T01:00:00Z'}};
 assert.equal(eventInCalendarDay(overnight,'2026-10-28'),true);
 assert.equal(eventInCalendarDay(overnight,'2026-10-29'),true);
});
test('all-day ranges exclude the end date and date-only media match only their date',()=>{
 const allDay={temporal:{kind:'allDay',startDate:'2026-10-28',endDateExclusive:'2026-10-30'}};
 assert.equal(eventInCalendarDay(allDay,'2026-10-29'),true);
 assert.equal(eventInCalendarDay(allDay,'2026-10-30'),false);
 assert.equal(eventInCalendarDay({temporal:{kind:'date',date:'2026-10-28'}},'2026-10-28'),true);
 assert.equal(eventInCalendarDay({temporal:{kind:'date',date:'2026-10-28'}},'2026-10-29'),false);
});
test('day list retains every matching event with all-day entries then time order',()=>{
 const rows=[{id:'late',temporal:{kind:'timed',startsAt:'2026-10-28T17:00:00Z',endsAt:'2026-10-28T18:00:00Z'}},{id:'date',temporal:{kind:'date',date:'2026-10-28'}},{id:'early',temporal:{kind:'timed',startsAt:'2026-10-28T08:00:00Z',endsAt:'2026-10-28T09:00:00Z'}}];
 assert.deepEqual(calendarDayEvents(rows,'2026-10-28').map(e=>e.id),['date','early','late']);
 assert.equal(rows[0].id,'late');
});
test('only a deliberate downward handle swipe closes; canceled or sideways gestures do not',()=>{
 assert.equal(closeDayFromSwipe({x:10,y:20},{x:16,y:80}),true);
 assert.equal(closeDayFromSwipe({x:10,y:20},{x:90,y:80}),false);
 assert.equal(closeDayFromSwipe({x:10,y:20},{x:10,y:-60}),false);
 assert.equal(closeDayFromSwipe({x:10,y:20},{x:10,y:50}),false);
 assert.equal(closeDayFromSwipe(null,{x:10,y:100}),false);
});
