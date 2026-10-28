import {replacePastedSelection,reconcilePastedEdit} from '@/lib/pasted-text.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Save} from 'lucide-react';
import {useBackHandler} from '@/components/NativeBackBridge';
import './paste-text-dialog.css';
export default function PasteTextDialog({onClose,onSave}:{onClose:()=>void;onSave:(text:string,source:string)=>Promise<void>}){
 const [text,setText]=useState(''),[source,setSource]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const saving=useRef(false),root=useRef<HTMLElement>(null),editor=useRef<HTMLTextAreaElement>(null);
 const close=()=>{if(!saving.current)onClose();};
 useBackHandler(250,()=>{close();return true;});
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';editor.current?.focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close();}
   if(event.key==='Tab'){
    const elements=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')||[]),first=elements[0],last=elements.at(-1);
    if(!first)return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus({preventScroll:true});};
 },[]);
 const save=async()=>{
  if(saving.current||!text.trim())return;saving.current=true;setBusy(true);setError('');
  try{await onSave(text,source);}catch(e:any){setError(e.message||'Texten kunde inte sparas lokalt.');}finally{saving.current=false;setBusy(false);}
 };
 return createPortal(<div className="nh-paste-overlay portal-shell nh-chroma-site"><section ref={root} className="nh-paste-dialog" role="dialog" aria-modal="true" aria-labelledby="nh-paste-title" aria-describedby="nh-paste-description" aria-busy={busy}>
 <header><div><span>NEXUSHUB INKORG</span><h2 id="nh-paste-title">Klistra in text</h2></div><button className="nh-paste-close" type="button" aria-label="Avbryt och stäng" disabled={busy} onClick={close}><X size={24}/></button></header>
 <div className="nh-paste-body"><p id="nh-paste-description">Klistra in hela svaret och granska eller redigera innan du sparar. Markdown, Mermaid, kod och länkar bevaras.</p>
 {error&&<p className="error-banner" role="alert">{error} Texten är kvar här.</p>}
 <label>Källa / AI <span>(frivilligt)</span><input value={source} maxLength={120} disabled={busy} placeholder="Till exempel DeepSeek" onChange={e=>setSource(e.target.value)}/></label>
 <label className="nh-paste-text-label">Text<textarea ref={editor} value={text} disabled={busy} spellCheck={false} placeholder="Klistra in hela svaret här…" onChange={e=>{const value=e.target.value;setText(old=>reconcilePastedEdit(old,value));}} onPaste={e=>{if(!e.clipboardData.types.includes('text/plain'))return;e.preventDefault();const pasted=e.clipboardData.getData('text/plain'),start=e.currentTarget.selectionStart,end=e.currentTarget.selectionEnd;setText(old=>replacePastedSelection(old,start,end,pasted));requestAnimationFrame(()=>editor.current?.setSelectionRange(start+pasted.replace(/\r\n?/g,'\n').length,start+pasted.replace(/\r\n?/g,'\n').length));}}/></label>
 </div><footer><p role="status">{busy?'Sparar på telefonen och försöker skicka till GitHub…':text.length.toLocaleString('sv-SE')+' tecken · sparas som Markdown (.md)'}</p><button className="primary" type="button" disabled={busy||!text.trim()} onClick={()=>void save()}><Save size={19}/>{busy?'Sparar…':'Spara'}</button></footer>
 </section></div>,document.body);
}
