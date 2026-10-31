import {readableIdeaExcerpt} from './idea-excerpt';
import {replicaReader} from './mirror-access';
import {durableGet,durableSet} from './local-store';
import {embedBatch,embeddingStatus,type EmbedItem} from './embedding-bridge';
import {ideaProbes,rankIdeaRelations,type RelationCandidate} from './idea-relations';

export type Chunk={id:string;path:string;sha:string;title:string;kind:'idea'|'report'|'attachment';text:string;index:number;heading:string;sourceHash?:string;vector?:number[];profile?:string};
export type Doc={path:string;sha:string;kind:Chunk['kind'];title:string;chunks:Chunk[];indexedAt:string};
export type Corpus={commit:string;docs:Doc[];changed:number;skipped:number;semanticReady:number;semanticTotal:number;profile:string;incomplete:boolean;unsupportedFiles:number};
export type Hit={chunk:Chunk;score:number;lexicalRank:number|null;semanticRank:number|null;cosine:number|null;reason:'hybrid'|'lexical'|'semantic'};
const PREFIX='nexus-idea-retrieval:v2:';
const sleep=()=>new Promise<void>(r=>setTimeout(r,0));
// A cache entry is valid only for the exact model, prompt/chunker profile and text digest.
const vectorCacheKey=(profile:string,hash:string)=>PREFIX+'vector:'+profile+':'+hash;
const queryCache=new Map<string,number[]>();
const QUERY_CACHE_LIMIT=24;
const rememberQuery=(key:string,vector:number[])=>{
 if(queryCache.has(key))queryCache.delete(key);
 queryCache.set(key,vector);
 while(queryCache.size>QUERY_CACHE_LIMIT)queryCache.delete(queryCache.keys().next().value!);
};

