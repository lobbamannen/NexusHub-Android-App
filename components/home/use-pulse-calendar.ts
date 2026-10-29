import {useEffect,useState} from 'react';
import {nativeAvailable,nativeCall,phoneRange,type CalendarEvent} from '@/lib/calendar/native-client';
import {calendarOwnEvents} from '@/lib/calendar/domain.mjs';
import {durableGet} from '@/platform/local-store';
export function usePulseCalendar(day:string,revision?:string){
 const [events,setEvents]=useState<CalendarEvent[]>([]),[stale,setStale]=useState(false);
 useEffect(()=>{if(!day)return;let alive=true,generation=0;let own:CalendarEvent[]=[],phone:CalendarEvent[]=[];
  const publish=()=>{if(alive)setEvents([...own,...phone]);};
  const load=async()=>{const run=++generation;phone=[];publish();const current=()=>alive&&run===generation;
   let filters:Record<string,boolean>={};try{filters=await durableGet<Record<string,boolean>>('calendar:filters:v1')||{};}catch{if(current()){own=[];phone=[];publish();setStale(true);}return;}
   if(!current())return;if(filters.nexus===false)own=[];publish();setStale(false);
   const jobs=[(async()=>{if(filters.nexus===false)return;try{const response=await fetch('/api/calendar'),data=await response.json();if(!response.ok||!Array.isArray(data.events))throw Error();if(current()){own=calendarOwnEvents(data.events);if(response.headers.get('X-Nexus-Offline')==='true')setStale(true);publish();}}catch{if(current())setStale(true);}})(),
   (async()=>{if(filters.phone===false||!nativeAvailable())return;try{
    const permission=await nativeCall('calendar.getPermission');if(!current()||!permission.granted)return;
    const sources=await nativeCall('calendar.getSources');if(!current())return;
    const sourceIds=(sources.sources||[]).filter((s:any)=>filters['phone:'+s.id]!==false).map((s:any)=>s.id);if(!sourceIds.length)return;
    const from=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString(),toExclusive=new Date(Date.parse(day+'T00:00:00Z')+8*86400000).toISOString();
    const rows=await phoneRange({from,toExclusive,zone:'Europe/Stockholm',sourceIds},current);
    if(current()){phone=rows;publish();}
   }catch{if(current()){phone=[];publish();setStale(true);}}})()];await Promise.all(jobs);
  };
  const wake=()=>{if(document.visibilityState==='visible')void load();};
  const change=(event:Event)=>{if((event as CustomEvent).detail?.event==='calendar.changed'){generation++;phone=[];publish();wake();}};
  const visibility=()=>{if(document.visibilityState!=='visible'){generation++;phone=[];publish();}else wake();};
  void load();window.addEventListener('nexus-github-changed',wake);window.addEventListener('nexus-write-completed',wake);window.addEventListener('nexus-native-event',change);document.addEventListener('visibilitychange',visibility);
  return()=>{alive=false;generation++;window.removeEventListener('nexus-github-changed',wake);window.removeEventListener('nexus-write-completed',wake);window.removeEventListener('nexus-native-event',change);document.removeEventListener('visibilitychange',visibility);};
 },[day,revision]);
 return {events,stale};
}
