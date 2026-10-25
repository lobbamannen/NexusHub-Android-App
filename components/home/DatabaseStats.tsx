'use client';
import React from 'react';
import {Database,CheckCircle2} from 'lucide-react';
type Props={counts:{files:number|null};checkedAt?:string|null;now:Date|null;onNavigate:(id:string)=>void;loading?:boolean};
export default function DatabaseStats({counts,checkedAt,now,onNavigate,loading}:Props){
 const parsed=checkedAt&&!Number.isNaN(Date.parse(checkedAt))?new Date(checkedAt):null;
 const timestamp=parsed&&now?formatRelativeDate(parsed,now):null;
 return <section className="nh-dashboard-stats nh-surface" aria-labelledby="nh-statistics-title">
  <button type="button" className="nh-total-link" onClick={()=>onNavigate('filer')} aria-label="Utforska alla filer i databasen">
   <span className="nh-total-icon"><Database size={28} strokeWidth={1.7} aria-hidden="true"/></span>
   <span className="nh-total-copy">
    <span id="nh-statistics-title" className="nh-total-heading">Din databas</span>
    <span className="nh-total-count"><strong>{typeof counts.files==='number'?counts.files.toLocaleString('sv-SE'):'–'}</strong><span>filer i GitHub</span></span>
   </span>
  </button>
  <div className="nh-sync-state" aria-label={checkedAt?'Katalog hämtad från GitHub':'Katalogstatus ej verifierad'}>
   <span>{checkedAt&&<CheckCircle2 size={15} aria-hidden="true"/>}{checkedAt?'Katalog hämtad':loading?'Hämtar…':'Ej verifierad'}</span>
   {timestamp&&<time dateTime={checkedAt||undefined}>{timestamp}</time>}
  </div>
 </section>;
}

function formatRelativeDate(date:Date,now:Date){
 const midnight=(value:Date)=>new Date(value.getFullYear(),value.getMonth(),value.getDate()).getTime();
 const days=Math.round((midnight(now)-midnight(date))/86400000);
 const time=date.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});
 if(days===0)return 'Idag '+time;
 if(days===1)return 'Igår '+time;
 return date.toLocaleDateString('sv-SE',{day:'numeric',month:'long'})+' '+time;
}
