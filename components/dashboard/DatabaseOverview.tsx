'use client';
import MaterialIcon from '@/components/MaterialIcon';
import React,{useMemo,useState} from 'react';
import {databaseCategoryOverview} from '@/lib/module-dashboard.mjs';
import {ArrowDown, BookOpen, CheckCircle2, ChevronDown, Clock3, Database, FolderOpen, Layers} from 'lucide-react';

type Entry={path:string;module:string;category?:string;technical?:boolean};
type Props={
 documents:Entry[]; fileCount?:number|null; fetchedAt?:string|null;complete?:boolean|null;
 selectedCategory:string;onSelectCategory:(category:string)=>void;loading:boolean;toolbar?:React.ReactNode
};
const format=(n:number)=>n.toLocaleString('sv-SE');
export default function DatabaseOverview({documents,fileCount,fetchedAt,complete,selectedCategory,onSelectCategory,loading,toolbar}:Props){
 const [expanded,setExpanded]=useState(false);
 const overview=useMemo(()=>databaseCategoryOverview(documents),[documents]);
 const categories=overview.categories;
 const total=overview.count;
 const visible=expanded?categories:categories.slice(0,8);
 const timestamp=fetchedAt&&!Number.isNaN(Date.parse(fetchedAt))?new Date(fetchedAt).toLocaleString('sv-SE'):null;
 const dataReady=!!fetchedAt||total>0;
 return <section className="nh-module-dashboard nh-database-dashboard" aria-labelledby="nh-db-title">
  <header className="nh-module-dashboard-header">
   <div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="blue" size={48}><Database size={29} aria-hidden="true"/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · KUNSKAPSBANKEN</span><h1 id="nh-db-title">Utforska databasen</h1><p>Hitta dokument, metoder och kunskap i din GitHub-databas.</p></div></div>
   <span className="nh-catalog-status"><span className="nh-status-line">{timestamp?<CheckCircle2 size={16} aria-hidden="true"/>:<Clock3 size={16} aria-hidden="true"/>}{timestamp?'Katalog hämtad':loading?'Hämtar katalog…':'Katalog ej verifierad'}</span>{timestamp&&<small>{timestamp}</small>}</span>
  </header>
  <div className="nh-module-stat-row" aria-label="Databasöversikt">
   <div className="nh-module-stat nh-tone-purple"><MaterialIcon tone="violet" size={30}><BookOpen size={22} aria-hidden="true"/></MaterialIcon><strong>{dataReady?format(total):'–'}</strong><span>Katalogposter</span></div>
   <div className="nh-module-stat nh-tone-blue"><MaterialIcon tone="violet" size={30}><Layers size={22} aria-hidden="true"/></MaterialIcon><strong>{dataReady?format(categories.length):'–'}</strong><span>Ämneskategorier</span></div>
   <div className="nh-module-stat nh-tone-green"><MaterialIcon tone="violet" size={30}><Database size={22} aria-hidden="true"/></MaterialIcon><strong>{typeof fileCount==='number'?format(fileCount):'–'}</strong><span>GitHub-filer</span></div>
  </div>
  {complete===false&&<p className="nh-dashboard-note">GitHub-katalogen är ofullständig. Visade antal gäller endast det innehåll som kunde hämtas.</p>}
  {toolbar}
  <div className="nh-module-category-head"><div><span className="nh-module-eyebrow">BLÄDDRA</span><h2>Välj ett ämne</h2><p>Tryck på en kategori för att filtrera dokumentlistan.</p></div></div>
  <div className="nh-module-category-grid" aria-label="Databasens kategorier">
   {visible.map(({name,count},index)=><button type="button" key={name} className={'nh-module-category-card nh-category-'+index%4+(selectedCategory===name?' selected':'')} aria-pressed={selectedCategory===name} onClick={()=>onSelectCategory(name)}>
    <span className="nh-category-icon"><MaterialIcon tone={index%2?'violet':'blue'} size={33}><Layers size={23} aria-hidden="true"/></MaterialIcon></span><span className="nh-category-copy"><strong>{name}</strong><small>{format(count)} {count===1?'post':'poster'}</small></span><ArrowDown size={17} className="nh-category-arrow" aria-hidden="true"/>
   </button>)}
  </div>
  {categories.length>8&&<button type="button" className="nh-category-expand" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?'Visa färre kategorier':'Visa alla '+categories.length+' kategorier'}<ChevronDown size={17} className={expanded?'nh-rotated':''}/></button>}
  {!loading&&dataReady&&categories.length===0&&<p className="nh-dashboard-note">Inga ämneskategorier kunde identifieras i den aktuella katalogen.</p>}
 </section>;
}
