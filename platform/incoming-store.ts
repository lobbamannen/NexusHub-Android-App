import {durableGet,durableSet,durableEntries,durableDelete} from './local-store';
import {base64} from '@/lib/github-inbox.mjs';
export type IncomingFile={id:string;name:string;mime:string;blob?:Blob;error?:string};
export type Incoming={id:string;text:string;createdAt:string;files:IncomingFile[];native?:boolean;destinations?:string[];sent:Record<string,{path:string;sha:string;commit?:string;processed?:boolean}>;error?:string};
const bridge=()=>window.Android as any;
export async function incomingItems():Promise<Incoming[]>{
 const saved=new Map((await durableEntries<Incoming>('incoming:v1:')).map(([,item])=>[item.id,item]));
 const native=JSON.parse(bridge()?.listIncoming?.()||'[]');
 for(const item of native)if(!saved.has(item.id))saved.set(item.id,{...item,native:true,sent:{}});
 return [...saved.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function saveIncoming(files:File[],text='',destinations?:string[]):Promise<Incoming>{
 const item:Incoming={id:crypto.randomUUID(),text,createdAt:new Date().toISOString(),files:files.map(file=>({id:crypto.randomUUID(),name:file.name,mime:file.type||'application/octet-stream',blob:file})),sent:{},...(destinations?{destinations:[...new Set(destinations)]}:{})};
 await durableSet('incoming:v1:'+item.id,item);window.dispatchEvent(new Event('nexus-incoming-changed'));return item;
}
export async function saveIncomingItem(item:Incoming){await durableSet('incoming:v1:'+item.id,item);window.dispatchEvent(new Event('nexus-incoming-changed'));}
const active=new Set<string>();
export async function deliverIncoming(item:Incoming,targets:string[]){
 if(active.has(item.id))throw Error('Överföringen pågår redan.');active.add(item.id);
 try{
  item.destinations=[...new Set([...(item.destinations||[]),...targets])];await saveIncomingItem(item);
  const files=[...item.files];
  // Stable pseudo-file ID makes retries of shared text create-only and duplicate-safe.
  if(item.text.trim())files.unshift({id:item.id,name:'delad-text.txt',mime:'text/plain',blob:new Blob([item.text],{type:'text/plain'})});
  for(const target of targets)for(const file of files){
   const key=target+':'+file.id;if(item.sent[key])continue;if(file.error)throw Error(file.error);
   let encoded:string;
   if(file.blob)encoded=base64(new Uint8Array(await file.blob.arrayBuffer()));
   else{encoded=bridge()?.readIncomingFile?.(item.id,file.id);if(!encoded)throw Error('Den lokala filen kunde inte läsas.');}
   const response=await fetch('/api/incoming',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receiptId:item.id,fileId:file.id,name:file.name,base64:encoded,target:target==='inbox'?'inbox':'idea',ideaId:target.startsWith('idea:')?target.slice(5):undefined})});
   const result=await response.json();if(!response.ok||!result.saved)throw Error(result.error||'GitHub bekräftade inte filen.');
   item.sent[key]={path:result.path,sha:result.sha,...(result.commit?{commit:result.commit}:{}),...(result.processed?{processed:true}:{})};await saveIncomingItem(item);
  }
  item.error='';await saveIncomingItem(item);
 }catch(error:any){item.error=error.message;await saveIncomingItem(item);throw error;}finally{active.delete(item.id);}
}
export function incomingComplete(item:Incoming){const ids=[...item.files.map(f=>f.id),...(item.text.trim()?[item.id]:[])];return !!item.destinations?.length&&ids.length>0&&item.destinations.every(t=>ids.every(id=>!!item.sent[t+':'+id]));}
export async function removeIncoming(item:Incoming){if(!incomingComplete(item))throw Error('Alla valda destinationer måste vara verifierade innan originalet tas bort.');if(item.native&&bridge()?.removeIncoming?.(item.id)!==true)throw Error('Originalet kunde inte tas bort.');await durableDelete('incoming:v1:'+item.id);window.dispatchEvent(new Event('nexus-incoming-changed'));}
