'use client';
import React,{useEffect,useMemo,useState} from 'react';
import {BrainCircuit,Settings,RefreshCw,Download,Play,Pause,Square,AlertTriangle,FolderOpen,HardDrive,CheckCircle2,Activity,Clock,ChevronDown} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import {syncIntelligenceIndex,intelligenceIndexProgress} from '@/platform/intelligence-index';
import './nexus-intelligence.css';
import {github} from '@/lib/github';
import {publishApprovedIntelligenceRelation} from '@/lib/intelligence-publish.mjs';

type Run={id:string;objectId?:string;objectVersion?:string;workflow:string;state:string;startedAt:string;updatedAt:string;error?:string;result?:any;syncState?:string;steps?:Array<{ordinal:number;operationId:string;kind:string;state:string;output:any;error:string}>};
type Review={proposalIndex:number;decision:'approved'|'rejected';proposalHash:string;path:string;blobSha:string;repoCommit:string;quote:string;decidedAt:string;revision:number;publicationSha?:string;publicationCommit?:string;publishedAt?:string};
type Status={nativeLoaded?:boolean;imported?:boolean;importing?:boolean;processing?:boolean;fileBytes?:number;filename?:string;sha256?:string;copyBytes?:number;copyTotal?:number;warm?:boolean;config?:Record<string,any>;lastTelemetry?:Record<string,any>;error?:string};
const native=()=> (typeof window!=='undefined'?(window as any).Android:null);
const read=<T,>(name:string, fallback:T):T=>{try {const bridge=native();return typeof bridge?.[name]==='function'?JSON.parse(bridge[name]()) as T:fallback;}catch{return fallback;}};
const labels:Record<string,string>={queued:'Köad',running:'Arbetar',cancelling:'Avbryter…',paused:'Pausad',waiting_network:'Väntar på nät',waiting_index:'Väntar på sökindex',waiting_approval:'Väntar på beslut',waiting_model:'Väntar på modell',failed:'Misslyckad',conflict:'Konflikt',cancelled:'Avbruten',local_completed:'Färdig lokalt',sync_pending:'Väntar på GitHub',completed:'Verifierat klar'};
const num=(n:any)=>Number.isFinite(Number(n))?Number(n):0;
const fmt=(n:number)=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(n);
const date=(v:string)=>{try{return new Date(v).toLocaleString('sv-SE')}catch{return v}};
const options:Record<string,string[]>={contextSize:['1024','2048','4096','8192','16384','32768','65536'],backend:['AUTO','CPU','GPU_OPENCL','NPU_HEXAGON'],q8Kv:['false','true'],flashAttention:['false','true'],mlock:['false','true'],thinking:['false','true'],audit:['false','true'],warmModel:['false','true']};
const description:Record<string,string>={backend:'Begärd backend, inte bevis för exekvering',threads:'CPU-trådar',batchThreads:'Batchtrådar',contextSize:'Kontextfönster (16K–64K experimentellt; högre RAM-behov, kräver modellomladdning)',batch:'Batch',microbatch:'Microbatch',q8Kv:'KV-cache Q8_0 (annars F16)',flashAttention:'Flash Attention',mlock:'Begär minneslåsning',gpuLayers:'Begärd GPU-offload',temperature:'Temperature',topP:'Top-p',topK:'Top-k',minP:'Min-p',repeatPenalty:'Repeat penalty',seed:'Seed (-1 = slump)',maxOutputTokens:'Maximala outputtoken',thinking:'Thinking när templaten stöder det',audit:'HTP-audit (stäng av vid hastighetstest)',warmModel:'Behåll modellvikter laddade'};
function download(value:any,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function NexusIntelligence(){
 const [index,setIndex]=useState(intelligenceIndexProgress()),[status,setStatus]=useState<Status>({}),[runs,setRuns]=useState<Run[]>([]),[selected,setSelected]=useState<string>(''),[editing,setEditing]=useState(false),[draft,setDraft]=useState<Record<string,any>>({}),[task,setTask]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[reviews,setReviews]=useState<Review[]>([]),[compareId,setCompareId]=useState(''),[publishing,setPublishing]=useState(''),[documentQuery,setDocumentQuery]=useState(''),[foundDocuments,setFoundDocuments]=useState<any[]>([]);
 const refresh=()=>{setStatus(read<Status>('intelligenceStatus',{}));setRuns(read<Run[]>('intelligenceRuns',[]))};
 useEffect(()=>{refresh();void syncIntelligenceIndex();const update=()=>setIndex(intelligenceIndexProgress());window.addEventListener('nexus-intelligence-index',update);const t=window.setInterval(refresh,2000);return()=>{window.clearInterval(t);window.removeEventListener('nexus-intelligence-index',update)}},[]);
 useEffect(()=>{const params=new URLSearchParams(location.hash.split('?')[1]||'');const id=params.get('run');if(id)setSelected(id)},[]);
 const pick=runs.find(r=>r.id===selected)||runs[0];
 useEffect(()=>{if(pick?.id){ try{const raw=native()?.intelligenceReviews?.(pick.id);const items=JSON.parse(raw||'[]');setReviews(Array.isArray(items)?items:[])}catch{setReviews([])}}else setReviews([])},[pick?.id,pick?.state,pick?.updatedAt]);
 const counts=useMemo(()=>({active:runs.filter(r=>r.state==='running').length,waiting:runs.filter(r=>r.state.startsWith('waiting')||r.state==='queued').length,complete:runs.filter(r=>r.state==='completed'||r.state==='local_completed').length,failed:runs.filter(r=>r.state==='failed'||r.state==='conflict').length}),[runs]);
 const visible=runs.filter(r=>(filter==='all'||r.state===filter)&&[r.id,r.workflow,r.state].join(' ').toLowerCase().includes(search.toLowerCase()));
 const openSettings=()=>{setDraft({...status.config});setEditing(true)};
 const save=()=>{try{const v=read<any>('intelligenceStatus',{});void v;const raw=native()?.intelligenceSaveProfile?.(JSON.stringify(draft));const result=JSON.parse(raw||'{}');if(result.error)throw Error(result.error);setNotice('Inställningarna sparades. Motorn använder dem vid nästa körning.');setEditing(false);refresh()}catch(e:any){setNotice(e.message||'Inställningar kunde inte sparas')}};
 const invoke=(method:string,...args:any[])=>{try{const value=native()?.[method]?.(...args);if(value===false)throw Error('Åtgärden nekades');refresh();return value}catch(e:any){setNotice(e.message||'Åtgärden misslyckades');return null}};
 const start=()=>{const raw=invoke('intelligenceStart',task.trim());if(!raw)return;try{const x=JSON.parse(raw);if(x.error)throw Error(x.error);setSelected(x.id);setTask('');setNotice('Körningen har lagts i den beständiga kön.');refresh()}catch(e:any){setNotice(e.message||'Kunde inte skapa körning')}};
 const review=(runId:string,index:number,decision:'approved'|'rejected')=>{
   try{const raw=native()?.intelligenceReview?.(runId,index,decision);if(!raw)throw Error('Native granskning är inte tillgänglig');
    const receipt=JSON.parse(raw);if(receipt.error)throw Error(receipt.error);
    const updated=JSON.parse(native()?.intelligenceReviews?.(runId)||'[]');
    setReviews(Array.isArray(updated)?updated:[]);setNotice(decision==='approved'?'Förslaget är godkänt lokalt. Ingen GitHub-ändring har gjorts.':'Förslaget har avvisats och beslutet sparats lokalt.');
   }catch(e:any){setNotice(e.message||'Beslutet kunde inte sparas')}
 };
 const publish=async(run:Run,index:number)=>{
    if(publishing)return;
    setPublishing(run.id+':'+index);
    try{
      const decision=reviews.find(r=>r.proposalIndex===index);
      const receipt=await publishApprovedIntelligenceRelation(run,index,decision,github('databas'));
      const ack=JSON.parse(native()?.intelligenceRecordPublication?.(JSON.stringify(receipt))||'{}');
      if(ack.error||ack.syncState!=='github_verified')throw Error(ack.error||'GitHub-skrivningen lyckades men lokal kvittens saknas. Publicera igen för säker återläsning.');
      const updated=JSON.parse(native()?.intelligenceReviews?.(run.id)||'[]');
      setReviews(Array.isArray(updated)?updated:[]);
      setNotice('Relationen sparades i Databas och bekräftades genom återläsning av GitHub.');
    }catch(e:any){setNotice(e.message||'GitHub-publiceringen misslyckades; det lokala godkännandet finns kvar.')}
    finally{setPublishing('')}
 };
 const comparison=runs.find(r=>r.id===compareId&&r.id!==pick?.id);
 const duration=(r:Run)=>{const x=Date.parse(r.startedAt),y=Date.parse(r.updatedAt);return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.round((y-x)/1000)):null};
 const findDocuments=()=>{
  try{
    const raw=native()?.intelligenceSearchDocuments?.(documentQuery.trim());
    const items=JSON.parse(raw||'[]');
    if(!Array.isArray(items))throw Error(items.error||'Sökningen misslyckades');
    setFoundDocuments(items);setNotice(items.length?'':'Inga indexerade dokument matchade sökningen.');
  }catch(e:any){setNotice(e.message||'Dokumentsökningen misslyckades')}
 };
 const analyzeDocument=(path:string)=>{
  try{
    const raw=native()?.intelligenceAnalyzeDocument?.(path);
    const x=JSON.parse(raw||'{}');
    if(x.error||!x.id)throw Error(x.error||'Kunde inte köa dokument');
    setSelected(x.id);refresh();setNotice('Veriferat dokument tillagt i arbetskön.');
  }catch(e:any){setNotice(e.message||'Dokumentanalys misslyckades')}
 };
 const unsupported=!native()?.intelligenceStatus;
 return <section className="nh-intelligence nh-module-dashboard">
  <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><MaterialIcon tone="violet" size={48}><BrainCircuit size={28}/></MaterialIcon><div><span className="nh-module-eyebrow">NEXUS HUB · LOKAL ARBETSCENTRAL</span><h1>Nexus Intelligence</h1><p>Lokala körningar och verkliga resultat. GitHub-forskning och automatiska kopplingar är ännu inte aktiverade.</p></div></div>
   <div className="nh-int-actions"><button className="secondary" onClick={refresh}><RefreshCw size={17}/>Uppdatera</button><button className="secondary" onClick={openSettings}><Settings size={17}/>Inställningar</button></div></header>
  {unsupported&&<div className="error-banner"><AlertTriangle size={19}/>Denna funktion kräver NexusHubs Android-app med native Intelligence-bryggan.</div>}
  {notice&&<div className="info-note" role="status">{notice}<button className="text-button" onClick={()=>setNotice('')}>Stäng</button></div>}
  <div className="nh-int-overview">{([['Aktiva',counts.active],['Väntande',counts.waiting],['Färdiga lokalt',counts.complete],['Fel',counts.failed]] as const).map(([name,n])=><div className="panel nh-int-number" key={name}><strong>{n}</strong><span>{name}</span></div>)}</div>
  <div className="panel nh-int-model"><div><h2><HardDrive size={20}/> Gemma 4 E2B</h2><p>{status.importing?'Importerar modell…':status.processing?'Analyserar nu':status.imported?'Modell importerad':'Ingen modell importerad'} · Native: {status.nativeLoaded?'laddad':'saknas / fel'}</p><p className="muted">{status.filename||'Gemma 4 E2B Q4 GGUF'} {status.fileBytes? ' · '+fmt(status.fileBytes/1024/1024)+' MiB':''}</p><small>{status.sha256?'SHA-256: '+status.sha256:'Ingen verifierad modellhash'}</small>
  <p className="muted">Begärd backend: <strong>{status.config?.backend||'Ej vald'}</strong> · Senast använd: <strong>{status.lastTelemetry?.backend_active||'Ej testad'}</strong></p>
  {status.lastTelemetry?.backend_active&&<p className="muted">Offload: {status.lastTelemetry?.actual_gpu_layers??'okänd'}/{status.lastTelemetry?.total_offloadable_layers??'?'} lager · Kontext: {status.lastTelemetry?.active_ctx_size||'okänd'} · Outputstopp: {status.lastTelemetry?.finish_reason||'okänd'}</p>}
  {status.lastTelemetry?.fallback_occurred&&<p className="error-banner" role="status">Fallback: {String(status.lastTelemetry?.fallback_reason||'okänd orsak').slice(0,300)}</p>}
  <small>NPU-exekvering samt 32K/64K-kontext behöver verifieras på telefonen; val av backend är inte hårdvarubevis.</small>{status.importing&&<progress max={status.copyTotal&&status.copyTotal>0?status.copyTotal:1} value={status.copyBytes||0}/>}</div><div className="nh-int-actions"><button className="secondary" onClick={()=>invoke('intelligenceImportModel')} disabled={status.processing||status.importing}><FolderOpen size={17}/>Importera GGUF</button><button className="secondary" onClick={()=>invoke('intelligenceUnloadModel')} disabled={status.processing||!status.warm}>Frigör</button></div></div>
  <div className="panel nh-int-index"><h2>Lokalt sökindex</h2><p>{index.state==="ready"?"Verifierat och klart":index.state==="running"?"Indexering pågår":index.state==="failed"?"Indexering misslyckades":"Väntar på fullständig lokal Databas-kopia"} · {index.done}/{index.total} textfiler</p>{index.error&&<p className="muted">{index.error}</p>}<button className="secondary" disabled={index.state==="running"} onClick={()=>void syncIntelligenceIndex(true)}>Bygg om sökindex</button><p className="muted">Endast textfiler upp till 120 KB indexeras. Binärer och större filer analyseras inte automatiskt.</p></div>
  <div className="panel nh-int-task"><h2><Play size={20}/> Starta verifierbar lokal körning</h2><p className="muted">Detta arbetsflöde använder Gemma för ämne och sökord. Med ett färdigt lokalt index söks verkliga textkandidater. Förslag kräver granskning och skrivs inte till GitHub.</p><label>Text att analysera<textarea value={task} onChange={e=>setTask(e.target.value)} rows={4} maxLength={20000} placeholder="Beskriv en idé eller klistra in texten till ett forskningsunderlag…"/></label><button className="primary" onClick={start} disabled={!status.imported||task.trim().length<5||status.importing}><Play size={17}/>Starta lokal analys</button></div>
  <div className="panel nh-int-index"><h2>Sök och analysera dokument</h2>
   <p className="muted">Fulltextsökning bland verifierade lokala GitHub-dokument. Gemma arbetar endast med källor som finns i den aktuella indexversionen.</p>
   <div className="nh-int-actions"><input type="search" value={documentQuery} onChange={e=>setDocumentQuery(e.target.value)} placeholder="Sök ämne, titel eller innehåll…" aria-label="Sök indexerade dokument"/><button className="secondary" onClick={findDocuments} disabled={documentQuery.trim().length<2}>Sök</button></div>
   {foundDocuments.map((item:any)=><div className="nh-int-step" key={item.path}>
    <strong>{item.title||item.path}</strong><small>{item.path} · Git SHA {item.sha?.slice(0,12)}</small>
    <p className="muted">{String(item.excerpt||'').slice(0,230)}</p>
    <button className="secondary" onClick={()=>analyzeDocument(item.path)}>Analysera dokument</button>
   </div>)}
  </div>
  <div className="nh-int-columns"><section className="panel"><h2><Activity size={19}/> Körningshistorik</h2><div className="nh-int-filters"><input type="search" placeholder="Sök körningar" aria-label="Sök körningar" value={search} onChange={e=>setSearch(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filtrera status"><option value="all">Alla</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div><div className="nh-int-runs">{visible.length?visible.map(r=><button type="button" className={'nh-int-run '+(pick?.id===r.id?'selected':'')} key={r.id} onClick={()=>setSelected(r.id)}><strong>{r.workflow==='manual_check'?'Lokal textanalys':r.workflow==='document_analysis'?'Dokumentanalys':r.workflow==='source_changed'?'Databasindex uppdaterat':r.workflow}</strong><span>{labels[r.state]||r.state}</span><small>{date(r.startedAt)} · {r.id.slice(0,8)}</small></button>):<p>Inga körningar i urvalet.</p>}</div></section>
  <section className="panel"><h2><Clock size={19}/> Körningsdetaljer</h2>{pick?<><div className="nh-int-metadata"><strong>{labels[pick.state]||pick.state}</strong><small>ID: {pick.id}</small><small>Senast ändrad: {date(pick.updatedAt)}</small>{pick.result?.sourcePath&&<small>Källfil: {pick.result.sourcePath}</small>}<small>Synkstatus: {pick.syncState||'lokal'}</small></div>{pick.error&&<div className="error-banner">{pick.error}</div>}
 <div className="nh-int-metadata"><small>Start: {date(pick.startedAt)}</small><small>Senaste steg: {pick.steps?.at(-1)?.kind||'Köad'}</small><small>Antal genomförda steg: {pick.steps?.filter(s=>s.state==='succeeded').length||0}</small><small>Berört objekt: {pick.workflow==='idea_analysis'?'Idé':'Databas eller lokal text'}</small></div>
 <label>Jämför med annan körning<select value={compareId} onChange={e=>setCompareId(e.target.value)}>
 <option value="">Välj jämförelse</option>{runs.filter(r=>r.id!==pick.id).map(r=><option key={r.id} value={r.id}>{r.workflow} · {r.id.slice(0,8)} · {labels[r.state]||r.state}</option>)}</select></label>
 {comparison&&<div className="nh-int-step"><h3>Körningsjämförelse</h3><table><thead><tr><th>Mått</th><th>Vald</th><th>Jämförd</th></tr></thead><tbody>
 <tr><td>Varaktighet</td><td>{duration(pick)??'—'} s</td><td>{duration(comparison)??'—'} s</td></tr>
 <tr><td>Utförda steg</td><td>{pick.steps?.filter(s=>s.state==='succeeded').length||0}</td><td>{comparison.steps?.filter(s=>s.state==='succeeded').length||0}</td></tr>
 <tr><td>Relationsförslag</td><td>{pick.result?.proposals?.length||0}</td><td>{comparison.result?.proposals?.length||0}</td></tr>
 <tr><td>Status</td><td>{labels[pick.state]||pick.state}</td><td>{labels[comparison.state]||comparison.state}</td></tr>
 </tbody></table></div>}<div className="nh-int-actions">{['running','queued'].includes(pick.state)&&<button className="secondary" onClick={()=>invoke('intelligencePause',pick.id)}><Pause size={16}/>Pausa</button>}{['failed','paused','waiting_model','waiting_index','waiting_network','conflict'].includes(pick.state)&&<button className="secondary" onClick={()=>invoke('intelligenceResume',pick.id)}><Play size={16}/>Försök igen</button>}{['running','queued','waiting_model','waiting_index','waiting_network','paused','waiting_approval'].includes(pick.state)&&<button className="secondary" onClick={()=>invoke('intelligenceCancel',pick.id)}><Square size={16}/>Avbryt</button>}<button className="secondary" onClick={()=>download(pick,'nexus-intelligence-'+pick.id+'.json')}><Download size={16}/>Exportera</button></div><h3>Steg</h3>{pick.steps?.length?pick.steps.map(s=><details key={s.operationId} className="nh-int-step"><summary><CheckCircle2 size={16}/>{s.kind} · {s.state}<ChevronDown size={15}/></summary><pre>{JSON.stringify(s.output,null,2)}</pre>{s.error&&<p>{s.error}</p>}</details>):<p className="muted">Inga slutförda steg ännu.</p>}{pick.result&&Object.keys(pick.result).length>0&&<><h3>Resultat och källförslag</h3>
  <p className="muted">Ämne: {pick.result.topic||'Saknas'} · Databas-version: {pick.result.indexCommit||'Ej indexerad'}</p>
  {Array.isArray(pick.result.proposals)&&pick.result.proposals.length>0?
   pick.result.proposals.map((proposal:any,i:number)=>{const decision=reviews.find(r=>r.proposalIndex===i);
    return <article className="nh-int-step" key={proposal.path+':'+i}>
      <strong>{proposal.path}</strong><p>{proposal.reason}</p><blockquote>{proposal.quote}</blockquote>
      <small>Git blob: {proposal.blobSha} · Commit: {proposal.repoCommit}</small>
      <p className="muted">Modellens säkerhet: {Math.round(num(proposal.confidence)*100)} % · Beslut: {decision?.publicationSha?'Publicerad och verifierad i GitHub':decision?.decision==='approved'?'Godkänt lokalt':decision?.decision==='rejected'?'Avvisat':'Väntar på granskning'}</p>
      <div className="nh-int-actions"><button className="secondary" disabled={decision?.decision==='approved'} onClick={()=>review(pick.id,i,'approved')}>Godkänn lokalt</button><button className="secondary" disabled={decision?.decision==='rejected'||!!decision?.publicationSha} onClick={()=>review(pick.id,i,'rejected')}>Avvisa</button>
      {pick.workflow==='idea_analysis'&&decision?.decision==='approved'&&!decision?.publicationSha&&<button className="primary" disabled={!!publishing} onClick={()=>void publish(pick,i)}>{publishing===pick.id+':'+i?'Verifierar GitHub…':'Publicera på GitHub'}</button>}</div>
      {decision?.publicationSha&&<small>GitHub-kvittens: {decision.publicationSha}</small>}
    </article>;}):<p className="muted">Inga styrkta kopplingsförslag.</p>}
  <button className="secondary" onClick={()=>download({run:pick,reviews},'nexus-intelligence-underlag-'+pick.id+'.json')}><Download size={16}/>Exportera källor och beslut</button>
  <details><summary>Fullständigt maskinläsbart resultat</summary><pre>{JSON.stringify(pick.result,null,2)}</pre></details>
 </>}</>:<p>Välj en körning för att se dess faktiska status.</p>}</section></div>
  {editing&&<div className="nh-int-modal-bg" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="int-settings" className="nh-int-modal panel"><header><h2 id="int-settings"><Settings size={20}/> Modell & runtime</h2><button className="secondary" onClick={()=>setEditing(false)}>Stäng</button></header><p className="muted">Ändringar är utkast tills du sparar. Begärd backend och verklig backend kan skilja sig.</p><div className="nh-int-config">{Object.keys(status.config||{}).map(key=><label key={key}><span>{description[key]||key}</span>{options[key]?<select value={String(draft[key]??status.config?.[key])} onChange={e=>setDraft(d=>({...d,[key]:key==='contextSize'?Number(e.target.value):['true','false'].includes(e.target.value)?e.target.value==='true':e.target.value}))}>{options[key].map(o=><option key={o} value={o}>{o}</option>)}</select>:<input type="number" step={['temperature','topP','minP','repeatPenalty'].includes(key)?'0.01':'1'} value={draft[key]??''} onChange={e=>setDraft(d=>({...d,[key]:num(e.target.value)}))}/>}</label>)}</div><div className="nh-int-actions"><button className="secondary" onClick={()=>setDraft({...status.config})}>Ångra utkast</button><button className="secondary" onClick={()=>{setDraft({});setNotice('Standardprofil väljs vid sparning')}}>Återställ standard</button><button className="primary" onClick={save}>Spara inställningar</button></div><div className="nh-int-actions"><button className="secondary" onClick={()=>download({status,profile:status.config},'nexus-gemma-diagnostik.json')}><Download size={16}/>Exportera diagnostik</button><button className="secondary" onClick={()=>{if(window.confirm('Ta bort den importerade modellfilen?'))invoke('intelligenceDeleteModel')}}>Ta bort modell</button></div></section></div>}
 </section>
}
