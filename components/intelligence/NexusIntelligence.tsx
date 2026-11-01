'use client';
import React,{useEffect,useRef,useState} from 'react';
import {BrainCircuit,Settings,Send,Square,RefreshCw,Trash2,HardDrive,Activity,AlertTriangle} from 'lucide-react';
import './nexus-intelligence.css';
import RetrievalLab from './RetrievalLab';
import {buildGemmaContext} from '@/lib/gemma-context.mjs';
import {useBackHandler} from '@/components/NativeBackBridge';

type Message={id:string;role:'user'|'assistant';content:string;at:string};
type ModelStatus={imported?:boolean;importing?:boolean;processing?:boolean;fileBytes?:number;filename?:string;copyBytes?:number;copyTotal?:number;warm?:boolean;config?:Record<string,any>;lastTelemetry?:Record<string,any>;error?:string};
type Reply={requestId:string;ok:boolean;result?:{text:string;finishReason:string;omittedHistoryTurns?:number;telemetry?:Record<string,any>};error?:string};
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
 const dialogRef=useRef<HTMLElement>(null),modalRef=useRef<HTMLDialogElement>(null),settingsButton=useRef<HTMLButtonElement>(null);
 const messagesRef=useRef(messages);messagesRef.current=messages;
 const [confirmClose,setConfirmClose]=useState(false);
 const requestClose=()=>{if(JSON.stringify(draft)!==JSON.stringify(status.config||{}))setConfirmClose(true);else setSettings(false);};
 const closeRef=useRef(requestClose);closeRef.current=requestClose;
 useBackHandler(90,()=>{if(!settings)return false;requestClose();return true;});
 useEffect(()=>{
  if(!settings)return;
  const prior=document.body.style.overflow;document.body.style.overflow='hidden';modalRef.current?.showModal();
  (dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')||dialogRef.current)?.focus();
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();closeRef.current();return;}
   if(e.key==='Tab'&&dialogRef.current){
    const el=[...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')];
    if(!el.length)return;
    if(e.shiftKey&&(document.activeElement===el[0]||!el.includes(document.activeElement as HTMLElement))){e.preventDefault();el[el.length-1].focus();}
    else if(!e.shiftKey&&(document.activeElement===el[el.length-1]||!el.includes(document.activeElement as HTMLElement))){e.preventDefault();el[0].focus();}
   }
  };document.addEventListener('keydown',onKey);
  return()=>{modalRef.current?.close();document.body.style.overflow=prior;document.removeEventListener('keydown',onKey);settingsButton.current?.focus();};
 },[settings]);
 useEffect(()=>{const refresh=()=>setStatus(readStatus());refresh();const interval=window.setInterval(refresh,2000);return()=>window.clearInterval(interval)},[]);
 useEffect(()=>{end.current?.scrollTo({top:end.current.scrollHeight,behavior:'smooth'})},[messages]);
 useEffect(()=>{
  const consume=(reply:Reply)=>{
   if(!reply||reply.requestId!==pending.current)return;
   const id='reply:'+reply.requestId;
   const next=reply.ok&&reply.result?.text?.trim()&&!messagesRef.current.some(m=>m.id===id)
    ?[...messagesRef.current,{id,role:'assistant' as const,content:reply.result.text,at:new Date().toISOString()}]:messagesRef.current;
   try{
    // Retire the recovery marker only after the visible transcript is durable.
    localStorage.setItem(KEY,JSON.stringify(next.slice(-60)));
    localStorage.removeItem(PENDING);
   }catch{setError('Svaret kunde inte sparas på telefonen. Android-kvittensen behålls för återhämtning. Frigör lagringsutrymme.');return;}
   messagesRef.current=next;setMessages(next);pending.current=null;setBusy(false);setStatus(readStatus());
   if(!reply.ok){setError(reply.error||'Gemma kunde inte slutföra svaret.');return;}
   if(!reply.result){setError('Inget modellresultat mottogs.');return;}
   if(reply.result.telemetry)setLast(reply.result.telemetry);
   if(!reply.result.text?.trim())setError('Modellen gav inget synligt svar.');
   const notes=[];
   if((reply.result.omittedHistoryTurns||0)>0)notes.push('Modellens tokenbudget utelämnade '+reply.result.omittedHistoryTurns+' äldre turer ur arbetskontexten. De finns kvar i chatten.');
   if(['length','context_limit'].includes(reply.result.finishReason))notes.push('Modellen nådde sin token- eller kontextgräns. Delsvaret visas.');
   if(notes.length)setNotice(notes.join(' '));
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
  let context:ReturnType<typeof buildGemmaContext>;
  try{context=buildGemmaContext(messages,text);}catch(e:any){setError(e.message);return;}
  const payload=context.messages;
  const id=crypto.randomUUID();
  setNotice(context.omittedTurns?'Äldre turer utelämnades ur modellkontexten, men finns kvar i chatten.':'');
  try{
   const next=[...messages,{id,role:'user' as const,content:text,at:new Date().toISOString()}];
   localStorage.setItem(KEY,JSON.stringify(next.slice(-60)));localStorage.setItem(PENDING,id);
   messagesRef.current=next;setMessages(next);pending.current=id;setBusy(true);setError('');
   if(!bridge().gemmaChatSend(JSON.stringify(payload),id))throw Error('Android nekade chattkörningen.');
   setInput('');
  }catch(e:any){try{localStorage.removeItem(PENDING);}catch{}pending.current=null;setBusy(false);setError(e.message||'Kunde inte starta modellen.')}

 };
 const save=()=>{try{const raw=bridge()?.gemmaSaveProfile?.(JSON.stringify(draft));if(!raw)throw Error('Native-inställningar saknas.');
   const x=JSON.parse(raw);if(x.error)throw Error(x.error);setStatus(readStatus());setSettings(false);setError('');setNotice('Globala Gemma-inställningar sparade.')}
  catch(e:any){setError(e.message||'Kunde inte spara inställningarna.')}};
 const action=(name:string)=>{try{if(bridge()?.[name]?.()!==true)throw Error('Åtgärden nekades.');setStatus(readStatus())}catch(e:any){setError(e.message||'Åtgärden misslyckades.')}};
 const config=status.config||{},telemetry=Object.keys(last).length?last:status.lastTelemetry||{},available=!!bridge()?.gemmaStatus;
 const metrics:[string,any][]=[['Backend',telemetry.backend_active],['Accelererade lager',telemetry.actual_gpu_layers==null?'–':telemetry.actual_gpu_layers+' / '+(telemetry.total_offloadable_layers??'?')],['Kontext',fmt(telemetry.active_ctx_size,0)],['Prompttoken',fmt(telemetry.prompt_tokens,0)],['Svarstoken',fmt(telemetry.output_tokens,0)],['Modelladdning',fmt(telemetry.model_load_time_ms,0)+' ms'],['Sessionsstart',telemetry.sessionStartState||'–'],['Laddning denna körning',telemetry.modelLoadThisRequestMs==null?'–':fmt(telemetry.modelLoadThisRequestMs,0)+' ms'],['Prefill',fmt(telemetry.prefill_time_ms,0)+' ms'],['Tid till första token',fmt(telemetry.ttft_ms,0)+' ms'],['Generering',fmt(telemetry.decode_time_ms,0)+' ms'],['Totalt',fmt(telemetry.total_time_ms,0)+' ms'],['Svarshastighet',fmt(telemetry.decode_tok_per_sec,2)+' tok/s'],['Stopporsak',telemetry.finish_reason||'–']];
 return <div className="nh-intelligence">
  <header className="nh-gemma-header"><div><p className="eyebrow">NEXUS HUB · LOKAL MODELL</p><h1><BrainCircuit size={25}/> Gemma 4 E2B</h1><p className="nh-source-caption">Fristående chatt med normal telemetri. Inga automatiska AI-uppdrag eller dokumentanalyser.</p></div><div className="nh-gemma-actions"><button className="secondary" ref={settingsButton} disabled={!available||busy} onClick={()=>{setDraft({...config});setConfirmClose(false);setSettings(true)}}><Settings size={17}/> Inställningar</button><button className="secondary" onClick={()=>setStatus(readStatus())}><RefreshCw size={17}/> Status</button></div></header>
  <section className="panel nh-gemma-model"><div><strong>{status.imported?'Modellen importerad':'Ingen modell importerad'}</strong><small>{status.filename||'Gemma 4 E2B GGUF'} · {status.fileBytes?fmt(status.fileBytes/1048576,0)+' MiB':''}</small><small>{status.processing?'Genererar':status.importing?'Importerar':status.warm?'Varm modell':'Modell ej laddad'} · {config.backend||'AUTO'} · {fmt(config.contextSize,0)} kontext · {fmt(config.maxOutputTokens,0)} svarstoken</small></div><div className="nh-gemma-actions"><button className="secondary" disabled={!available||busy||status.importing} onClick={()=>action('gemmaImportModel')}><HardDrive size={16}/> Importera GGUF</button><button className="secondary" disabled={!status.warm||busy} onClick={()=>action('gemmaUnloadModel')}>Ladda ur RAM</button></div>{status.importing&&!!status.copyTotal&&status.copyTotal>0&&<progress max={status.copyTotal} value={status.copyBytes||0}/>}</section>
  {(!available||status.error)&&<p className="error-banner"><AlertTriangle size={17}/>{status.error||'Kräver NexusHubs Android-app.'}</p>}{error&&<p className="error-banner" role="alert"><AlertTriangle size={17}/>{error}</p>}{notice&&<p className="info-note" role="status">{notice}</p>}
  <section className="panel nh-gemma-chat"><div className="nh-gemma-row"><h2>Chatt</h2><button className="secondary" disabled={busy||!messages.length} onClick={()=>{try{localStorage.setItem(KEY,'[]');messagesRef.current=[];setMessages([]);setLast({})}catch{setError('Chatten kunde inte rensas i telefonlagringen.')}}}><Trash2 size={16}/> Rensa chatt</button></div><div className="nh-gemma-transcript" ref={end} aria-live="polite">{!messages.length&&<p className="nh-gemma-empty">Skriv till Gemma och undersök faktisk svarstid, hastighet och backend. Ingen annan modul får någon uppgift.</p>}{messages.map(m=><article key={m.id} className={'nh-gemma-message '+m.role}><small>{m.role==='user'?'Du':'Gemma'} · {new Date(m.at).toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})}</small><div>{m.content}</div></article>)}{busy&&<p className="nh-gemma-thinking"><Activity size={16}/> Gemma arbetar…</p>}</div><textarea aria-label="Meddelande till Gemma" placeholder="Skriv till Gemma…" value={input} disabled={busy||!status.imported} maxLength={12000} rows={3} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}/><div className="nh-gemma-actions">{busy?<button className="secondary" onClick={()=>{pending.current&&bridge()?.gemmaCancelRequest?.(pending.current);setNotice('Avbrytning begärd.')}}><Square size={16}/> Stoppa</button>:<button className="primary" disabled={!available||!status.imported||!input.trim()} onClick={send}><Send size={16}/> Skicka</button>}<small className="nh-source-caption">Enter skickar · Skift+Enter ny rad · Historiken lagras endast lokalt</small></div></section>
  <section className="panel nh-gemma-telemetry"><h2><Activity size={19}/> Körtelemetri</h2><div className="nh-gemma-metrics">{metrics.map(([label,value])=><div className="nh-gemma-stat" key={label}><small>{label}</small><strong>{String(value??'–')}</strong></div>)}</div><p className="nh-source-caption">Normal körtelemetri. Ingen djup HTP-audit eller paketlista visas. Offload anger vad runtime rapporterar.</p>{telemetry.fallback_occurred&&<p className="error-banner">Fallback: {String(telemetry.fallback_reason||'Okänd orsak')}</p>}<details><summary>Globala inställningar</summary><div className="nh-gemma-metrics">{Object.entries(config).map(([key,value])=><div className="nh-gemma-stat" key={key}><small>{labels[key]||key}</small><strong>{String(value)}</strong></div>)}</div></details></section>
  <RetrievalLab/>
  {settings&&<dialog ref={modalRef} aria-label="Globala Gemma-inställningar" aria-modal="true" className="nh-int-modal-bg" style={{margin:0,border:0,color:'inherit',boxSizing:'border-box',maxWidth:'none',maxHeight:'none',width:'100%',height:'100%'}} onCancel={e=>{e.preventDefault();requestClose()}}><section ref={dialogRef} tabIndex={-1} className="panel nh-int-modal"><h2>Gemma – globala inställningar</h2><p className="nh-source-caption">Profilen lagras i Android och används av alla framtida Gemma-funktioner i NexusHub.</p><div className="nh-int-config">{Object.entries(config).map(([key,current])=><label key={key}><span>{labels[key]||key}</span>{options[key]?<select value={String(draft[key]??current)} onChange={e=>setDraft(old=>({...old,[key]:e.target.value==='true'?true:e.target.value==='false'?false:options[key].every(v=>/^[0-9]+$/.test(v))?Number(e.target.value):e.target.value}))}>{options[key].map(v=><option key={v} value={v}>{v==='true'?'På':v==='false'?'Av':v}</option>)}</select>:<input type="number" step={['temperature','topP','minP','repeatPenalty'].includes(key)?'0.01':'1'} value={draft[key]??current} onChange={e=>setDraft(old=>({...old,[key]:e.target.value===''?'':Number(e.target.value)}))}/>}</label>)}</div><div className="nh-gemma-actions"><button className="primary" onClick={save}>Spara för hela Gemma</button><button className="secondary" onClick={()=>setDraft({...config})}>Återställ utkast</button><button className="secondary" onClick={requestClose}>Stäng</button></div>{confirmClose&&<div role="alert"><p>Du har osparade inställningar. Spara eller kasta ändringarna innan du stänger.</p><div className="nh-gemma-actions"><button className="primary" onClick={save}>Spara och stäng</button><button className="secondary" onClick={()=>{setDraft({...config});setSettings(false)}}>Kasta ändringar</button><button className="secondary" onClick={()=>setConfirmClose(false)}>Fortsätt redigera</button></div></div>}</section></dialog>}
 </div>;
}
