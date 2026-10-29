import {replicaReader} from './mirror-access';
import {durableGet,durableSet} from './local-store';
import {connectionNodes,connectionEdges,contentCandidate,extractReferences} from '@/lib/connections.mjs';

const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
/** Derived metadata only. Each cached extraction belongs to one immutable blob. */
export async function buildConnectionIndex(documents:any[],signal:AbortSignal,progress:(n:number,total:number)=>void){
 const snapshot=await replicaReader.current('databas');if(!snapshot)throw Error('Kopplingarna blir tillgängliga när Databas har synkroniserats klart.');
 const files=snapshot.files as any[],allPaths=new Set(files.map(f=>f.path));
 const active=new Map(documents.map(d=>[d.path,d]));
 const docs=files.filter(f=>contentCandidate(f.path)).map(f=>active.get(f.path)||({...f,title:f.path.split('/').pop()?.replace(/\.[^.]+$/,''),technical:/Kunskapsbanken\/records\/chunk-/.test(f.path)}));
 let nodes=connectionNodes(docs);const references:Record<string,any>={},broken:any[]=[],warnings:string[]=[];let done=0;
 const readable=nodes.filter(n=>/\.(md|txt|json)$/i.test(n.path));
 const sourceFiles=files.filter(f=>/^Kunskap\/Kunskapsbanken\/records\/source-.*\.json$/.test(f.path));
 const sourceUrls=new Map<string,string>();
 for(const f of sourceFiles){if(signal.aborted)throw new DOMException('Avbruten','AbortError');try{const cacheKey='connections:source:v1:'+f.sha;let source=await durableGet<any>(cacheKey);if(!source){const file=await replicaReader.file('databas',f.path);if(!file||file.commit!==snapshot.commit)throw Error();const r=JSON.parse(new TextDecoder().decode(file.bytes)).record;source={id:r.source_id,url:r.url};await durableSet(cacheKey,source);}if(source.id&&source.url)sourceUrls.set(source.id,source.url);}catch{warnings.push('En källpost kunde inte läsas.');}await pause();}
 for(const n of readable){
  if(signal.aborted)throw new DOMException('Avbruten','AbortError');
  try{
   const fileMeta=files.find(f=>f.path===n.path),cacheKey='connections:extract:v2:'+fileMeta.sha;let p=await durableGet<any>(cacheKey);
   if(!p){const file=await replicaReader.file('databas',n.path);if(!file||file.commit!==snapshot.commit)throw Error('Kopian kunde inte verifieras.');const raw=new TextDecoder('utf-8',{fatal:true}).decode(file.bytes);let body=raw,record:any=null;
    if(n.path.endsWith('.json')){const data=JSON.parse(raw);record=data.record||data;body=[record.text,record.body,record.content,JSON.stringify({...record,text:undefined,body:undefined,content:undefined})].filter(x=>typeof x==='string').join('\n');}
    const refs=extractReferences(body,n.path);const sourceIds=new Set<string>();
    const walk=(value:any,key='')=>{if(Array.isArray(value)){for(const v of value)walk(v,key);}else if(value&&typeof value==='object'){for(const [k,v]of Object.entries(value))walk(v,k);}else if(typeof value==='string'&&/^(source_id|source_ids|source_refs)$/.test(key))sourceIds.add(value);};if(record)walk(record);
    p={...refs,sourceIds:[...sourceIds],title:record?.title||record?.headline||(n.path.startsWith('Ideer/')?record?.text?.split('\n')[0]?.slice(0,130):null),tags:record?.tags||record?.tag_keys||[],summary:record?.summary||''};await durableSet(cacheKey,p);
   }
   if(p.title)n.title=p.title;if(Array.isArray(p.tags)&&p.tags.length)n.tags=p.tags;n.summary=p.summary;
   references[n.id]={paths:p.paths,urls:[...new Set([...p.urls,...p.sourceIds.map((id:string)=>sourceUrls.get(id)).filter(Boolean)])]};
   for(const path of p.paths)if(!allPaths.has(path))broken.push({from:n.id,path});
  }catch(e:any){warnings.push(n.path+': '+(e.message||'Kunde inte läsas.'));}
  progress(++done,readable.length);await pause();
 }
 if((await replicaReader.current('databas'))?.commit!==snapshot.commit)throw Error('Databasen uppdaterades under indexeringen. Försök igen.');
 // Expose media items individually while keeping the register as their original source.
 for(const [kind,path]of [['Film','Filmer/register.json'],['Serie','Serier/register.json']]){
  try{const data=await replicaReader.json('databas',path);if(!data)continue;const items=data[kind==='Film'?'films':'series'];if(!Array.isArray(items))continue;
   nodes=nodes.filter(n=>n.path!==path);for(const item of items){const key=item.imdbId||item.title+'|'+(item.startYear??item.year??'');nodes.push({id:'databas:media:'+kind+':'+key,path,paths:[],title:item.displayTitle||item.title,category:kind,kind,tags:item.genres||[],mediaView:kind==='Film'?'filmer':'serier',mediaKey:key,repoKey:'databas'});}
  }catch{warnings.push('Ett mediaregister kunde inte läsas.');}
 }
 return {nodes,references,edges:connectionEdges(nodes,[],references),broken,warnings,complete:warnings.length===0,commit:snapshot.commit,indexedAt:new Date().toISOString(),textCount:done,binaryCount:nodes.filter(n=>/\.(pdf|docx)$/i.test(n.path)).length};
}
