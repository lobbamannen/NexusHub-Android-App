import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {BrainCircuit,RefreshCw,CheckCircle2,AlertTriangle,Copy,ExternalLink,Search} from 'lucide-react';
import {buildIdeaCorpus,relatedReportCandidates,relationExcerpt,sourceLink,type Corpus,type Hit} from '@/platform/idea-retrieval';
import {durableGet,durableSet} from '@/platform/local-store';
import type {RelationCandidate} from '@/platform/idea-relations';
import {embeddingStatus,importEmbeddingModel} from '@/platform/embedding-bridge';

type Idea={id:string;text:string};
export type IdeaIntelligenceSummary={counts:Record<string,number>;indexed:boolean;running:boolean;error:string};
type Decision={state:'dismissed'|'reviewed';sha:string;at:string};
const evidenceLabel=(kind:RelationCandidate['evidenceClass'])=>kind==='direct'?'Direkt ämnesunderlag':kind==='background'?'Kompletterande bakgrund':'Osäkert samband';
const key=(id:string,path:string)=>'nexus-idea-decision:v1:'+id+':'+path;
export default function IdeaIntelligence({ideas,onSummaryChange}:{ideas:Idea[];onSummaryChange?:(summary:IdeaIntelligenceSummary)=>void}){
 const [corpus,setCorpus]=useState<Corpus|null>(null),[status,setStatus]=useState(embeddingStatus);
 const [running,setRunning]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState({done:0,total:0});
 const [error,setError]=useState(''),[matches,setMatches]=useState<Record<string,RelationCandidate[]>>({});
 const [decisions,setDecisions]=useState<Record<string,Decision>>({});
 const [selected,setSelected]=useState(''),abort=useRef<AbortController|null>(null),seq=useRef(0);
 const ideasKey=JSON.stringify(ideas.map(i=>[i.id,i.text]));
 const list=useMemo(()=>ideas.filter(i=>i.text?.trim()),[ideasKey]);
 const current=list.find(i=>i.id===selected)||list[0];
 const update=useCallback(async()=> {
  if(abort.current)abort.current.abort();
  const controller=new AbortController();abort.current=controller;const token=++seq.current;
  setRunning(true);setError('');setMatches({});setMessage('Verifierar lokala dokument');
  try{
   const found=await buildIdeaCorpus((m,done,total)=>{if(token===seq.current){setMessage(m);setProgress({done,total})}},controller.signal);
   if(token!==seq.current)return;
   setCorpus(found);const next:Record<string,RelationCandidate[]>={};const states:Record<string,Decision>={};
   for(const idea of list){if(controller.signal.aborted)break;
    next[idea.id]=await relatedReportCandidates(found,idea);
    for(const candidate of next[idea.id]){const hit=candidate.hit;const d=await durableGet<Decision>(key(idea.id,hit.chunk.path));if(d)states[key(idea.id,hit.chunk.path)]=d;}
    if(token===seq.current)setMatches({...next});
   }
   setDecisions(states);setMessage(found.incomplete?'Delvis indexerat – fortsätt för att indexera resterande fönster.':'Indexet är uppdaterat.');
  }catch(e:any){if(!controller.signal.aborted&&token===seq.current)setError(e.message||'Indexering misslyckades.')}
  finally{if(token===seq.current){setRunning(false);abort.current=null;setStatus(embeddingStatus())}}
 },[list]);
 useEffect(()=>{let active=true;const starter=()=>{if(active)void update()};starter();
  window.addEventListener('nexus-github-changed',starter);
  return()=>{active=false;seq.current++;abort.current?.abort();window.removeEventListener('nexus-github-changed',starter)};
 },[update]);
 useEffect(()=>{const timer=setInterval(()=>setStatus(embeddingStatus()),2500);return()=>clearInterval(timer)},[]);
 const decision=async(ideaId:string,hit:Hit,state:Decision['state'])=>{
  try{const item={state,sha:hit.chunk.sha,at:new Date().toISOString()};const k=key(ideaId,hit.chunk.path);
   await durableSet(k,item);setDecisions(old=>({...old,[k]:item}));}catch(e:any){setError('Beslutet kunde inte sparas lokalt: '+e.message)}
 };
 const summary=useMemo<IdeaIntelligenceSummary>(()=>{
  const counts:Record<string,number>={};
  for(const [id,candidates] of Object.entries(matches)){
   const visible=candidates.filter(({hit})=>{const d=decisions[key(id,hit.chunk.path)];return !(d?.state==='dismissed'&&d.sha===hit.chunk.sha)});
   if(visible.length)counts[id]=visible.length;
  }
  return {counts,indexed:!!corpus,running,error};
 },[matches,decisions,corpus,running,error]);
 useEffect(()=>onSummaryChange?.(summary),[onSummaryChange,summary]);
 const chosen=matches[current?.id||'']||[];
 const handoff=async()=>{
  if(!current||!corpus)return;
  const accepted=chosen.filter(c=>decisions[key(current.id,c.hit.chunk.path)]?.state!=='dismissed');
  const text=['NexusHub – versionsbunden idéöverlämning','Databas commit: '+corpus.commit,'Idé-ID: '+current.id,'Idétext:\n'+current.text,'','Föreslagna forskningsunderlag (ej verifierade relationer):',
   ...accepted.map(({hit,confidence,evidenceClass,evidenceTerms,distinctPassages,reason,evidenceCount,matchedProbes},i)=>{const excerpt=relationExcerpt(corpus,hit);return '\n'+(i+1)+'. '+hit.chunk.path+'\nSHA: '+hit.chunk.sha+'\nKälla: '+sourceLink(hit.chunk.path,corpus.commit)+'\nEvidensklass: '+evidenceLabel(evidenceClass)+' (automatisk bedömning, ej verifierad)\nHittade ämnesord: '+(evidenceTerms.join(', ')||'inga')+'; distinkta textområden: '+distinctPassages+'\nRetrievalstyrka: '+(confidence==='strong'?'Stark kandidat':'Möjlig kandidat')+'\nMatchningsorsak: '+reason+'\nRetrieval: '+hit.reason+'; lexikal rang '+(hit.lexicalRank??'–')+'; semantisk rang '+(hit.semanticRank??'–')+'; cosine '+(hit.cosine?.toFixed(3)??'–')+'; idéavsnitt '+matchedProbes+'; matchande fönster '+evidenceCount+' (inte oberoende belägg)\nProfil: '+corpus.profile+'\nBästa fönsterindex: '+hit.chunk.index+'; närliggande fönster: '+(excerpt?.contextIndices.join(', ')??'saknas')+'\nRelevant utdrag:\n'+(excerpt?.text??'[Källversion saknas – kontrollera index]');})].join('\n');
  try{await navigator.clipboard.writeText(text);setMessage('Versionsbundet underlag kopierat till urklipp.')}catch{setError('Kopiering blockerad av Android/WebView.')}
 };
 return <section className="panel nh-idea-intelligence" aria-label="Intelligent idéinkorg">
  <div className="nh-gemma-row"><h2><BrainCircuit size={19}/> Intelligenta samband</h2><button className="secondary" type="button" disabled={running} onClick={()=>void update()}><RefreshCw size={16}/> Kontrollera dokument</button></div>
  <p className="nh-source-caption">Förslag från GitHub-verifierade dokumentversioner. Inga original eller kopplingar ändras automatiskt.</p>
  {!status.installed&&<div className="nh-idea-intro"><strong>EmbeddingGemma 2 är inte installerad.</strong><p>Nyckelordssökning fungerar ändå. Importera den officiella textmodellen för semantiska samband.</p>
   <button className="secondary" type="button" onClick={()=>importEmbeddingModel()} disabled={status.importing}>Importera .litertlm</button>
   <a href="https://huggingface.co/litert-community/embeddinggemma-2-text-270m-litert-lm/blob/main/embeddinggemma-2-text-270m.litertlm" target="_blank" rel="noopener noreferrer">Officiell modellfil <ExternalLink size={13}/></a></div>}
  {running&&<div role="status"><p>{message} · {progress.done}/{progress.total}</p><progress value={progress.done} max={progress.total||1}/><button className="secondary" type="button" onClick={()=>abort.current?.abort()}>Avbryt säkert</button></div>}
  {error&&<p className="error-banner" role="alert"><AlertTriangle size={16}/>{error}</p>}
  {corpus&&<p className="nh-source-caption">{corpus.docs.length} dokument · {corpus.semanticReady}/{corpus.semanticTotal} semantiska textfönster · {corpus.unsupportedFiles?corpus.unsupportedFiles+' PDF/DOCX väntar på textextraktion · ':''}{corpus.incomplete?'Ofullständigt index':'Aktuellt index'} · Git {corpus.commit.slice(0,9)}</p>}
  {!!list.length&&<><label className="field">Välj idé<select value={current?.id||''} onChange={e=>setSelected(e.target.value)}>{list.map(i=><option key={i.id} value={i.id}>{i.text.replace(/\s+/g,' ').slice(0,85)}</option>)}</select></label>
   {!running&&!chosen.length&&<p className="muted small">Inga tillräckligt starka relationskandidater hittades. Det betyder inte att samband saknas.</p>}
   {chosen.map(candidate=>{const hit=candidate.hit;const d=decisions[key(current.id,hit.chunk.path)],suppressed=d?.state==='dismissed'&&d.sha===hit.chunk.sha;
    return <article key={hit.chunk.path} className="nh-idea-match" style={{opacity:suppressed ? 0.55 : 1}}>
     <div className="nh-gemma-row"><strong>{hit.chunk.title}</strong><small>{evidenceLabel(candidate.evidenceClass)} · {hit.reason==='hybrid'?'Hybridträff':hit.reason==='semantic'?'Semantisk träff':'Textträff'}</small></div>
     <p className="nh-source-caption">{candidate.reason} · {candidate.matchedProbes} idéavsnitt · {candidate.evidenceCount} träfffönster ({candidate.distinctPassages} separata textområden). Automatisk ämnesbedömning, inte verifierad relation.</p><p>{hit.chunk.text.slice(0,460)}{hit.chunk.text.length>460?'…':''}</p>
     <p className="nh-source-caption">Dokument: {hit.chunk.path} · SHA: {hit.chunk.sha.slice(0,12)} · Avsnitt #{hit.chunk.index+1} · Semantisk rang: {hit.semanticRank??'–'} · Lexikal rang: {hit.lexicalRank??'–'}{hit.cosine!=null?' · Cosine: '+hit.cosine.toFixed(3):''}</p>
     <div className="nh-gemma-actions"><a href={sourceLink(hit.chunk.path,corpus?.commit||'main')} target="_blank" rel="noopener noreferrer">Visa original <ExternalLink size={14}/></a>
      <button className="secondary" type="button" onClick={()=>void decision(current.id,hit,'reviewed')}><CheckCircle2 size={14}/> {d?.state==='reviewed'?'Granskad':'Markera granskad'}</button>
      <button className="secondary" type="button" onClick={()=>void decision(current.id,hit,'dismissed')}>{suppressed?'Avfärdad':'Avfärda förslag'}</button>
     </div>
    </article>})}
   <button className="secondary" type="button" disabled={!corpus||!chosen.length} onClick={()=>void handoff()}><Copy size={15}/> Kopiera underlag till ChatGPT</button>
   <p className="nh-source-caption">Granskad/avfärdad lagras lokalt. En permanent bilaga sparas separat via idéns befintliga GitHub-bilagor.</p>
  </>}
 </section>;
}
