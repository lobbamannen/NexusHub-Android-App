import {useCallback,useEffect,useRef,useState} from 'react';
import {buildConnectionIndex} from '@/platform/connection-index';
import {connectionEdges} from '@/lib/connections.mjs';
import {replicaReader} from '@/platform/mirror-access';
export type ConnectionModel=ReturnType<typeof useConnections>;
export function useConnections(documents:any[],enabled:boolean,revision?:string){
 const [index,setIndex]=useState<any>(null),[progress,setProgress]=useState({done:0,total:0}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[register,setRegister]=useState<any>(null),[saving,setSaving]=useState(false),[writeError,setWriteError]=useState(''),[saved,setSaved]=useState(''),[retry,setRetry]=useState(0);const sequence=useRef(0),writeLock=useRef(false);
 useEffect(()=>{if(!enabled)return;const abort=new AbortController(),run=++sequence.current;setLoading(true);setError('');
 void buildConnectionIndex(documents,abort.signal,(done,total)=>{if(!abort.signal.aborted)setProgress({done,total});}).then(value=>{if(!abort.signal.aborted&&sequence.current===run)setIndex(value);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
 return()=>{abort.abort();};},[enabled,revision,retry]);
 const reloadRegister=useCallback(async()=>{try{const r=await fetch('/api/connections'),data=await r.json();if(!r.ok)throw Error(data.error);setRegister({...data,writable:true});setWriteError('');}catch(e:any){try{const snapshot=await replicaReader.current('databas');if(snapshot){const data=await replicaReader.json('databas','System/NexusHub/connections.json');if(data)setRegister({data,writable:false});}}catch{}setWriteError(e.message||'Sparade kopplingar kunde inte läsas.');}},[]);
 useEffect(()=>{if(enabled)void reloadRegister();},[enabled,retry]);
 useEffect(()=>{const refresh=()=>{if(enabled)setRetry(n=>n+1);};window.addEventListener('nexus-github-changed',refresh);window.addEventListener('nexus-refresh-module',refresh);return()=>{window.removeEventListener('nexus-github-changed',refresh);window.removeEventListener('nexus-refresh-module',refresh);};},[enabled]);
 const save=async(change:any)=>{if(writeLock.current||!register?.writable)return false;writeLock.current=true;setSaving(true);setWriteError('');setSaved('');try{const r=await fetch('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({change,expectedSha:register.sha})}),data=await r.json();if(!r.ok)throw Error(data.error);setRegister({...data,writable:true});setSaved('Kopplingen är sparad i GitHub.');return true;}catch(e:any){setWriteError(e.message||'Kunde inte spara.');return false;}finally{writeLock.current=false;setSaving(false);}};
 const edges=index?connectionEdges(index.nodes,register?.data?.relations||[],index.references):[];
 return {index,edges,progress,loading,error,writeError,saved,saving,writable:!!register?.writable,save,reload:()=>setRetry(n=>n+1),reloadRegister};
}
