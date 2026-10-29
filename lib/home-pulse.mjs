import {ideaDay} from './idea-numbers.mjs';
/** Relevant facts only: the next seven Stockholm calendar days and confirmed unread releases. */
export function pulseActions(calendar=[],releases=[],now=new Date()){
 const day=ideaDay(now.toISOString()),nowMs=now.getTime(),horizon=nowMs+7*86400000;
 const dates=new Map();
 for(const event of calendar){
  if(!event?.id||!event.title||event.deletedAt)continue;
  const t=event.temporal||{};let start,end;
  if(t.kind==='timed'){start=Date.parse(t.startsAt);end=Date.parse(t.endsAt);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=nowMs||start>horizon||end<=start)continue;}
  else if(t.kind==='allDay'){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(t.startDate||'')||!/^\d{4}-\d{2}-\d{2}$/.test(t.endDateExclusive||'')||t.endDateExclusive<=day||t.endDateExclusive<=t.startDate||t.startDate>ideaDay(new Date(horizon).toISOString()))continue;
   start=Date.parse(t.startDate+'T00:00:00Z');end=Date.parse(t.endDateExclusive+'T00:00:00Z');if(!Number.isFinite(start)||!Number.isFinite(end))continue;
  }else continue;
  dates.set(event.id,{...event,kind:'calendar',at:start,ongoing:t.kind==='timed'?start<=nowMs:t.startDate<=day});
 }
 const next=[...dates.values()].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))[0];
 const groups=new Map();
 for(const e of releases){if(e.readAt||e.availability!=='confirmed_available'||!e.title||!e.seriesKey)continue;
  const group=groups.get(e.seriesKey)||{kind:'release',id:'release:'+e.seriesKey,title:e.title,imdbId:e.imdbId,count:0,ids:new Set(),at:e.observedAt||''};
  if(!group.ids.has(e.id)){group.ids.add(e.id);group.count++;}groups.set(e.seriesKey,group);
 }
 const news=[...groups.values()].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
 return [...(next?[next]:[]),...news].slice(0,2);
}
