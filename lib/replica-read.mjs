import {gitBlobSha} from './github-inbox.mjs';

const validSha=/^[a-f0-9]{40}$/;
const safePath=path=>typeof path==='string'&&path.length>0&&path.length<1000&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(part=>!part||part==='.'||part==='..');

/** Read only the exact current, hash-verified original from the durable replica. */
const noopCorrupt=async(_repo,_path,_sha)=>{};
export function createReplicaReader({manifest,record,binary,onCorrupt=noopCorrupt}){
 const current=async repo=>{
  if(!['databas','plugins'].includes(repo))return null;
  const snapshot=await manifest(repo);
  if(!snapshot||snapshot.truncated||!validSha.test(snapshot.commit||'')||!Array.isArray(snapshot.files))return null;
  return {...snapshot,files:snapshot.files.map(row=>({...row}))};
 };
 const file=async(repo,path,pinned=null)=>{
  if(!safePath(path))return null;
  const snapshot=pinned||await current(repo);
  if(!snapshot||!validSha.test(snapshot.commit||''))return null;
  const entry=snapshot.files.find(row=>row.path===path&&(!row.type||row.type==='blob'));
  if(!entry||!validSha.test(entry.sha||'')||!Number.isSafeInteger(entry.size)||entry.size<0)return null;
  const row=await record(repo,path,entry.sha);
  if(!row||row.blob_sha!==entry.sha||typeof row.object_key!=='string'){await onCorrupt(repo,path,entry.sha);return null;}
  const source=await binary(row.object_key);
  if(!source){await onCorrupt(repo,path,entry.sha);return null;}
  const bytes=new Uint8Array(source);
  if(bytes.byteLength!==entry.size||await gitBlobSha(bytes)!==entry.sha){await onCorrupt(repo,path,entry.sha);return null;}
  return {repo,path,sha:entry.sha,commit:snapshot.commit,size:entry.size,bytes};
 };
 const json=async(repo,path,pinned=null)=>{
  const entry=await file(repo,path,pinned);
  if(!entry)return null;
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(entry.bytes));
 };
 const text=async(repo,path,pinned=null)=>{
  const entry=await file(repo,path,pinned);
  return entry?new TextDecoder('utf-8',{fatal:true}).decode(entry.bytes):null;
 };
 return {current,file,json,text};
}
