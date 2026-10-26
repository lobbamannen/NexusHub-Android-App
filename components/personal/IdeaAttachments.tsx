import React,{useEffect,useImperativeHandle,useRef,useState,forwardRef} from 'react';
import {Paperclip,FileText} from 'lucide-react';
import {LocalImage} from '@/platform/resources';
import {saveIncoming,deliverIncoming,incomingItems,type Incoming} from '@/platform/incoming-store';
export type AttachmentState={count:number;busy:boolean};
export type AttachmentActions={save:()=>Promise<boolean>};
const waiting=(item:Incoming,id:string)=>item.destinations?.includes('idea:'+id)&&item.files.some(file=>!item.sent['idea:'+id+':'+file.id]);
const IdeaAttachments=forwardRef<AttachmentActions,{id:string;saved:boolean;busy:boolean;onStateChange:(state:AttachmentState)=>void}>(function IdeaAttachments({id,saved,busy,onStateChange},ref){
 const [files,setFiles]=useState<any[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[working,setWorking]=useState(false),[pending,setPending]=useState<Incoming[]>([]),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;void(async()=>{try{const items=await incomingItems();if(active)setPending(items.filter(item=>waiting(item,id)));if(!saved)return;const response=await fetch('/api/idea-files?id='+encodeURIComponent(id)),data=await response.json();if(!response.ok)throw Error(data.error);if(active)setFiles(data.files);}catch(e:any){if(active)setError(e.message);}})();const update=()=>setRevision(v=>v+1);window.addEventListener('nexus-incoming-changed',update);return()=>{active=false;window.removeEventListener('nexus-incoming-changed',update);};},[id,saved,revision]);
 const inputRef=useRef<HTMLInputElement>(null),lock=useRef(false);
 const count=pending.reduce((n,item)=>n+item.files.filter(file=>!item.sent['idea:'+id+':'+file.id]).length,0);
 useEffect(()=>onStateChange({count,busy:working}),[count,working,onStateChange]);
 useImperativeHandle(ref,()=>({save:async()=>{
  if(lock.current||!saved)return false;
  lock.current=true;setWorking(true);setError('');setNotice('');
  try{
   const items=(await incomingItems()).filter(item=>waiting(item,id));
   for(const item of items)await deliverIncoming(item,['idea:'+id]);
   setPending([]);setNotice('Bilagorna är verifierade och sparade i GitHub.');setRevision(v=>v+1);return true;
  }catch(e:any){setError(e.message+' Originalen finns kvar på telefonen. Tryck Spara för att försöka igen.');setRevision(v=>v+1);return false;}
  finally{lock.current=false;setWorking(false);}
 }}),[id,saved]);
 return <section className="nh-idea-attachments" aria-label="Idéns bilagor">
  <div className="nh-idea-attachments-bar"><h3>Bilagor</h3><button type="button" className="primary" aria-label="Bifoga bilder eller dokument" disabled={!saved||busy||working} onClick={()=>inputRef.current?.click()}><Paperclip size={17}/>{working?'Sparar…':'Bifoga filer'}</button></div>
  <input ref={inputRef} type="file" multiple hidden disabled={!saved||busy||working} onChange={async e=>{const chosen=Array.from(e.target.files||[]);e.target.value='';if(!chosen.length||lock.current)return;lock.current=true;setWorking(true);setError('');setNotice('');try{const item=await saveIncoming(chosen,'',['idea:'+id]);setPending(current=>[...current.filter(row=>row.id!==item.id),item]);setNotice('Bilagorna finns lokalt. Tryck Spara för att skicka till GitHub.');}catch(e:any){setError('Kunde inte spara bilagorna lokalt. '+e.message);}finally{lock.current=false;setWorking(false);}}}/>
  <div className="nh-idea-attachments-content">{(!saved||notice||error||count>0)&&<div className="nh-idea-attachments-feedback">{!saved&&<p className="small muted">Spara idén i GitHub först för att koppla bilagor till den.</p>}{notice&&<p className="small" role="status">{notice}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}{count>0&&<><p className="nh-ideas-note">{count} {count===1?'bilaga väntar':'bilagor väntar'} på Spara.</p>{pending.flatMap(item=>item.files.filter(file=>!item.sent['idea:'+id+':'+file.id]).map(file=><p className="small break" key={item.id+file.id}>{file.name}</p>))}</>}</div>}
  {!!files.length&&<details><summary>Visa bilagor ({files.length})</summary><div className="nh-idea-attachments-files">{files.map(file=><div key={file.path}>{/\.(png|jpe?g|webp|gif)$/i.test(file.name)&&<LocalImage alt={file.name} style={{maxWidth:'100%',maxHeight:180,objectFit:'contain',borderRadius:12}} src={'/api/portal/original?inline=1&repo=databas&path='+encodeURIComponent(file.path)+'&blob='+file.sha+'&ref='+file.commit}/>}<a className="entry-row" download={file.name} href={'/api/portal/original?repo=databas&path='+encodeURIComponent(file.path)+'&blob='+file.sha+'&ref='+file.commit}><FileText size={17}/><span className="entry-text break">{file.name}</span></a></div>)}</div></details>}
  </div>
 </section>;
});
export default IdeaAttachments;
