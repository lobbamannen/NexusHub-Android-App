'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
export type StoryChanges={title?:string;category?:string;rating?:number|null;review?:string;favorite?:boolean};
export type StoryRegisterData={sha:string|null;register:{schemaVersion:number;entries:Record<string,StoryChanges & {previousPaths?:string[]}>}};
async function request(options?:RequestInit){
 const response=await fetch('/api/story-register',{...options,cache:'no-store'}),data:any=await response.json();
 if(!response.ok||data.error||!data.register)throw Error(data.error||'Berättelseregistret kunde inte läsas.');
 return data;
}
export function useStoryRegister(){
 const [data,setData]=useState<StoryRegisterData|null>(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const busy=useRef(false),live=useRef(true);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');setMessage('');
  try{const next=await request();if(live.current)setData(next);return true;}
  catch(e:any){if(live.current)setError(e.message);return false;}
  finally{if(live.current)setLoading(false);}
 },[]);
 useEffect(()=>{live.current=true;void reload();return()=>{live.current=false;};},[reload]);
 const save=async(edits:Record<string,StoryChanges>)=>{
  if(busy.current||!data)return false;
  busy.current=true;setSaving(true);setError('');setMessage('');
  try{
   const next=await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedSha:data.sha,edits:Object.entries(edits).map(([path,changes])=>({path,changes}))})});
   if(!next.saved)throw Error('GitHub bekräftade inte sparningen.');
   if(live.current){setData(next);setMessage('Sparat i GitHub.');}
   return true;
  }catch(e:any){if(live.current)setError(e.message);return false;}
  finally{busy.current=false;if(live.current)setSaving(false);}
 };
 return {data,loading,saving,error,message,reload,save,clearMessage:()=>setMessage('')};
}
