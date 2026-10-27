import './todo-list.css';
import React,{useEffect,useRef,useState} from 'react';
import {CheckSquare,Plus,Save,Trash2,RefreshCw} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import type {TodosController} from './use-todos';
function TaskText({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(text:string)=>void}){
 const field=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const fit=()=>{if(field.current){field.current.style.height='auto';field.current.style.height=Math.max(46,field.current.scrollHeight+2)+'px';}};fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);},[value]);
 return <textarea ref={field} rows={1} aria-label="Uppgift" value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/>;
}
export default function TodoList({todos,onOpenIdea}:{todos:TodosController;onOpenIdea:(id:string)=>void}){
 const {snapshot,dirty,ready,busy,error,notice,edit,save,undo}=todos;
 const [text,setText]=useState('');
 return <section className="nh-module-dashboard nh-todos"><header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="violet" size={48}><CheckSquare size={29}/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · ATT GÖRA</span><h1>Att göra</h1><p>En enkel lista. Ändringar sparas lokalt tills du väljer Spara.</p></div></div></header>{error&&<div className="error-banner"><span>{error}</span>{!dirty&&<button type="button" className="secondary" onClick={()=>void todos.reload()}><RefreshCw size={16}/>Försök igen</button>}</div>}{notice&&<p role="status">{notice}</p>}
 <form className="nh-ideas-actions" onSubmit={e=>{e.preventDefault();if(text.trim()){edit([...snapshot.data.items,{id:crypto.randomUUID(),text:text.trim(),done:false}]);setText('');}}}><input aria-label="Ny uppgift" value={text} disabled={!ready||busy} onChange={e=>setText(e.target.value)} placeholder="Vad vill du göra?"/><button className="primary" disabled={!ready||busy||!text.trim()}><Plus size={17}/>Lägg till</button></form>
 {snapshot.data.items.map(item=><div className="entry-row nh-todo-row" key={item.id}><label className="nh-todo-check"><input type="checkbox" aria-label={'Klarmarkera '+item.text} checked={item.done} disabled={busy} onChange={e=>edit(snapshot.data.items.map(x=>x.id===item.id?{...x,done:e.target.checked}:x))}/></label><div className="nh-todo-content"><TaskText value={item.text} disabled={busy} onChange={text=>edit(snapshot.data.items.map(x=>x.id===item.id?{...x,text}:x))}/>{item.ideaId&&<button className="text-button nh-todo-idea-link" type="button" onClick={()=>onOpenIdea(item.ideaId!)}>Visa kopplad idé</button>}</div><button className="icon-button" aria-label="Ta bort uppgift" disabled={busy} onClick={()=>edit(snapshot.data.items.filter(x=>x.id!==item.id))}><Trash2 size={17}/></button></div>)}
 <p className="nh-ideas-note" role="status">{dirty?'Utkast lokalt – inte bekräftat i GitHub':snapshot.sha?'Sparad lista från GitHub':'Ingen sparad lista ännu'}</p><div className="nh-ideas-actions"><button className="primary" disabled={busy||!dirty||snapshot.data.items.some(i=>!i.text.trim())} onClick={()=>void save()}><Save size={17}/>Spara</button><button className="secondary" disabled={busy||!dirty} onClick={()=>void undo()}>Ångra utkast</button></div></section>;
}
