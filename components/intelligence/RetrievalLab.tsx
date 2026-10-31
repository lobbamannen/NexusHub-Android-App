import React,{useEffect,useRef,useState} from 'react';
import {selectRagEvidence,formatRagEvidence,ragAnswerGuidance} from '@/platform/rag-evidence';
import {Search,Activity,BookOpen,RefreshCw,AlertTriangle,Send} from 'lucide-react';
import {buildIdeaCorpus,searchCorpus,sourceLink,type Corpus,type Hit} from '@/platform/idea-retrieval';
import {embeddingStatus,importEmbeddingModel,gemmaRag} from '@/platform/embedding-bridge';
export default function RetrievalLab(){
 const [corpus,setCorpus]=useState<Corpus|null>(null),[status,setStatus]=useState(embeddingStatus),[running,setRunning]=useState(false);
 const [selectionMode,setSelectionMode]=useState<'baseline'|'diverse'>('diverse');
 const [progress,setProgress]=useState(''),[error,setError]=useState(''),[query,setQuery]=useState(''),[scope,setScope]=useState('all');
 const [hits,setHits]=useState<Hit[]>([]),[reply,setReply]=useState(''),[metrics,setMetrics]=useState<Record<string,any>>({});
 const abort=useRef<AbortController|null>(null),runId=useRef(0);
 const load=async()=>{abort.current?.abort();const c=new AbortController();const token=++runId.current;abort.current=c;setRunning(true);setError('');setProgress('Startar indexering');
  try{const next=await buildIdeaCorpus((p,n,total)=>setProgress(p+' '+n+'/'+total),c.signal);if(token!==runId.current||c.signal.aborted)return;setCorpus(next);setProgress(next.incomplete?'Delvis indexerat. Kör igen för att fortsätta.':'Indexet klart.')}
  catch(e:any){if(!c.signal.aborted)setError(e.message)}finally{setRunning(false);setStatus(embeddingStatus())}};
 useEffect(()=>{setStatus(embeddingStatus());const t=setInterval(()=>setStatus(embeddingStatus()),2500);return()=>{clearInterval(t);abort.current?.abort()}},[]);
 const ask=async()=>{if(!corpus||!query.trim())return;const controller=new AbortController();abort.current=controller;const token=++runId.current;setRunning(true);setProgress('Söker källor');setError('');setReply('');setHits([]);
  try{
   const filtered=scope==='all'?undefined:(c:any)=>c.path===scope;
   const result=await searchCorpus(corpus,query,filtered);
   if(controller.signal.aborted||token!==runId.current)return;
   const baseline=result.hits.slice(0,6);
   const selected=selectRagEvidence(result.hits,selectionMode,6);setHits(selected);
   const stats:any={mode:result.mode,fallback:result.fallback||'–',queryEmbeddingMs:Math.round(result.embeddingMs),vectorScanFusionMs:Math.round(result.scanMs),candidateCount:result.hits.length,selectedCount:selected.length,selectionMode,baselineChunkIds:baseline.map(h=>h.chunk.id).join(' | '),selectedChunkIds:selected.map(h=>h.chunk.id).join(' | '),selectedDocumentCount:new Set(selected.map(h=>h.chunk.path)).size,coverage:'Ej mätt – dokumentdiversitet är inte faktatäckning',indexReady:corpus.semanticReady+'/'+corpus.semanticTotal,profile:corpus.profile||'Lexikal',commit:corpus.commit};
   setMetrics(stats);
   if(!selected.length){setReply('Inget relevant dokumentstöd hittades. Gemma har inte anropats.');return;}
   // Chunks are 900-character embedding windows: keep their entire matched text.
   const evidence=[...selected];
   const lead='Du är NexusHubs faktabundna RAG-assistent. Besvara frågan på svenska ENDAST med fakta från utdragen nedan. Ange källor [D1], [D2] etc. Om underlaget inte räcker, säg tydligt att svaret saknas; gissa aldrig. '+ragAnswerGuidance(query)+'\n\nFRÅGA: '+query+'\n\nKÄLLUTDRAG:\n';
   while(evidence.length&&lead.length+formatRagEvidence(evidence).length>11500)evidence.pop();
   if(!evidence.length)throw Error('Frågan är för stor för ett dokumentbundet svar. Ingen text har kapats.');
   const prompt=lead+formatRagEvidence(evidence);
   if(evidence.length<selected.length)setProgress('Källurval begränsat till '+evidence.length+' kompletta utdrag.');
   setHits(evidence);
   setMetrics({...stats,promptCharacters:prompt.length,sourceWindows:selected.map(h=>h.chunk.path+'#'+h.chunk.index+' (0–'+h.chunk.text.length+')').join(' | ')});
   const started=performance.now();
   setProgress('Gemma genererar svar');
   const out=await gemmaRag(prompt,controller.signal);
   if(controller.signal.aborted||token!==runId.current)return;
   setReply(out.text||'Gemma lämnade inget svar.');
   setMetrics({...stats,promptCharacters:prompt.length,sourceWindows:selected.map(h=>h.chunk.path+'#'+h.chunk.index).join(' | '),gemmaDurationMs:Math.round(performance.now()-started),gemmaTelemetry:out.telemetry||{},finishReason:out.finishReason});
  }catch(e:any){if(!controller.signal.aborted&&token===runId.current)setError(e.message||'RAG misslyckades.')}finally{if(token===runId.current){setRunning(false);abort.current=null;}}};
 return <section className="panel nh-retrieval-lab" aria-label="Retrieval Lab">
  <div className="nh-gemma-row"><h2><BookOpen size={19}/> Retrieval Lab · RAG</h2><button className="secondary" onClick={()=>void load()} disabled={running}><RefreshCw size={16}/> {corpus?'Synka index':'Indexera dokument'}</button></div>
  <p className="nh-source-caption">Permanent diagnostik. Samma retrievalmotor som idéinkorgen, men Gemma 4 E2B Q4 används sekventiellt för att formulera källbundna svar.</p>
  <p className="nh-source-caption">EmbeddingGemma 2: {status.installed?'Installerad':'Saknas'} · {status.backend||'CPU'} · {status.modelSha256?.slice(0,16)||'ingen profil'}</p>
  {!status.installed&&<div><button className="secondary" onClick={()=>importEmbeddingModel()}>Importera EmbeddingGemma 2 .litertlm</button> <a href="https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm/blob/main/embeddinggemma-2-text-270m.litertlm" target="_blank" rel="noopener noreferrer">Officiell modell</a></div>}
  {running&&<p role="status"><Activity size={15}/>{progress||'Bearbetar frågan…'} <button type="button" className="secondary" onClick={()=>{abort.current?.abort();setProgress('Avbrytning begärd');}}>Avbryt arbete</button></p>}
  {error&&<p className="error-banner" role="alert"><AlertTriangle size={15}/>{error}</p>}
  {corpus&&<p className="nh-source-caption">{corpus.docs.length} dokument · {corpus.semanticReady}/{corpus.semanticTotal} embeddingfönster · {corpus.incomplete?'Delvis klart':'Komplett'} · {corpus.unsupportedFiles?corpus.unsupportedFiles+' PDF/DOCX utan textextraktion · ':''}Commit {corpus.commit.slice(0,12)}</p>}
  <label className="field">Dokumentomfång<select value={scope} onChange={e=>setScope(e.target.value)}><option value="all">Alla idéer och forskningsrapporter</option>{corpus?.docs.map(d=><option key={d.path} value={d.path}>{d.title.slice(0,70)} ({d.kind})</option>)}</select></label>
  <label className="field">Källurval<select value={selectionMode} onChange={e=>setSelectionMode(e.target.value as 'baseline'|'diverse')}><option value="baseline">Referens: sex högst rankade</option><option value="diverse">Försiktig dokumentdiversifiering</option></select></label>
  <label className="field">Fråga<textarea rows={3} maxLength={3000} placeholder="Vad säger dokumentet om …?" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <button className="primary" onClick={()=>void ask()} disabled={running||!corpus||!query.trim()}><Send size={15}/> Hämta källor och fråga Gemma</button>
  {Object.keys(metrics).length>0&&<details open className="nh-retrieval-metrics"><summary>Retrievaldiagnostik</summary><div className="nh-gemma-metrics">{Object.entries(metrics).filter(([k])=>k!=='gemmaTelemetry').map(([k,v])=><div className="nh-gemma-stat" key={k}><small>{k}</small><strong>{String(v)}</strong></div>)}</div>{metrics.gemmaTelemetry&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify(metrics.gemmaTelemetry,null,2)}</pre>}</details>}
  {!!hits.length&&<details open><summary>Hämtade källor ({hits.length})</summary>{hits.map((h,i)=><article key={h.chunk.id} className="nh-idea-match"><p><strong>[D{i+1}] {h.chunk.title}</strong> · {h.reason}</p><p>{h.chunk.text.slice(0,1200)}</p><p className="nh-source-caption">Chunk {h.chunk.index} · Matchat fönster: hela chunkens {h.chunk.text.length} tecken · Lexikal {h.lexicalRank??'–'} · Semantisk {h.semanticRank??'–'} · Cosine {h.cosine?.toFixed(3)??'–'} · SHA {h.chunk.sha.slice(0,12)}</p><a href={sourceLink(h.chunk.path,corpus!.commit)} target="_blank" rel="noopener noreferrer">Visa verifierat dokument</a></article>)}</details>}
  {reply&&<article className="nh-gemma-message assistant" role="status"><strong>Gemma 4 · dokumentbundet svar</strong><div style={{whiteSpace:'pre-wrap'}}>{reply}</div></article>}
 </section>;
}
