import React,{useEffect,useRef} from 'react';
import {Bookmark,Save,Loader2,X} from 'lucide-react';
import {useBackHandler} from '@/components/NativeBackBridge';
import MaterialIcon from '@/components/MaterialIcon';
import type {TodosController} from './use-todos';
import type {IdeasController} from '@/components/ideas/use-ideas';
export default function QuickTodoEditor({todos,ideas,onClose}:{todos:TodosController;ideas:IdeasController;onClose:()=>void}){
 const field=useRef<HTMLTextAreaElement>(null),dialog=useRef<HTMLFormElement>(null);
 const close=()=>{if(!todos.busy)onClose();};
 useBackHandler(160,()=>{close();return true;});
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,before=document.body.style.overflow;document.body.style.overflow='hidden';field.current?.focus();return()=>{document.body.style.overflow=before;if(previous?.isConnected)previous.focus();};},[]);
 const draft=todos.compose;if(!draft)return null;
 return <div className="modal-backdrop nh-idea-backdrop" onClick={close}><form ref={dialog} className="nh-idea-editor nh-task-editor" role="dialog" aria-modal="true" aria-labelledby="task-editor-title" onClick={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();void todos.saveQuick().then(saved=>{if(saved)onClose();});}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();close();}
  if(e.key==='Tab'){const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled),select:not(:disabled)')||[]),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
 <div className="modal-heading"><h2 id="task-editor-title"><MaterialIcon tone="violet" size={28}><Bookmark size={20}/></MaterialIcon>Ny uppgift</h2><button type="button" className="icon-button" aria-label="Stäng uppgiften och behåll utkast" disabled={todos.busy} onClick={close}><X/></button></div>
 <div className="nh-idea-editor-body"><label className="field" htmlFor="quick-task-text">Vad vill du göra?</label><textarea ref={field} id="quick-task-text" value={draft.text} maxLength={50000} disabled={todos.busy} placeholder="Skriv en sak att göra…" onChange={e=>todos.changeCompose({...draft,text:e.target.value})}/>
 <label className="field">Koppla till idé <span className="muted">(valfritt)</span><select aria-label="Koppla uppgift till idé" value={draft.ideaId||''} disabled={todos.busy} onChange={e=>todos.changeCompose({...draft,ideaId:e.target.value||undefined})}><option value="">Ingen koppling</option>{ideas.items.map(({idea})=><option value={idea.id} key={idea.id}>Idé {ideas.numbering.entries.find(entry=>entry.id===idea.id)?.number||'–'} · {idea.text.slice(0,70)}</option>)}{draft.ideaId&&!ideas.items.some(({idea})=>idea.id===draft.ideaId)&&<option value={draft.ideaId}>Tidigare kopplad idé</option>}</select></label>
 <p className="nh-ideas-note">Utkastet behålls på telefonen när du stänger. Spara skickar uppgiften och eventuella liständringar till GitHub.</p>{!todos.ready&&<p className="nh-ideas-note">Hämtar din att-göra-lista…</p>}{todos.error&&<p className="error-banner" role="alert">{todos.error}</p>}
 </div><div className="nh-idea-editor-actions"><button className="secondary" type="button" disabled={todos.busy} onClick={close}>Stäng</button><button className="primary" disabled={!todos.ready||todos.busy||!draft.text.trim()}>{todos.busy?<Loader2 className="spin" size={17}/>:<Save size={17}/>}Spara</button></div>
 </form></div>;
}
