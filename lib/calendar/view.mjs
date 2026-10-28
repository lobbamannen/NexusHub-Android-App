import {Temporal} from 'temporal-polyfill';

// View state only: dialogs consume interaction before the underlying month.
export function calendarDaySelection(current,date,dialogOpen=false){
 if(dialogOpen)return current;
 return {date,open:date!==current.date||!current.open};
}
export function eventInCalendarDay(event,date,zone='Europe/Stockholm'){
 const t=event.temporal;
 if(t.kind==='allDay')return t.startDate<=date&&t.endDateExclusive>date;
 if(t.kind!=='timed')return t.date===date;
 const day=Temporal.PlainDate.from(date);
 const start=day.toZonedDateTime(zone).epochMilliseconds;
 const end=day.add({days:1}).toZonedDateTime(zone).epochMilliseconds;
 return Date.parse(t.startsAt)<end&&Date.parse(t.endsAt)>start;
}
export function calendarDayEvents(events,date){
 return events.filter(event=>eventInCalendarDay(event,date)).sort((a,b)=>{
  const at=a.temporal.kind==='timed'?Date.parse(a.temporal.startsAt):-Infinity;
  const bt=b.temporal.kind==='timed'?Date.parse(b.temporal.startsAt):-Infinity;
  return at===bt?String(a.title||'').localeCompare(String(b.title||''),'sv'):at-bt;
 });
}
export function closeDayFromSwipe(start,end){
 if(!start)return false;
 const dy=end.y-start.y,dx=end.x-start.x;
 return dy>=54&&dy>Math.abs(dx)*1.25;
}
