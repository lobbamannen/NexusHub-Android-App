import Lightbulb from '@/components/ideas/IdeaBulb';
import React,{useEffect,useState} from 'react';
import {Clapperboard,Tv,BookOpen,ChevronRight} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import {ideaDay} from '@/lib/idea-numbers.mjs';
import './daily-activity.css';
export default function DailyActivity({now,revision,ideaEntries,ideasStale,onNavigate}:{now:Date|null;revision?:string;ideaEntries:{createdAt:string}[];ideasStale:boolean;onNavigate:(view:string)=>void}){
 const day=now?ideaDay(now.toISOString()):'';
 const [activity,setActivity]=useState<any>(null),[offline,setOffline]=useState(false);
 useEffect(()=>{if(!day)return;let active=true;const controller=new AbortController();
 const load=async()=>{try{const response=await fetch('/api/daily-activity',{signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(active){setActivity(data);setOffline(response.headers.get('X-Nexus-Offline')==='true');}}catch{if(active)setOffline(true);}};
 void load();window.addEventListener('nexus-github-changed',load);window.addEventListener('online',load);
 return()=>{active=false;controller.abort();window.removeEventListener('nexus-github-changed',load);window.removeEventListener('online',load);};
 },[day,revision]);
 const counts=activity?.day===day?activity.counts:{};
 const cards=[{key:'films',view:'filmer',label:'Nya filmer',count:counts?.films,Icon:Clapperboard,tone:'ruby' as const},{key:'series',view:'serier',label:'Nya serier',count:counts?.series,Icon:Tv,tone:'blue' as const},{key:'stories',view:'berattelser',label:'Nya berättelser',count:counts?.stories,Icon:BookOpen,tone:'blue' as const},{key:'ideas',view:'ideer',label:'Nya idéer',count:day?ideaEntries.filter(e=>ideaDay(e.createdAt)===day).length:0,Icon:Lightbulb,tone:'orange' as const}].filter(c=>c.count>0);
 if(!cards.length)return null;
 return <section className="nh-daily" aria-label="Nytt idag"><span className="nh-module-eyebrow">NYTT IDAG</span><div className="nh-daily-grid">{cards.map(({key,view,label,count,Icon,tone})=><button type="button" key={key} className="nh-daily-card" onClick={()=>onNavigate(view)}><MaterialIcon tone={tone} size={30}><Icon size={20}/></MaterialIcon><span><strong>+{count}</strong><small>{count===1?({films:'Ny film',series:'Ny serie',stories:'Ny berättelse',ideas:'Ny idé'} as Record<string,string>)[key]:label}</small></span><ChevronRight size={16}/></button>)}</div>{(offline||ideasStale)&&<small className="nh-daily-note">Senast hämtade uppgifter – väntar på uppdatering.</small>}</section>;
}
