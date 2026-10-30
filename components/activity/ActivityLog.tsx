import {Temporal} from 'temporal-polyfill';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AlertCircle,CheckCircle2,ChevronDown,Clock3,Download,History,RefreshCw,Search,XCircle} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import {activityCategories,activityStatuses} from '@/lib/activity-log.mjs';
import {activityHealth,activityPage,exportActivity,type ActivityEvent,type ActivityQuery} from '@/platform/activity';
import './activity-log.css';

const categories=activityCategories as Record<string,string>,statuses=activityStatuses as Record<string,string>;
const actions:Record<string,string>={
 release_check:'Seriebevakning kontrollerad',weather_refresh:'Väderhämtning',battery_receive:'Batterimätning mottagen',battery_request:'Batterimätning begärd',battery_failure:'Batterisynk misslyckades',battery_timeout:'Batterimätning uteblev',watch_markRead:'Bevakningsfynd markerade som lästa',watch_checkNow:'Seriekontroll beställd',weather_setLocation:'Väderplats ändrad',weather_pinWidget:'Väderwidget begärd',
 added:'Tillagt',updated:'Uppdaterat',deleted:'Raderat',status_changed:'Status ändrad',saved:'Sparat',uploaded:'Uppladdat',transferred:'Vidareöverfört',attachment_added:'Bilaga tillagd',bookmark_changed:'Sparmarkering ändrad',incoming_upload:'Uppladdning från inkorgen',replica_completed:'GitHub-hämtning klar',replica_failed:'GitHub-hämtning misslyckades',save_failed:'Sparning misslyckades',update:'Uppdaterat','set-watchlist':'Vill se ändrat','set-release-watch':'Bevakning ändrad',upsert:'Sparat',remove:'Borttaget',revoke:'Koppling återkallad',

 'document.added':'Dokument tillagt','document.updated':'Dokument uppdaterat','document.deleted':'Dokument raderat',
 'incoming.received':'Material mottaget','incoming.saved':'Material sparat','incoming.upload':'Uppladdning','incoming.uploaded':'Material uppladdat','incoming.deleted':'Inkorgspost raderad','incoming.transferred':'Material vidareöverfört',
 'idea.created':'Idé skapad','idea.updated':'Idé uppdaterad','idea.deleted':'Idé raderad','todo.created':'Uppgift skapad','todo.updated':'Uppgift uppdaterad','todo.deleted':'Uppgift raderad',
 'sync.started':'Synk startad','sync.completed':'Synk klar','sync.failed':'Synk misslyckades','write.started':'Sparning startad','write.completed':'Sparning klar','write.failed':'Sparning misslyckades',
};
const date=(at:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'long',day:'numeric'}).format(new Date(at));
const time=(at:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(at));
function boundary(day:string,next=false){if(!day)return undefined;let date=Temporal.PlainDate.from(day);if(next)date=date.add({days:1});return date.toZonedDateTime({timeZone:'Europe/Stockholm',plainTime:'00:00'}).toInstant().toString();}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function Row({event}:{event:ActivityEvent}){
 const Icon=event.status==='succeeded'||event.status==='local'?CheckCircle2:event.status==='pending'?Clock3:event.status==='cancelled'?XCircle:AlertCircle;
 return <article className={'nh-activity-row nh-activity-'+event.status}>
  <span className="nh-activity-status-icon"><Icon size={21}/></span>
  <div className="nh-activity-row-content"><div className="nh-activity-row-heading"><strong>{actions[event.action]||event.action}</strong><time dateTime={event.at}>{time(event.at)}</time></div>
   {event.title&&<p className="nh-activity-object">{event.title}</p>}
   <p className="nh-activity-meta">{categories[event.category]||event.category}<span>·</span>{statuses[event.status]||event.status}</p>
   <details className="nh-activity-detail"><summary>Visa händelsedetaljer<ChevronDown size={14}/></summary><dl><dt>Tidpunkt</dt><dd>{new Date(event.at).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'})}</dd><dt>Källa</dt><dd>{({app:'NexusHub',user:'Din åtgärd',github:'GitHub',background:'Bakgrundsarbete',native:'Android',system:'Systemet'}as Record<string,string>)[event.source]||event.source}</dd>{event.path&&<><dt>Sökväg</dt><dd>{event.path}</dd></>}{event.objectId&&<><dt>Objekt-ID</dt><dd>{event.objectId}</dd></>}{event.operationId&&<><dt>Arbets-ID</dt><dd>{event.operationId}</dd></>}<dt>Händelse-ID</dt><dd>{event.id}</dd></dl>{event.details!=null&&<pre>{JSON.stringify(event.details,null,2)}</pre>}</details>
  </div>
 </article>;
}
export function ActivityLogSurface({items,total,loading,error,cursor,onMore,onRefresh,onExport,exporting,filters,onFilter}:{items:ActivityEvent[];total:number;loading:boolean;error:string;cursor:string|null;onMore:()=>void;onRefresh:()=>void;onExport:()=>void;exporting:boolean;filters:{search:string;category:string;status:string;from:string;to:string};onFilter:(key:string,value:string)=>void}){
 let previous='';
 return <section className="nh-module-dashboard nh-activity"><header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="violet" size={48}><History size={29}/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · HISTORIK</span><h1>Aktivitetslogg</h1><p>Det som har gjorts, sparats och synkroniserats.</p></div></div></header>
  <div className="nh-activity-toolbar"><button className="secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={17} className={loading?'spin':''}/>Uppdatera</button><button className="secondary" disabled={exporting} onClick={onExport}><Download size={17}/>{exporting?'Förbereder export…':'Exportera hela loggen'}</button></div>
  <div className="nh-activity-filters"><label className="nh-activity-search"><span><Search size={17}/>Sök i händelser</span><input type="search" value={filters.search} onChange={e=>onFilter('search',e.target.value)} placeholder="Namn, sökväg eller arbets-ID"/></label><label>Område<select aria-label="Område" value={filters.category} onChange={e=>onFilter('category',e.target.value)}><option value="">Alla områden</option>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Resultat<select aria-label="Resultat" value={filters.status} onChange={e=>onFilter('status',e.target.value)}><option value="">Alla resultat</option>{Object.entries(statuses).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Från datum<input type="date" value={filters.from} onChange={e=>onFilter('from',e.target.value)}/></label><label>Till datum<input type="date" value={filters.to} min={filters.from||undefined} onChange={e=>onFilter('to',e.target.value)}/></label></div>
  <p className="nh-activity-caption" role="status">{loading&&!items.length?'Läser historiken…':`${total.toLocaleString('sv-SE')} händelser${items.length<total?' · '+items.length+' visas':''}`}</p>
  {error&&<p className="error-banner" role="alert">{error}</p>}
  {!loading&&!error&&!items.length&&<div className="nh-activity-empty"><History size={36}/><h2>Inga händelser i det här urvalet</h2><p>Loggen fylls när något görs. Historik från tiden före uppdateringen återskapas inte.</p></div>}
  <div className="nh-activity-timeline">{items.map(event=>{const day=date(event.at),heading=day!==previous;previous=day;return <React.Fragment key={event.id}>{heading&&<h2 className="nh-activity-day">{day}</h2>}<Row event={event}/></React.Fragment>;})}</div>
  {cursor&&<button className="secondary nh-activity-more" disabled={loading} onClick={onMore}>{loading?'Läser fler…':'Visa äldre händelser'}<ChevronDown size={17}/></button>}
  <p className="nh-activity-caption">Sidbyten loggas inte. Händelser sparas på telefonen och kan exporteras. Ny synkaktivitet utan ändringar ger ingen ny historikpost.</p>
 </section>;
}
export default function ActivityLog(_props:{onNavigate?:(view:string)=>void}={}){
 const [items,setItems]=useState<ActivityEvent[]>([]),[total,setTotal]=useState(0),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[exporting,setExporting]=useState(false),[revision,setRevision]=useState(0);
 const [filters,setFilters]=useState({search:'',category:'',status:'',from:'',to:''});const generation=useRef(0),query=useRef<ActivityQuery>({});
 const load=useCallback(async(append=false)=>{const run=++generation.current;setLoading(true);setError('');try{const page=await activityPage({...query.current,...(append?{cursor}:{}),limit:50});if(run!==generation.current)return;setItems(old=>append?[...old,...page.items.filter(e=>!old.some(x=>x.id===e.id))]:page.items);setTotal(page.total);setCursor(page.nextCursor);}catch(e:any){if(run===generation.current)setError(e.message||'Aktivitetsloggen kunde inte läsas.');}finally{if(run===generation.current)setLoading(false);}},[cursor]);
 const loadRef=useRef(load);loadRef.current=load;
 useEffect(()=>{query.current={search:filters.search,category:filters.category,status:filters.status,from:boundary(filters.from),toExclusive:boundary(filters.to,true)};generation.current++;setItems([]);setCursor(null);const timer=setTimeout(()=>void loadRef.current(),filters.search?250:0);return()=>clearTimeout(timer);},[filters,revision]);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>setRevision(n=>n+1),300);};window.addEventListener('nexus-activity-changed',refresh);const wake=()=>{if(document.visibilityState==='visible')refresh();};document.addEventListener('visibilitychange',wake);return()=>{clearTimeout(timer);generation.current++;window.removeEventListener('nexus-activity-changed',refresh);document.removeEventListener('visibilitychange',wake);};},[]);
 const exportingNow=async()=>{setExporting(true);setError('');try{download(await exportActivity(),'NexusHub-aktivitetslogg-'+new Date().toISOString().slice(0,10)+'.ndjson');}catch(e:any){setError(e.message||'Exporten misslyckades.');}finally{setExporting(false);}};
 return <ActivityLogSurface items={items} total={total} loading={loading} error={error||activityHealth()} cursor={cursor} onMore={()=>void load(true)} onRefresh={()=>setRevision(n=>n+1)} onExport={()=>void exportingNow()} exporting={exporting} filters={filters} onFilter={(key,value)=>setFilters(old=>({...old,[key]:value}))}/>;
}
