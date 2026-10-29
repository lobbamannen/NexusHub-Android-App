import React,{useEffect,useState} from 'react';
import {Lightbulb,Clapperboard,Tv,BookOpen,CalendarDays,ChevronRight} from 'lucide-react';
import {dailyWidgetSnapshot} from '@/lib/widget-activity.mjs';
import {ideaDay} from '@/lib/idea-numbers.mjs';
import {pulseActions} from '@/lib/home-pulse.mjs';
import RepositoryPoster from '@/components/repository-poster';
import {usePulseCalendar} from './use-pulse-calendar';
import type {ReleaseEvent} from '@/lib/calendar/native-client';
import './pulse-motion.css';
const slots=[['ideas','ideer','idéer',Lightbulb],['films','filmer','filmer',Clapperboard],['series','serier','serier',Tv],['stories','berattelser','berättelser',BookOpen]] as const;
export function PulseSurface({snapshot,actions,stale,onNavigate,onOpenSeries,revision=''}:{snapshot:{counts:Record<string,number>};actions:any[];stale:boolean;onNavigate:(view:string)=>void;onOpenSeries:(id:string)=>void;revision?:string}){
 const counters=slots.filter(([key])=>snapshot.counts[key]>0);
 if(!counters.length&&!actions.length)return null;
 return <section className="nh-pulse" aria-label="Just nu i NexusHub" data-stale={stale||undefined}><div className="nh-pulse-heading"><span>JUST NU</span></div>
 {counters.length>0&&<div className="nh-pulse-counters" aria-label="Nytt idag">{counters.map(([key,view,label,Icon])=><button key={key} data-kind={key} type="button" aria-label={snapshot.counts[key]+' nya '+label+' idag'} onClick={()=>onNavigate(view)}><Icon size={16}/><strong>{snapshot.counts[key].toLocaleString('sv-SE')}</strong></button>)}</div>}
 {actions.map(action=>{const calendar=action.kind==='calendar',Icon=calendar?CalendarDays:Tv;return <button className="nh-pulse-action" data-kind={action.kind} key={action.id} type="button" onClick={()=>calendar?onNavigate('kalender'):action.imdbId?onOpenSeries(action.imdbId):onNavigate('bevakning')}>
 <span className="nh-pulse-art">{!calendar&&action.imdbId?<RepositoryPoster kind="series" posterKey={action.imdbId} revision={revision} alt=""><Icon size={20}/></RepositoryPoster>:<Icon size={20}/>}</span>
 <span className="nh-pulse-copy"><strong>{action.title}</strong><small>{calendar?calendarLabel(action):action.count+' '+(action.count===1?'nytt fynd':'nya fynd')+' · Bekräftat i Sverige'}</small></span><ChevronRight size={16}/></button>;})}
 </section>;
}
function calendarLabel(event:any){const t=event.temporal;if(t.kind==='allDay')return (event.ongoing?'Idag':new Date(t.startDate+'T12:00Z').toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm',weekday:'short',day:'numeric',month:'short'}))+' · Heldag';return (event.ongoing?'Pågår · ':'')+new Date(t.startsAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
export default function HomePulse({now,revision,ideaEntries,ideasStale,releases,onNavigate,onOpenSeries,posterRevision}:{now:Date|null;revision?:string;ideaEntries:{createdAt:string}[];ideasStale:boolean;releases:ReleaseEvent[];onNavigate:(view:string)=>void;onOpenSeries:(id:string)=>void;posterRevision:string}){
 const day=now?ideaDay(now.toISOString()):'';const [activity,setActivity]=useState<any>(null),[offline,setOffline]=useState(false);const calendar=usePulseCalendar(day,revision);
 useEffect(()=>{if(!day)return;let alive=true;const controller=new AbortController();let request=0;
 const load=async()=>{const own=++request;try{const response=await fetch('/api/daily-activity',{signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(alive&&own===request){setActivity(data);setOffline(response.headers.get('X-Nexus-Offline')==='true'||!!data.unavailable?.length);}}catch{if(alive&&own===request)setOffline(true);}};
 void load();window.addEventListener('nexus-github-changed',load);window.addEventListener('online',load);return()=>{alive=false;controller.abort();window.removeEventListener('nexus-github-changed',load);window.removeEventListener('online',load);};},[day,revision]);
 if(!now)return null;
 return <PulseSurface snapshot={dailyWidgetSnapshot(activity,ideaEntries,now)} actions={pulseActions(calendar.events,releases,now)} stale={offline||ideasStale||calendar.stale} onNavigate={onNavigate} onOpenSeries={onOpenSeries} revision={posterRevision}/>;
}
