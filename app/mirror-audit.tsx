'use client';
import React,{useEffect,useRef,useState} from 'react';
import {ShieldCheck,ShieldAlert,RefreshCw,Database,Loader2,Play,Pause,Wrench,CheckCircle2,AlertTriangle,ChevronLeft,ChevronRight} from 'lucide-react';
import './mirror-audit.css';

type Audit={exists:boolean,busy?:boolean,runId?:string,commit?:string,startedAt?:string,updatedAt?:string,done?:boolean,cursor?:number,total?:number,counts?:Record<string,number>,repaired?:number,repairFailures?:number,repairPending?:number,repairRetryable?:number,bytesChecked?:number,issueTotal?:number,allIssueTotal?:number,items?:{path:string,state:string,reason:string,repaired?:boolean,historical?:boolean,size:number}[],offset?:number,filter?:string};
const statuses:Record<string,string>={ok:'Byteverifierad',unmirrored:'Ej speglad',outdated:'Äldre spegelversion',missing:'Saknad R2-fil',corrupt:'Korrupt R2-innehåll',oversized:'Över storleksgränsen',unknown:'Ej verifierbar',repaired:'Reparerad'};
async function api(path:string,post=false){const r=await fetch('/api/portal/audit'+path,{method:post?'POST':'GET',cache:'no-store',headers:post?{'Content-Type':'application/json'}:{}});const data=await r.json() as Audit&{error?:string};if(!r.ok||data.error)throw Error(data.error||'Kontrollen kunde inte slutföras.');return data;}
export default function MirrorAudit(){
 const [audit,setAudit]=useState<Audit|null>(null),[filter,setFilter]=useState('all'),[offset,setOffset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[operation,setOperation]=useState('');
 const running=useRef(false),mounted=useRef(true);
 const query=(f=filter,o=offset)=>'?filter='+encodeURIComponent(f)+'&offset='+o;
 const load=async(f=filter,o=offset)=>{try{const next=await api(query(f,o));if(mounted.current)setAudit(next);}catch(e:any){if(mounted.current)setError(e.message);}};
 useEffect(()=>{mounted.current=true;void load('all',0);return()=>{running.current=false;mounted.current=false;};},[]);
 const cycle=async(action:'next'|'repair')=>{
  if(running.current)return;running.current=true;setBusy(true);setOperation(action==='next'?'Kontrollerar R2-original…':'Reparerar från GitHub…');setError('');
  try{
   while(running.current&&document.visibilityState==='visible'){
    const result=await api('/'+action,true);
    if(!mounted.current)break;
    const updated=await api(query(filter,0));
    if(!mounted.current)break;
    setAudit(updated);setOffset(0);
    if(result.busy){running.current=false;setError('En annan kontrollomgång körs redan. Förloppet är sparat.');break;}
    if(action==='next'&&updated.done)break;
    if(action==='repair'&&!updated.repairPending)break;
    // Yield between bounded requests so the browser remains responsive.
    await new Promise(resolve=>setTimeout(resolve,100));
   }
  }catch(e:any){if(mounted.current)setError(e.message||'Kontrollen pausades.');}
  finally{running.current=false;if(mounted.current){setBusy(false);setOperation('');}}
 };
 const begin=async()=>{setBusy(true);setError('');try{const response=await api('/start',true);setAudit(response);setFilter('all');setOffset(0);if(response.busy)setError('En annan kontroll pågår. Prova igen om en stund.');}catch(e:any){setError(e.message||'Kunde inte starta.');}finally{setBusy(false);}};
 const restart=async()=>{running.current=false;setBusy(true);setError('');try{const result=await api('/restart',true);setAudit(result);setFilter('all');setOffset(0);}catch(e:any){setError(e.message||'Kunde inte börja om.');}finally{setBusy(false);}};
 const retry=async()=>{setBusy(true);setError('');try{setAudit(await api('/retry-repairs',true));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const percent=audit?.total?Math.round((audit.cursor||0)*100/audit.total):0;
 const count=(state:string)=>audit?.counts?.[state]||0;
 return <section className="audit-panel" aria-label="Verifiera hela databasen">
  <div className="audit-header"><span className="audit-heading-icon"><ShieldCheck size={24}/></span><div><h2>Verifiera hela databasen</h2><p>Kontrollerar faktiska R2-filer mot GitHubs aktuella original och de tidigare spegelversioner vi behållit.</p></div></div>
  <div className="audit-intro"><Database size={17}/><span>GitHub är huvudkällan. Kontrollen använder en fast GitHub-commit och fortsätter i små omgångar. Avsluta och återuppta när du vill.</span></div>
  {!audit?.exists?<div className="audit-empty"><p>Ingen fullständig bytekontroll är registrerad ännu. Starta genomgången för att upptäcka även filer som har rätt registrerad filhash men fel eller saknat R2-innehåll.</p><button className="primary" disabled={busy} onClick={begin}><Play size={18}/>Starta integritetskontroll</button></div>:<>
   <div className="audit-meta"><span>Aktuell GitHub-snapshot: <code>{audit.commit?.slice(0,12)}</code></span><span>Startad: {audit.startedAt?new Date(audit.startedAt).toLocaleString('sv-SE'):'–'}</span></div>
   <div className="audit-progress-bar" role="progressbar" aria-label="Kontrollerade filer" aria-valuenow={audit.cursor||0} aria-valuemin={0} aria-valuemax={audit.total||0}><div style={{width:percent+'%'}}/></div>
   <div className="audit-progress-caption"><strong>{audit.cursor?.toLocaleString('sv-SE')} / {audit.total?.toLocaleString('sv-SE')}</strong><span>{audit.done?'Genomgången slutförd':percent+' % granskade'} · {((audit.bytesChecked||0)/1048576).toFixed(1)} MiB byteverifierade</span></div>
   <div className="audit-counts">{(['ok','unmirrored','outdated','missing','corrupt','oversized','unknown'] as const).map(state=><div key={state} className={'audit-count audit-'+state}><strong>{count(state)}</strong><span>{statuses[state]}</span></div>)}</div>
   <div className="audit-actions">
    {!audit.done?<button className="primary" onClick={()=>void cycle('next')} disabled={busy}>{busy&&operation.includes('Kontrollerar')?<Loader2 className="spin" size={17}/>:<Play size={17}/>} {busy&&operation.includes('Kontrollerar')?'Kontrollerar…':'Fortsätt verifiera alla filer'}</button>:<button className="secondary" disabled={busy} onClick={begin}><RefreshCw size={17}/>Starta ny kontroll</button>}
    {!audit.done&&<button className="secondary" disabled={busy} onClick={()=>void restart()}><RefreshCw size={17}/>Börja om kontrollen</button>}
    {audit.done&&!!audit.repairPending&&<button className="primary" disabled={busy} onClick={()=>void cycle('repair')}><Wrench size={17}/>Reparera lokala kopior ({audit.repairPending})</button>}
    {audit.done&&!!audit.repairRetryable&&<button className="secondary" disabled={busy} onClick={retry}><RefreshCw size={17}/>Försök igen med misslyckade reparationer ({audit.repairRetryable})</button>}
    {busy&&operation&&<button className="secondary" onClick={()=>{running.current=false;}}><Pause size={17}/>Pausa efter aktuell filomgång</button>}
    <button className="audit-reload" disabled={busy} onClick={()=>void load(filter,offset)}><RefreshCw size={16}/>Hämta status</button>
   </div>
   {audit.done&&<p className="audit-summary"><CheckCircle2 size={17}/>{audit.repaired||0} lokala filer har reparerats och omverifierats efter skrivning. {audit.allIssueTotal||0} avvikelser är ännu inte åtgärdade. {audit.repairFailures||0} reparationsförsök har misslyckats.</p>}
   <div className="audit-issues-head"><h3>Resultat och avvikelser</h3><select value={filter} aria-label="Filtrera integritetsstatus" onChange={e=>{const next=e.target.value;setFilter(next);setOffset(0);void load(next,0);}}><option value="all">Alla olösta ({audit.allIssueTotal||0})</option>{Object.entries(statuses).filter(([v])=>v!=='ok').map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></div>
   <div className="audit-issues">
    {(audit.items||[]).map(item=><div className={'audit-issue '+item.state} key={item.path}><span>{item.state==='corrupt'||item.state==='missing'?<ShieldAlert size={19}/>:<AlertTriangle size={18}/>}</span><div><strong>{item.path}{item.historical?' · Historisk spegelversion':''}</strong><small>{statuses[item.state]||item.state} · {item.reason}</small></div></div>)}
    {!audit.items?.length&&<p className="audit-no-issues">Inga avvikelser i det valda filtret.</p>}
   </div>
   {(audit.issueTotal||0)>50&&<div className="audit-pager"><button disabled={!offset||busy} onClick={()=>{const o=Math.max(0,offset-50);setOffset(o);void load(filter,o);}}><ChevronLeft size={16}/>Föregående</button><span>{offset+1}–{Math.min(offset+50,audit.issueTotal||0)} av {audit.issueTotal}</span><button disabled={offset+50>=(audit.issueTotal||0)||busy} onClick={()=>{const o=offset+50;setOffset(o);void load(filter,o);}}>Nästa<ChevronRight size={16}/></button></div>}
   <p className="audit-explain">Korrekt registrerad SHA räcker inte för grönt resultat: SHA-256 och Git blob-SHA räknas om från verkliga R2-bytes. ”Ej verifierbar” och filer över 10 MiB räknas aldrig som godkända. Historiska spegelversioner granskas separat mot sina registrerade Git blob-SHA; deras GitHub-commit kan krävas vid reparation. Vanliga lokala inkorgsuppladdningar ingår inte. Reparation skriver endast till R2/D1, aldrig till GitHub.</p>
  </>}
  {error&&<p className="audit-error" role="alert"><ShieldAlert size={18}/>{error}</p>}
 </section>;
}
