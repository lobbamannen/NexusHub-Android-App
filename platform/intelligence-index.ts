import {replicaReader} from './mirror-access';

type Progress={state:'idle'|'running'|'ready'|'failed'|'unavailable';done:number;total:number;commit:string;error?:string};
let current:Promise<Progress>|null=null;
let progress:Progress={state:'idle',done:0,total:0,commit:''};
export const intelligenceIndexProgress=()=>({...progress});
const bridge=()=>typeof window==='undefined'?null:(window as any).Android;
const publish=(value:Progress)=>{progress=value;window.dispatchEvent(new CustomEvent('nexus-intelligence-index',{detail:value}));};
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
const eligible=(f:any)=>typeof f.path==='string'&&/\.(md|txt|json|csv)$/i.test(f.path)
    &&Number.isSafeInteger(f.size)&&f.size>=0&&f.size<=120000&&!f.path.startsWith('/')&&!f.path.includes('\\')
    &&!f.path.split('/').some((part:string)=>part==='..'||part==='.'||!part);

export async function syncIntelligenceIndex(force=false):Promise<Progress> {
 if(current)return current;
 const native=bridge();
 if(!native?.intelligenceIndexBegin){const no={state:'unavailable' as const,done:0,total:0,commit:'',error:'Native sökindex saknas'};publish(no);return no;}
 current=(async()=>{
  const snapshot=await replicaReader.current('databas');
  if(!snapshot){const no={state:'unavailable' as const,done:0,total:0,commit:'',error:'Den verifierade lokala Databas-spegeln är inte färdig'};publish(no);return no;}
  const status=JSON.parse(native.intelligenceIndexStatus()||'{}');
  if(!force && status.ready && status.commit===snapshot.commit){
   const ready={state:'ready' as const,done:status.indexedFiles||0,total:status.indexedFiles||0,commit:snapshot.commit};publish(ready);return ready;
  }
  const files=(snapshot.files||[]).filter(eligible);
  publish({state:'running',done:0,total:files.length,commit:snapshot.commit});
  const begin=JSON.parse(native.intelligenceIndexBegin(snapshot.commit)||'{}');
  if(begin.error)throw Error(begin.error);
  let done=0;
  for(const entry of files){
   const current=await replicaReader.current('databas');
   if(!current||current.commit!==snapshot.commit)throw Error('Databas ändrades under indexeringen');
   const verified=await replicaReader.file('databas',entry.path);
   if(!verified||verified.sha!==entry.sha||verified.commit!==snapshot.commit)throw Error('Verifierad lokal fil saknas: '+entry.path);
   const body=new TextDecoder('utf-8',{fatal:true}).decode(verified.bytes);
   let title=entry.path.split('/').pop()?.replace(/\.[^.]+$/,'')||entry.path;
   if(entry.path.endsWith('.json')){try {
    const data=JSON.parse(body),source=data?.record||data;
    if(typeof source?.title==='string')title=source.title.slice(0,300);
    else if(typeof source?.text==='string')title=source.text.split('\n')[0].slice(0,200)||title;
   }catch{/* The original text remains searchable even if the JSON body is malformed. */}}
   else if(entry.path.endsWith('.md'))title=body.match(/^#\s+([^\n]{2,250})/m)?.[1]||title;
   const ok=native.intelligenceIndexUpsert(JSON.stringify({commit:snapshot.commit,
       path:entry.path,sha:entry.sha,title,body}));
   if(!ok)throw Error('Indexet nekade verifierad fil: '+entry.path);
   done++;
   if(done%5===0){publish({state:'running',done,total:files.length,commit:snapshot.commit});await pause();}
  }
  const finished=JSON.parse(native.intelligenceIndexFinish(snapshot.commit,files.length)||'{}');
  if(finished.error||!finished.ready||finished.commit!==snapshot.commit)
   throw Error(finished.error||'Indexet saknar verifierad slutkvittens');
  const ready={state:'ready' as const,done,total:files.length,commit:snapshot.commit};
  publish(ready);return ready;
 })().catch((e:any)=>{const failed={state:'failed' as const,done:progress.done,total:progress.total,commit:progress.commit,error:e.message||String(e)};publish(failed);return failed})
    .finally(()=>{current=null});
 return current;
}

/**
 * Runs from the app bootstrap, not just when the Intelligence dashboard is open.
 * Replica completion is the authoritative trigger. Failed attempts remain visible
 * in progress and can be retried on the next completed replica notification.
 * Never creates an incomplete index from an unverified partial mirror.
 */
let installed=false;
export function startIntelligenceSync() {
 if(typeof window==='undefined'||installed)return;
 installed=true;
 const run=()=>{if(bridge()?.intelligenceIndexBegin)void syncIntelligenceIndex();};
 window.addEventListener('nexus-github-changed',run);
 window.addEventListener('nexus-credentials-changed',run);
 window.setTimeout(run,1500);
}