const tokenize=(s:string)=>[...new Set((s.toLocaleLowerCase('sv-SE').normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(t=>!['och','eller','som','att','det','den','med','har','för','från','till','the','and','for','are','this'].includes(t)))];
const kindOf=(path:string):Doc['kind']|null=>/^Ideer\/[0-9a-f-]{36}\.json$/i.test(path)?'idea':
 /^NexusHub inkorg\/.*\.(md|txt|json)$/i.test(path)&&!/\/(manifest|receipt|metadata)\.json$/i.test(path)?'report':
 /^Ideer\/Bilagor\/.*\.(md|txt|json)$/i.test(path)?'attachment':null;
function chunks(path:string,sha:string,kind:Doc['kind'],title:string,text:string):Chunk[]{
 const cleaned=text.replace(/\r\n?/g,'\n').trim();
 const out:Chunk[]=[];let pos=0,heading='';
 while(pos<cleaned.length){
  let end=Math.min(pos+900,cleaned.length);
  if(end<cleaned.length){const near=cleaned.lastIndexOf('\n',end);if(near>pos+470)end=near+1}
  const part=cleaned.slice(pos,end).trim();
  const headings=[...part.matchAll(/^#{1,5}\s+(.+)$/gm)];if(headings.length)heading=headings[headings.length-1][1].slice(0,150);
  if(part)out.push({id:path+'#'+out.length,path,sha,kind,title,text:part,index:out.length,heading});
  if(end>=cleaned.length)break;
  pos=Math.max(pos+1,end-120);
 }
 return out;
}
function sourceText(path:string,raw:string):{title:string;text:string}{
 const title=path.split('/').pop()?.replace(/\.[^.]+$/,'')||path;
 if(!path.endsWith('.json'))return {title,text:raw};
 try{
  const j=JSON.parse(raw),record=j.record||j;
  if(/^Ideer\/[0-9a-f-]{36}\.json$/i.test(path))return {title:record.text?.split('\n')[0]?.slice(0,110)||title,text:String(record.text||'')};
  const body=[record.title,record.summary,record.text,record.body,record.content].filter(x=>typeof x==='string').join('\n');
  return {title:record.title||title,text:body};
 }catch{return {title,text:''}}
}
const profileOf=(status:ReturnType<typeof embeddingStatus>)=>status.installed&&/^[a-f0-9]{64}$/.test(status.modelSha256)?status.modelSha256+':'+status.profileVersion+':chunk-v2':'';
export async function buildIdeaCorpus(progress:(message:string,done:number,total:number)=>void=()=>{},signal?:AbortSignal,semantic=true):Promise<Corpus>{
 const snapshot=await replicaReader.current('databas');
 if(!snapshot)throw Error('Vänta tills den verifierade GitHub-replikan av Databas har hämtats helt.');
 const status=embeddingStatus(),profile=profileOf(status),files=(snapshot.files as any[])
  .filter(f=>kindOf(f.path)&&f.size<=2*1024*1024).sort((a,b)=>a.path.localeCompare(b.path,'sv'));
 const unsupportedFiles=(snapshot.files as any[]).filter(f=>/^(Ideer\/Bilagor\/|NexusHub inkorg\/).*\.(pdf|docx)$/i.test(f.path)).length;
 const docs:Doc[]=[];let changed=0,skipped=0,done=0,semanticReady=0,semanticTotal=0;
 for(const file of files){
  if(signal?.aborted)throw new DOMException('Avbruten','AbortError');
  let doc=await durableGet<Doc>(PREFIX+'doc:'+file.path);
  if(!doc||doc.sha!==file.sha){
   const previous=doc;
   const source=await replicaReader.file('databas',file.path);
   if(!source||source.commit!==snapshot.commit)throw Error('Dokumentversionen ändrades under indexeringen: '+file.path);
   const value=sourceText(file.path,new TextDecoder('utf-8',{fatal:true}).decode(source.bytes));
   doc={path:file.path,sha:file.sha,kind:kindOf(file.path)!,title:value.title,chunks:chunks(file.path,file.sha,kindOf(file.path)!,value.title,value.text),indexedAt:new Date().toISOString()};
   const old=new Map((previous?.chunks||[]).filter(c=>c.sourceHash).map(c=>[c.sourceHash!,c]));
   for(const chunk of doc.chunks){
    const source='title='+chunk.title+(chunk.heading?' – '+chunk.heading:'')+'\ntext='+chunk.text;
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)));
    chunk.sourceHash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    const found=old.get(chunk.sourceHash);
    if(found?.vector?.length===256&&found.profile){chunk.vector=found.vector;chunk.profile=found.profile;}
   }
   await durableSet(PREFIX+'doc:'+file.path,doc);changed++;
  }else skipped++;
  docs.push(doc);done++;progress('Läser och kontrollerar dokument',done,files.length);
  await sleep();
 }
 // No returned snapshot may claim completeness after a sync generation change.
 if((await replicaReader.current('databas'))?.commit!==snapshot.commit)throw Error('Synk ändrades under indexering; starta om.');
 if(semantic&&profile){
  // Reuse persisted vectors even across distinct files with identical title/text.
  // No model inference is needed for a previously embedded, profile-matching window.
  for(const doc of docs){
   let restored=false;
   for(const c of doc.chunks){
    if(c.profile===profile&&c.vector?.length===256)continue;
    if(!c.sourceHash)continue;
    const cached=await durableGet<number[]>(vectorCacheKey(profile,c.sourceHash));
    if(cached?.length===256&&cached.every(Number.isFinite)){
     c.vector=cached;c.profile=profile;restored=true;
    }
   }
   if(restored)await durableSet(PREFIX+'doc:'+doc.path,doc);
  }
  const all=docs.flatMap(d=>d.chunks.filter(c=>c.profile!==profile||!c.vector||c.vector.length!==256));
  semanticTotal=docs.reduce((sum,d)=>sum+d.chunks.length,0);
  let indexed=semanticTotal-all.length;
  progress('EmbeddingGemma 2 indexerar förändrade textfönster',indexed,semanticTotal);
  for(let offset=0;offset<all.length;offset+=8){
   if(signal?.aborted)throw new DOMException('Avbruten','AbortError');
   // Avoid using a stale model profile; never save vectors from the wrong generation.
   if(profile!==profileOf(embeddingStatus()))throw Error('Embeddingmodellens profil ändrades under indexeringen.');
   const batch=all.slice(offset,offset+8);
   const items:EmbedItem[]=batch.map(c=>({id:c.id,title:c.title+(c.heading?' – '+c.heading:''),text:c.text.slice(0,3500),task:'document'}));
   const result=await embedBatch(items,signal);
   if(result.modelSha256+':'+result.profileVersion+':chunk-v2'!==profile)throw Error('Native modellprofil ändrades.');
   for(const v of result.vectors){
    const chunk=batch.find(c=>c.id===v.id);if(!chunk)throw Error('Okänd embeddingidentifierare.');
    chunk.vector=v.values;chunk.profile=profile;
    if(chunk.sourceHash)await durableSet(vectorCacheKey(profile,chunk.sourceHash),v.values);
   }
   for(const doc of docs.filter(d=>batch.some(c=>c.path===d.path)))await durableSet(PREFIX+'doc:'+doc.path,doc);
   indexed+=batch.length;progress('EmbeddingGemma 2 indexerar förändrade textfönster',indexed,semanticTotal);
   if((await replicaReader.current('databas'))?.commit!==snapshot.commit)throw Error('GitHub-replikan ändrades under embedding.');
   await sleep();
  }
  semanticReady=indexed;
 }else{
  semanticTotal=docs.reduce((sum,d)=>sum+d.chunks.length,0);
  semanticReady=docs.reduce((sum,d)=>sum+d.chunks.filter(c=>profile&&c.profile===profile&&c.vector?.length===256).length,0);
 }
 return {commit:snapshot.commit,docs,changed,skipped,semanticReady,semanticTotal,profile,incomplete:semanticReady<semanticTotal,unsupportedFiles};
}
export async function searchCorpus(corpus:Corpus,query:string,filter?:(c:Chunk)=>boolean,hitLimit=32):Promise<{hits:Hit[];mode:string;embeddingMs:number;scanMs:number;fallback:string}>{
 const start=performance.now(),terms=tokenize(query),all=corpus.docs.flatMap(d=>d.chunks).filter(c=>!filter||filter(c));
 if(!query.trim())return {hits:[],mode:'none',embeddingMs:0,scanMs:0,fallback:'Tom fråga'};
 const df=new Map<string,number>();for(const c of all){const tokens=new Set(tokenize(c.text+' '+c.title));for(const t of terms)if(tokens.has(t))df.set(t,(df.get(t)||0)+1)}
 const lexical=all.map(c=>{
  const hay=(c.title+' '+c.heading+' '+c.text).toLocaleLowerCase('sv-SE');let score=0;
  for(const t of terms){const f=hay.split(t).length-1;if(f)score+=(1+Math.log(1+f))*Math.log(1+(all.length+1)/(1+(df.get(t)||0)))}
  if(hay.includes(query.toLocaleLowerCase('sv-SE').trim()))score+=6;
  return {c,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id)).slice(0,160);
 const semantic: Array<{c:Chunk;score:number}>=[];
 let embeddingMs=0,fallback='';
 const valid=all.filter(c=>c.profile===corpus.profile&&c.vector?.length===256);
 if(corpus.profile && valid.length){
  try {
   const begun=performance.now();
   const queryText=query.slice(0,3000);
   const cacheKey=corpus.profile+'|'+queryText;
   let q=queryCache.get(cacheKey);
   if(!q){
    const result=await embedBatch([{id:'query',text:queryText,task:'query'}]);
    if(result.modelSha256+':'+result.profileVersion+':chunk-v2'!==corpus.profile)throw Error('Föråldrad embeddingprofil');
    q=result.vectors[0].values;
    rememberQuery(cacheKey,q);
   }
   embeddingMs=performance.now()-begun;
   for(const c of valid){
    const v=c.vector!;let score=0;
    for(let i=0;i<256;i++)score+=q[i]*v[i];
    if(Number.isFinite(score))semantic.push({c,score});
   }
   semantic.sort((a,b)=>b.score-a.score||a.c.id.localeCompare(b.c.id));
  }catch(e:any){fallback=e.message||'Semantisk sökning misslyckades'}
 }else fallback=corpus.profile?'Semantiskt index är inte klart':'EmbeddingGemma 2 saknas; lexikal fallback';
 const lRanks=new Map<string,number>(lexical.map((x,i):[string,number]=>[x.c.id,i+1])),sRanks=new Map<string,number>(semantic.slice(0,160).map((x,i):[string,number]=>[x.c.id,i+1]));
 const sScores=new Map<string,number>(semantic.slice(0,160).map(x=>[x.c.id,x.score]));
 const candidates=new Map<string,Chunk>(all.filter(c=>lRanks.has(c.id)||sRanks.has(c.id)).map(c=>[c.id,c]));
 const hits=[...candidates.values()].map(c=>{
  const l=lRanks.get(c.id)||null,s=sRanks.get(c.id)||null;
  return {chunk:c,lexicalRank:l,semanticRank:s,cosine:sScores.get(c.id)??null,
   score:(l?0.5/(60+l):0)+(s?0.5/(60+s):0),reason:l&&s?'hybrid':s?'semantic':'lexical'} as Hit;
 }).sort((a,b)=>b.score-a.score||a.chunk.id.localeCompare(b.chunk.id)).slice(0,hitLimit);
 return {hits,mode:semantic.length?'HYBRID':'LEXICAL_FALLBACK',embeddingMs,scanMs:performance.now()-start-embeddingMs,fallback};
}
export async function relatedReportCandidates(corpus:Corpus,idea:{id:string;text:string},limit=6):Promise<RelationCandidate[]>{
 const probes=ideaProbes(idea.text);
 const results:Hit[][]=[];
 for(const probe of probes){
  const found=await searchCorpus(corpus,probe,c=>c.kind!=='idea'&&c.path!=='Ideer/'+idea.id+'.json',96);
  results.push(found.hits);
 }
 return rankIdeaRelations(idea.text,results,limit);
}
export async function relatedReports(corpus:Corpus,idea:{id:string;text:string},limit=6):Promise<Hit[]>{
 return (await relatedReportCandidates(corpus,idea,limit)).map(candidate=>candidate.hit);
}
export function sourceLink(path:string,commit:string){return 'https://github.com/lobbamannen/Databas/blob/'+commit+'/'+path.split('/').map(encodeURIComponent).join('/')}

// A passage is exported only from the exact SHA associated with the retrieval hit.
export function relationExcerpt(corpus:Corpus,hit:Hit,maxChars=2600):{text:string;windowIndex:number;sha:string;contextIndices:number[]}|null{
 const doc=corpus.docs.find(d=>d.path===hit.chunk.path&&d.sha===hit.chunk.sha);
 if(!doc||doc.chunks[hit.chunk.index]?.id!==hit.chunk.id)return null;
 const excerpt=readableIdeaExcerpt(doc.chunks,hit.chunk.index,maxChars);
 return excerpt?{...excerpt,sha:doc.sha}:null;
}
