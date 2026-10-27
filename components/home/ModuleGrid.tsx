'use client';
import React from 'react';
import IdeaBulb from '@/components/ideas/IdeaBulb';
import {CalendarGlyph} from '@/components/calendar/CalendarGlyph';
import MaterialIcon,{type MaterialTone} from '@/components/MaterialIcon';
import {BookOpen,Clapperboard,Database,FolderOpen,Bookmark,Puzzle,Dumbbell,Coins,ChevronRight,Bell} from 'lucide-react';

type Counts={ideas:number|null;ideasStale:boolean;files:number|null;knowledgeFiles:number|null;stories:number|null;plugins:number|null;films:number|null;series:number|null;watchlist:number|null;watchNew?:number};
type Props={counts:Counts;onNavigate:(view:string)=>void};
type Card={id:string;title:string;icon:React.ElementType;tone:MaterialTone;art:string};
const cards:Record<string,Card>={
 attgora:{id:'attgora',title:'Att göra',icon:Bookmark,tone:'violet',art:'upload'},
 ideer:{id:'ideer',title:'Idéinkorg',icon:IdeaBulb,tone:'orange',art:'ideas'},
 filmer:{id:'filmer',title:'Film & serier',icon:Clapperboard,tone:'ruby',art:'cinema'},
 villse:{id:'villse',title:'Vill se',icon:Bookmark,tone:'violet',art:'upload'},
 bevakning:{id:'bevakning',title:'Seriebevakning',icon:Bell,tone:'blue',art:'stories'},
 databas:{id:'databas',title:'Kunskapsbanken',icon:Database,tone:'blue',art:'knowledge'},
 filer:{id:'filer',title:'Utforska filer',icon:FolderOpen,tone:'green',art:'files'},
 mottaget:{id:'mottaget',title:'Mottagningsinkorg',icon:FolderOpen,tone:'pink',art:'files'},
 berattelser:{id:'berattelser',title:'Berättelser',icon:BookOpen,tone:'blue',art:'stories'},
 plugins:{id:'plugins',title:'Plugins',icon:Puzzle,tone:'pink',art:'plugins'},
 ekonomi:{id:'ekonomi',title:'Ekonomi',icon:Coins,tone:'green',art:'economy'},
 traning:{id:'traning',title:'Träning',icon:Dumbbell,tone:'orange',art:'training'},
 kalender:{id:'kalender',title:'Kalender',icon:CalendarGlyph,tone:'gold',art:'ideas'}
};
export default function ModuleGrid({counts,onNavigate}:Props){
 const formatted=(n:number|null)=>typeof n==='number'?n.toLocaleString('sv-SE'):null;
 const films=formatted(counts.films),series=formatted(counts.series);
 const details:Record<string,string|null>={
  ideer:counts.ideas===null?'Kunde inte verifiera antal':formatted(counts.ideas)+' nya idéer'+(counts.ideasStale?' · lokal vy':''),
  filmer:films!==null&&series!==null?films+' filmer · '+series+' serier':null,
  databas:counts.knowledgeFiles!==null?formatted(counts.knowledgeFiles)+' dokument':null,
  filer:counts.files!==null?formatted(counts.files)+' filer':null,
  berattelser:counts.stories!==null?formatted(counts.stories)+' berättelser':null,
  plugins:counts.plugins!==null?formatted(counts.plugins)+' pluginpaket':null,
  villse:counts.watchlist!==null?formatted(counts.watchlist)+' objekt':null
 };
 const content=(card:Card)=>{const Icon=card.icon;return <>
  <MaterialIcon size="module" tone={card.tone} className="nh-module-symbol"><Icon size={35} aria-hidden="true"/></MaterialIcon>
  <span className="nh-module-copy"><strong>{card.title}</strong>{details[card.id]&&<span className="nh-module-count">{details[card.id]}</span>}</span>
  <span className="nh-module-decoration" aria-hidden="true"><Icon size={125} strokeWidth={.7}/></span><ChevronRight className="nh-module-chevron" size={22} aria-hidden="true"/>
 </>;};
 const standalone=(id:string,compact=false)=>{const card=cards[id];return <button type="button" key={id} className={'nh-module-card nh-tone-'+card.tone+' nh-art-'+card.art+(compact?' nh-module-compact':'')+(id==='kalender'?' nh-module-calendar':'')} data-new={id==='ideer'&&counts.ideas!==null&&counts.ideas>0||undefined} onClick={()=>onNavigate(id)}>{content(card)}</button>;};
 const group=(id:string,children:string[])=>{const card=cards[id];return <article className={'nh-module-card nh-module-group nh-tone-'+card.tone+' nh-art-'+card.art} aria-label={card.title}>
  <button type="button" className="nh-module-main" onClick={()=>onNavigate(id)}>{content(card)}</button>
  <div className="nh-module-shortcuts">{children.map(child=>{const item=cards[child],Icon=item.icon,unread=child==='bevakning'?(counts.watchNew||0):0;return <button type="button" className="nh-module-shortcut" key={child} data-new={unread>0||undefined} onClick={()=>onNavigate(child)}>
   <MaterialIcon size={24} tone={item.tone}><Icon size={17}/></MaterialIcon><span className="nh-shortcut-copy"><strong>{child==='mottaget'?'Mottagning':child==='bevakning'?'Bevakning':item.title}</strong>{unread>0?<small className="nh-shortcut-badge">{formatted(unread)} {unread===1?'nytt':'nya'}</small>:details[child]?<small>{details[child]}</small>:null}</span><ChevronRight size={14} aria-hidden="true"/>
  </button>;})}</div>
 </article>;};
 return <section className="nh-modules" aria-label="Utforska Nexus Hub"><div className="nh-module-grid">
  {standalone('attgora',true)}{standalone('ideer',true)}
  {standalone('kalender',true)}
  {group('filmer',['villse','bevakning'])}
  {['berattelser','plugins','ekonomi','traning'].map(id=>standalone(id))}
  {group('databas',['filer','mottaget'])}
 </div></section>;
}
