'use client';
import React,{useEffect,useRef,useState} from 'react';
import {BrainCircuit,Settings,Send,Square,RefreshCw,Trash2,HardDrive,Activity,AlertTriangle} from 'lucide-react';
import './nexus-intelligence.css';
import RetrievalLab from './RetrievalLab';
import {useBackHandler} from '@/components/NativeBackBridge';

type Message={id:string;role:'user'|'assistant';content:string;at:string};
type ModelStatus={imported?:boolean;importing?:boolean;processing?:boolean;fileBytes?:number;filename?:string;copyBytes?:number;copyTotal?:number;warm?:boolean;config?:Record<string,any>;lastTelemetry?:Record<string,any>;error?:string};
type Reply={requestId:string;ok:boolean;result?:{text:string;finishReason:string;telemetry?:Record<string,any>};error?:string};
const KEY='nexus_gemma_chat_v1';
const PENDING='nexus_gemma_pending_v1';
const options:Record<string,string[]>={contextSize:['1024','2048','4096','8192','16384','32768','65536'],backend:['AUTO','CPU','GPU_OPENCL','NPU_HEXAGON'],q8Kv:['false','true'],flashAttention:['false','true'],mlock:['false','true'],thinking:['false','true'],audit:['false','true'],warmModel:['false','true']};
const labels:Record<string,string>={backend:'Backend',threads:'CPU-trådar',batchThreads:'Batchtrådar',contextSize:'Kontext',batch:'Batch',microbatch:'Microbatch',q8Kv:'KV-cache Q8',flashAttention:'Flash Attention',mlock:'Minneslås',gpuLayers:'GPU-lager',temperature:'Temperature',topP:'Top-p',topK:'Top-k',minP:'Min-p',repeatPenalty:'Repeat penalty',seed:'Seed',maxOutputTokens:'Svarstoken',thinking:'Thinking',audit:'Djup HTP-audit',warmModel:'Behåll modell i RAM'};
const bridge=()=>typeof window==='undefined'?null:(window as any).Android;
function readStatus():ModelStatus{try{return JSON.parse(bridge()?.gemmaStatus?.()||'{}')}catch{return {error:'Kunde inte läsa modellstatus.'}}}
function restore():Message[]{if(typeof window==='undefined')return [];try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a.filter(v=>v&&['user','assistant'].includes(v.role)&&typeof v.content==='string').slice(-60):[]}catch{return []}}
const fmt=(n:any,p=1)=>n===null||n===undefined||!Number.isFinite(Number(n))?'–':Number(n).toLocaleString('sv-SE',{maximumFractionDigits:p});
export default function NexusIntelligence(){
 const [status,setStatus]=useState<ModelStatus>({});
 const [messages,setMessages]=useState<Message[]>(restore),[input,setInput]=useState(''),[busy,setBusy]=useState(()=>typeof window!=='undefined'&&!!localStorage.getItem(PENDING));
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[settings,setSettings]=useState(false),[draft,setDraft]=useState<Record<string,any>>({}),[last,setLast]=useState<Record<string,any>>({});
 const pending=useRef<string|null>(typeof window==='undefined'?null:localStorage.getItem(PENDING)),end=useRef<HTMLDivElement>(null);
 const dialogRef=useRef<HTMLElement>(null),settingsButton=useRef<HTMLButtonElement>(null);
 useBackHandler(90,()=>{if(!settings)return false;setSettings(false);return true;});
 useEffect(()=>{
  if(!settings)return;
  const prior=document.body.style.overflow;document.body.style.overflow='hidden';dialogRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();setSettings(false);return;}
   if(e.key==='Tab'&&dialogRef.current){
    const el=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')];
    if(!el.length)return;
    if(e.shiftKey&&document.activeElement===el[0]){e.preventDefault();el[el.length-1].focus();}
    else if(!e.shiftKey&&document.activeElement===el[el.length-1]){e.preventDefault();el[0].focus();}
   }
  };document.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=prior;document.removeEventListener('keydown',onKey);settingsButton.current?.focus();};
 },[settings]);
 useEffect(()=>{const refresh=()=>setStatus(readStatus());refresh();const interval=window.setInterval(refresh,2000);return()=>window.clearInterval(interval)},[]);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(messages.slice(-60)))}catch{};end.current?.scrollTo({top:end.current.scrollHeight,behavior:'smooth'})},[messages]);
 useEffect(()=>{
  const consume=(reply:Reply)=>{
   if(!reply||reply.requestId!==pending.current)return;
   pending.current=null;localStorage.removeItem(PENDING);setBusy(false);setStatus(readStatus());
   if(!reply.ok){setError(reply.error||'Gemma kunde inte slutföra svaret.');return;}
   if(!reply.result){setError('Inget modellresultat mottogs.');return;}
   if(reply.result.telemetry)setLast(reply.result.telemetry);
   if(reply.result.text?.trim())setMessages(old=>{
    const id='reply:'+reply.requestId;
    return old.some(m=>m.id===id)?old:[...old,{id,role:'assistant',content:reply.result!.text,at:new Date().toISOString()}];
   });
   else setError('Modellen gav inget synligt svar.');
   if(['length','context_limit'].includes(reply.result.finishReason))setNotice('Modellen nådde sin token- eller kontextgräns. Delsvaret visas.');
  };
  const onResult=(e:Event)=>consume((e as CustomEvent<Reply>).detail);
  const check=()=>{
   if(!pending.current)return;
   try{
    const native=JSON.parse(bridge()?.gemmaLatestResult?.()||'{}');
    if(native.requestId!==pending.current)return;
    if(native.status==='finished'&&native.reply)consume(native.reply);
    if(native.status==='interrupted')consume({requestId:native.requestId,ok:false,error:'Android avslutade processen. Den ofärdiga genereringen avbröts.'});
   }catch{/* Android bridge temporarily unavailable. */}
  };
  window.addEventListener('nexus-gemma-chat',onResult);
  check();const timer=window.setInterval(check,1000);
  return()=>{window.removeEventListener('nexus-gemma-chat',onResult);window.clearInterval(timer);};
 },[]);
 const send=()=>{
  const text=input.trim();if(!text||busy)return;
  if(!bridge()?.gemmaChatSend){setError('Gemma-chatten kräver Android-appen.');return;}
  const pairs:Array<{role:'user'|'assistant';content:string}>=[];
  for(let i=0;i<messages.length-1;i++)if(messages[i].role==='user'&&messages[i+1].role==='assistant'){pairs.push({role:'user',content:messages[i].content},{role:'assistant',content:messages[i+1].content});i++;}
  const history=pairs.slice(-10);let payload=[...history,{role:'user',content:text}];
  while(history.length&&(payload.reduce((n,m)=>n+m.content.length,0)>30000||JSON.stringify(payload).length>36000||payload.length>13)){
   history.splice(0,2);payload=[...history,{role:'user',content:text}];
  }
  if(payload.reduce((n,m)=>n+m.content.length,0)>30000||JSON.stringify(payload).length>36000){setError('Frågan är för stor för Android. Dela upp den.');return;}
  const id=crypto.randomUUID();
  if(payload.length<pairs.slice(-10).length+1)setNotice('Äldre turer utelämnades ur modellkontexten, men finns kvar i chatten.');
  pending.current=id;localStorage.setItem(PENDING,id);setBusy(true);setError('');
  try{if(!bridge().gemmaChatSend(JSON.stringify(payload),id))throw Error('Android nekade chattkörningen.');
      setMessages(old=>[...old,{id,role:'user',content:text,at:new Date().toISOString()}]);setInput('')}
  catch(e:any){localStorage.removeItem(PENDING);pending.current=null;setBusy(false);setError(e.message||'Kunde inte starta modellen.')}
 };
 const save=()=>{try{const raw=bridge()?.gemmaSaveProfile?.(JSON.stringify(draft));if(!raw)throw Error('Native-inställningar saknas.');
   const x=JSON.parse(raw);if(x.error)throw Error(x.error);setStatus(readStatus());setSettings(false);setError('');setNotice('Globala Gemma-inställningar sparade.')}
  catch(e:any){setError(e.message||'Kunde inte spara inställningarna.')}};
 const action=(name:string)=>{try{if(bridge()?.[name]?.()!==true)throw Error('Åtgärden nekades.');setStatus(readStatus())}catch(e:any){setError(e.message||'Åtgärden misslyckades.')}};
 const config=status.config||{},telemetry=Object.keys(last).length?last:status.lastTelemetry||{},available=!!bridge()?.gemmaStatus;
 const metrics:[string,any][]=[['Backend',telemetry.backend_active],['Accelererade lager',telemetry.actual_gpu_layers==null?'–':telemetry.actual_gpu_layers+' / '+(telemetry.total_offloadable_layers??'?')],['Kontext',fmt(telemetry.active_ctx_size,0)],['Prompttoken',fmt(telemetry.prompt_tokens,0)],['Svarstoken',fmt(telemetry.output_tokens,0)],['Modelladdning',fmt(telemetry.model_load_time_ms,0)+' ms'],['Sessionsstart',telemetry.sessionStartState||'–'],['Laddning denna körning',telemetry.modelLoadThisRequestMs==null?'–':fmt(telemetry.modelLoadThisRequestMs,0)+' ms'],['Prefill',fmt(telemetry.prefill_time_ms,0)+' ms'],['Tid till första token',fmt(telemetry.ttft_ms,0)+' ms'],['Generering',fmt(telemetry.decode_time_ms,0)+' ms'],['Totalt',fmt(telemetry.total_time_ms,0)+' ms'],['Svarshastighet',fmt(telemetry.decode_tok_per_sec,2)+' tok/s'],['Stopporsak',telemetry.finish_reason||'–']];
 return <div className="nh-intelligence">
  <header className="nh-gemma-header"><div><p className="eyebrow">NEXUS HUB · LOKAL MODELL</p><h1><BrainCircuit size={25}/> Gemma 4 E2B</h1><p className="nh-source-caption">Fristående chatt med normal telemetri. Inga automatiska AI-uppdrag eller dokumentanalyser.</p></div><div className="nh-gemma-actions"><button className="secondary" ref={settingsButton} disabled={!available||busy} onClick={()=>{setDraft({...config});setSettings(true)}}><Settings size={17}/> Inställningar</button><button className="secondary" onClick={()=>setStatus(readStatus())}><RefreshCw size={17}/> Status</button></div></header>
  <section className="panel nh-gemma-model"><div><strong>{status.imported?'Modellen importerad':'Ingen modell importerad'}</strong><small>{status.filename||'Gemma 4 E2B GGUF'} · {status.fileBytes?fmt(status.fileBytes/1048576,0)+' MiB':''}</small><small>{status.processing?'Genererar':status.importing?'Importerar':status.warm?'Varm modell':'Modell ej laddad'} · {config.backend||'AUTO'} · {fmt(config.contextSize,0)} kontext · {fmt(config.maxOutputTokens,0)} svarstoken</small></div><div className="nh-gemma-actions"><button className="secondary" disabled={!available||busy||status.importing} onClick={()=>action('gemmaImportModel')}><HardDrive size={16}/> Importera GGUF</button><button className="secondary" disabled={!status.warm||busy} onClick={()=>action('gemmaUnloadModel')}>Ladda ur RAM</button></div>{status.importing&&!!status.copyTotal&&status.copyTotal>0&&<progress max={status.copyTotal} value={status.copyBytes||0}/>}</section>
  {(!available||status.error)&&<p className="error-banner"><AlertTriangle size={17}/>{status.error||'Kräver NexusHubs Android-app.'}</p>}{error&&<p className="error-banner" role="alert"><AlertTriangle size={17}/>{error}</p>}{notice&&<p className="info-note" role="status">{notice}</p>}
  <section className="panel nh-gemma-chat"><div className="nh-gemma-row"><h2>Chatt</h2><button className="secondary" disabled={busy||!messages.length} onClick={()=>{setMessages([]);setLast({})}}><Trash2 size={16}/> Rensa chatt</button></div><div className="nh-gemma-transcript" ref={end} aria-live="polite">{!messages.length&&<p className="nh-gemma-empty">Skriv till Gemma och undersök faktisk svarstid, hastighet och backend. Ingen annan modul får någon uppgift.</p>}{messages.map(m=><article key={m.id} className={'nh-gemma-message '+m.role}><small>{m.role==='user'?'Du':'Gemma'} · {new Date(m.at).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}</small><div>{m.content}</div></article>)}{busy&&<p className="nh-gemma-thinking"><Activity size={16}/> Gemma arbetar…</p>}</div><textarea aria-label="Meddelande till Gemma" placeholder="Skriv till Gemma…" value={input} disabled={busy||!status.imported} maxLength={12000} rows={3} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/><div className="nh-gemma-actions">{busy?<button className="secondary" onClick={()=>{pending.current&&bridge()?.gemmaCancelRequest?.(pending.current);setNotice('Avbrytning begärd.')}}><Square size={16}/> Stoppa</button>:<button className="primary" disabled={!available||!status.imported||!input.trim()} onClick={send}><Send size={16}/> Skicka</button>}<small className="nh-source-caption">Enter skickar · Skift+Enter ny rad · Historiken lagras endast lokalt</small></div></section>
  <section className="panel nh-gemma-telemetry"><h2><Activity size={19}/> Körtelemetri</h2><div className="nh-gemma-metrics">{metrics.map(([label,value])=><div className="nh-gemma-stat" key={label}><small>{label}</small><strong>{String(value??'–')}</strong></div>)}</div><p className="nh-source-caption">Normal körtelemetri. Ingen djup HTP-audit eller paketlista visas. Offload anger vad runtime rapporterar.</p>{telemetry.fallback_occurred&&<p className="error-banner">Fallback: {String(telemetry.fallback_reason||'Okänd orsak')}</p>}<details><summary>Globala inställningar</summary><div className="nh-gemma-metrics">{Object.entries(config).map(([key,value])=><div className="nh-gemma-stat" key={key}><small>{labels[key]||key}</small><strong>{String(value)}</strong></div>)}</div></details></section>
  <RetrievalLab/>
  {settings&&<div className="nh-int-modal-bg"><section ref={dialogRef} tabIndex={-1} className="panel nh-int-modal" role="dialog" aria-modal="true" aria-label="Globala Gemma-inställningar"><h2>Gemma – globala inställningar</h2><p className="nh-source-caption">Profilen lagras i Android och används av alla framtida Gemma-funktioner i NexusHub.</p><div className="nh-int-config">{Object.entries(config).map(([key,current])=><label key={key}><span>{labels[key]||key}</span>{options[key]?<select value={String(draft[key]??current)} onChange={e=>setDraft(old=>({...old,[key]:e.target.value==='true'?true:e.target.value==='false'?false:options[key].every(v=>/^[0-9]+$/.test(v))?Number(e.target.value):e.target.value}))}>{options[key].map(v=><option key={v} value={v}>{v==='true'?'På':v==='false'?'Av':v}</option>)}</select>:<input type="number" step={['temperature','topP','minP','repeatPenalty'].includes(key)?'0.01':'1'} value={draft[key]??current} onChange={e=>setDraft(old=>({...old,[key]:e.target.value===''?'':Number(e.target.value)}))}/>}</label>)}</div><div className="nh-gemma-actions"><button className="primary" onClick={save}>Spara för hela Gemma</button><button className="secondary" onClick={()=>setDraft({...config})}>Återställ utkast</button><button className="secondary" onClick={()=>setSettings(false)}>Stäng</button></div></section></div>}
 </div>;
}
