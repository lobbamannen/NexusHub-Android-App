import React from 'react';import{createRoot}from'react-dom/client';import '@/app/globals.css';import '@/app/module-dashboards.css';import '@/app/chroma-materials.css';import '@/app/chroma-theme.css';import '@/src/android.css';
import IncomingInbox from '@/components/personal/IncomingInbox';import NativeBackBridge from '@/components/NativeBackBridge';import MaterialDefinitions from '@/components/home/MaterialDefinitions';import {gitBlobSha} from '@/lib/github-inbox.mjs';
declare global{interface Window{__pasteTest:any}}
const state=window.__pasteTest={offline:false,failLocal:false,posts:[] as any[],cloud:new Map<string,any>()};
const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(state.failLocal&&this.name==='kv'&&String(key).startsWith('incoming:v1:'))throw new DOMException('Test: lokalt lagringsutrymme fullt','QuotaExceededError');return put.call(this,value,key!);};
const original=window.fetch.bind(window);window.fetch=async(input,init)=>{
 const path=String(input);if(!path.startsWith('/api/incoming'))return original(input,init);if(state.offline)throw Error('Test: offline');
 if(!init?.method||init.method==='GET'){const q=new URL(path,location.origin).searchParams;if(q.has('fileId')){const c=state.cloud.get(q.get('id'));const f=c.metadata.files.find((x:any)=>x.id===q.get('fileId'));return Response.json({sha:f.sha,base64:f.base64});}return Response.json({items:[...state.cloud.values()]});}
 const body=JSON.parse(String(init.body));if(init.method==='POST'){
  state.posts.push(body);await new Promise(r=>setTimeout(r,60));const files=[];for(const f of body.item.files){files.push({...f,sha:await gitBlobSha(Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)))});}
  const folder='NexusHub inkorg/'+body.item.id+'/';const c={metadata:{...body.item,files},entries:[{path:folder+'metadata.json',sha:'a'.repeat(40)},...files.map(f=>({path:folder+f.id+'-'+f.name,sha:f.sha}))],manifestSha:'a'.repeat(40),commit:'b'.repeat(40)};state.cloud.set(body.item.id,c);return Response.json({...c,saved:true});
 }return Response.json({deleted:true});
};
createRoot(document.getElementById('root')!).render(<div className="portal-shell nh-chroma-site" style={{padding:14,minHeight:'100vh'}}><NativeBackBridge/><MaterialDefinitions/><p style={{fontSize:10,color:'#777'}}>VISUELLT TEST · SYNTETISK RESEARCH</p><IncomingInbox ideas={{items:[],numbering:{entries:[]}} as any}/></div>);
