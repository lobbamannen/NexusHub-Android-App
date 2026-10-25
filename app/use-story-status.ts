'use client';
import {useCallback,useEffect,useRef,useState} from 'react';

type Mark={saved:boolean,read:boolean,updatedAt:string};
type Register={schemaVersion:number,entries:Record<string,Mark>};
type StatusResponse={register:Register,error?:string,saved?:boolean,source?:string,sha?:string,commit?:string};
type Field='saved'|'read';
const endpoint='/api/story-status';
const readLegacy=(key:string)=>{try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter((v:any)=>typeof v==='string'&&/^Berattelser\/[^/]+\/[^/]+\.md$/.test(v)):[] as string[];}catch{return [] as string[];}};
async function request(path:string,options?:RequestInit){
 const response=await fetch(path,{...options,cache:'no-store'});
 const payload=await response.json() as StatusResponse;
 if(!response.ok||payload.error)throw Error(payload.error||'GitHub kunde inte nås.');
 return payload;
}
export function useStoryStatus(){
 const [entries,setEntries]=useState<Record<string,Mark>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const saving=useRef(false),mounted=useRef(true),sha=useRef<string|null>(null);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const source=await request(endpoint);
   let register:Register=source.register;
   sha.current=source.sha||null;
   // One-way, additive migration. Legacy flags must not overwrite GitHub's newer states.
   const saved=readLegacy('nexus-stories-favorites'),read=readLegacy('nexus-stories-read');
   if(saved.length||read.length){
    const paths=[...new Set([...saved,...read])].map(path=>({path,saved:saved.includes(path),read:read.includes(path)}));
    const migrated=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'migrate',paths})});
    register=migrated.register;
    sha.current=migrated.sha||null;
    try{localStorage.removeItem('nexus-stories-favorites');localStorage.removeItem('nexus-stories-read');}catch{/* GitHub already confirmed the migrated state. */}
   }
   if(mounted.current)setEntries(register.entries||{});
  }catch(e:any){if(mounted.current)setError(e.message||'GitHub-lässtatus kunde inte hämtas.');}
  finally{if(mounted.current)setLoading(false);}
 },[]);
 useEffect(()=>{mounted.current=true;void reload();return()=>{mounted.current=false;};},[reload]);
 const mark=useCallback(async(path:string,field:Field)=>{
  if(saving.current||loading||error)return;
  saving.current=true;setBusy(path);setError('');
  try{
   const value=!(entries[path]?.[field]??false);
   const result=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'set',path,field,value})});
   sha.current=result.sha||null;
   if(mounted.current)setEntries(result.register.entries||{});
  }catch(e:any){if(mounted.current)setError('Markeringen sparades inte i GitHub: '+(e.message||'okänt fel')+'. Ladda om status och försök igen.');}
  finally{saving.current=false;if(mounted.current)setBusy('');}
 },[entries,loading,error]);
 const saveReadEdits=async(edits:Record<string,boolean>)=>{
  if(saving.current||loading||error||!sha.current)return false;
  saving.current=true;setBusy('batch');setError('');
  try{
   const result=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'batch',expectedSha:sha.current,edits:Object.entries(edits).map(([path,value])=>({path,value}))})});
   if(!result.saved||!result.sha||!result.commit)throw Error('GitHub bekräftade inte sparningen.');
   sha.current=result.sha;
   if(mounted.current)setEntries(result.register.entries||{});
   return true;
  }catch(e:any){if(mounted.current)setError(e.message||'Läsmarkeringarna kunde inte sparas. Utkasten finns kvar.');return false;}
  finally{saving.current=false;if(mounted.current)setBusy('');}
 };
 return {entries,loading,busy,error,reload,mark,saveReadEdits,savedPaths:Object.keys(entries).filter(path=>entries[path]?.saved),readPaths:Object.keys(entries).filter(path=>entries[path]?.read)};
}
