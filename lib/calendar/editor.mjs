import {Temporal} from 'temporal-polyfill';
import {ownCalendarEvent} from './domain.mjs';
const zone='Europe/Stockholm';
export function switchCalendarKind(event,allDay,fallback){
 if(allDay&&event.kind==='timed'&&event.start&&event.end){
  const start=Temporal.Instant.from(event.start).toZonedDateTimeISO(zone),end=Temporal.Instant.from(event.end).toZonedDateTimeISO(zone);
  const first=start.toPlainDate(),last=end.toPlainDate().add({days:end.toPlainTime().equals(Temporal.PlainTime.from('00:00'))?0:1});
  return {...event,kind:'allDay',allDayStart:first.toString(),allDayEndExclusive:(Temporal.PlainDate.compare(last,first)>0?last:first.add({days:1})).toString()};
 }
 const date=event.allDayStart||fallback,last=event.allDayEndExclusive||Temporal.PlainDate.from(date).add({days:1}).toString();
 const instant=(day,time)=>Temporal.PlainDateTime.from(day+'T'+time).toZonedDateTime(zone).toInstant().toString();
 return {...event,kind:allDay?'allDay':'timed',allDayStart:date,allDayEndExclusive:last,start:event.kind==='allDay'||!event.start?instant(date,'18:00'):event.start,end:event.kind==='allDay'||!event.end?instant(Temporal.PlainDate.from(last).subtract({days:1}).toString(),'19:00'):event.end};
}
export const calendarSaveEvent=event=>{const clean=ownCalendarEvent(event);delete clean.deletedAt;return clean;};
export function selectionInRange(selected,from,toExclusive){return selected>=from&&selected<toExclusive?selected:from;}
