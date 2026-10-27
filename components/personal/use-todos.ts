import {useCallback,useEffect,useRef,useState} from 'react';
import {durableGet,durableSet,durableDelete} from '@/platform/local-store';
import {upsertQuickTask} from '@/lib/personal-capture.mjs';
export type TodoItem={id:string;text:string;done:boolean;ideaId?:string};
type Snapshot={sha:string|null;data:{schemaVersion:number;items:TodoItem[]}};
export type TaskDraft={id:string;text:string;ideaId?:string};
const KEY='todos:draft:v1',COMPOSE='todos:compose:v1';
export function useTodos(){
 const [snapshot,setSnapshot]=useState<Snapshot>({sha:null,data:{schemaVersion:1,items:[]}}),[dirty,setDirty]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[compose,setCompose]=useState<TaskDraft|null>(null);
 const current=useRef(snapshot),dirtyRef=useRef(false),busyRef=useRef(false),writes=useRef(Promise.resolve()),composeWrites=useRef(Promise.resolve()),generation=useRef(0);
 const assign=useCallback((next:Snapshot,isDirty:boolean)=>{current.current=next;dirtyRef.current=isDirty;setSnapshot(next);setDirty(isDirty);},[]);
 const reload=useCallback(async()=>{
  if(dirtyRef.current||busyRef.current)return;
  const own=++generation.current;
  try{const r=await fetch('/api/todos',{cache:'reload'}),d=await r.json();if(!r.ok)throw Error(d.error||'Listan kunde inte hämtas.');if(own===generation.current&&!dirtyRef.current&&!busyRef.current){assign(d,false);setReady(true);setError('');}}
  catch(e:any){if(own===generation.current)setError(e.message);}
 },[assign]);
 useEffect(()=>{let active=true;void(async()=>{
  try{const [draft,savedCompose]=await Promise.all([durableGet<Snapshot>(KEY),durableGet<TaskDraft>(COMPOSE)]);if(!active)return;if(draft){assign(draft,true);setReady(true);}if(savedCompose)setCompose(savedCompose);if(!draft)await reload();}
  catch(e:any){if(active)setError('Lokala utkast kunde inte öppnas: '+e.message);}
 })();const refresh=(event:Event)=>{if((event as CustomEvent).detail?.view==='attgora')void reload();};const changed=()=>void reload();window.addEventListener('nexus-refresh-module',refresh);window.addEventListener('nexus-github-changed',changed);return()=>{active=false;generation.current++;window.removeEventListener('nexus-refresh-module',refresh);window.removeEventListener('nexus-github-changed',changed);};},[assign,reload]);
 const edit=(items:TodoItem[])=>{
  if(busyRef.current)return;
  generation.current++;const next={...current.current,data:{...current.current.data,items}};assign(next,true);setNotice('');
  writes.current=writes.current.catch(()=>{}).then(()=>durableSet(KEY,next));void writes.current.catch(e=>setError('Utkastet kunde inte sparas lokalt: '+e.message));
 };
 const saveSnapshot=async(next:Snapshot)=>{
  try{await writes.current;const r=await fetch('/api/todos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:next.data,expectedSha:next.sha})}),d=await r.json();if(!r.ok||!d.saved)throw Error(d.error||'Sparningen kunde inte bekräftas.');await durableDelete(KEY);assign({sha:d.sha,data:d.data},false);setNotice('Sparat och verifierat i GitHub.');return true;}
  catch(e:any){setError(e.message+' Utkastet finns kvar på telefonen.');return false;}
 };
 const save=async()=>{
  if(busyRef.current)return false;
  busyRef.current=true;setBusy(true);generation.current++;setError('');
  try{return await saveSnapshot(current.current);}finally{busyRef.current=false;setBusy(false);}
 };
 const changeCompose=(next:TaskDraft)=>{if(busyRef.current)return;setCompose(next);composeWrites.current=composeWrites.current.catch(()=>{}).then(()=>durableSet(COMPOSE,next));void composeWrites.current.catch(e=>setError('Uppgiften kunde inte sparas lokalt: '+e.message));};
 const begin=()=>{if(busyRef.current)return;setNotice('');if(!compose)changeCompose({id:crypto.randomUUID(),text:''});};
 const saveQuick=async()=>{
  if(!compose||busyRef.current||!ready)return false;
  busyRef.current=true;setBusy(true);generation.current++;setError('');setNotice('');
  try{
   const next={...current.current,data:upsertQuickTask(current.current.data,compose)};
   assign(next,true);
   writes.current=writes.current.catch(()=>{}).then(()=>durableSet(KEY,next));
   await composeWrites.current;
   if(!await saveSnapshot(next))return false;
   await durableDelete(COMPOSE);setCompose(null);return true;
  }catch(e:any){setError(e.message);return false;}
  finally{busyRef.current=false;setBusy(false);}
 };
 const undo=async()=>{
  if(busyRef.current||!confirm('Kasta det lokala utkastet och hämta GitHub-versionen?'))return;
  busyRef.current=true;setBusy(true);generation.current++;
  try{const r=await fetch('/api/todos',{cache:'reload'}),d=await r.json();if(!r.ok||r.headers.get('X-Nexus-Offline'))throw Error('Aktuell GitHub-version kunde inte hämtas.');await writes.current;await durableDelete(KEY);assign(d,false);setError('');setNotice('');}
  catch(e:any){setError(e.message);}finally{busyRef.current=false;setBusy(false);}
 };
 return {snapshot,dirty,ready,busy,error,notice,compose,edit,save,undo,reload,begin,changeCompose,saveQuick,dismissNotice:()=>setNotice('')};
}
export type TodosController=ReturnType<typeof useTodos>;
