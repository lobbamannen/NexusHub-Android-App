'use client';
import {cancelDraftWrites} from '@/platform/draft-writes';
import React,{useEffect,useId,useRef,useState} from 'react';
import {X,Save,Loader2} from 'lucide-react';
import {useBackHandler} from '@/components/NativeBackBridge';
import {STORY_CATEGORIES} from '@/lib/story-register.mjs';
import {StoryRatingEditor} from './StoryRating';
import type {StoryChanges} from '@/app/use-story-register';
export default function StoryEditor({story,full=false,staged=false,saving,error,onSubmit,onClose,onDirtyChange}:{story:any;full?:boolean;staged?:boolean;saving:boolean;error:string;onSubmit:(patch:StoryChanges)=>Promise<boolean>;onClose:()=>void;onDirtyChange:(dirty:boolean)=>void}){
 const [title,setTitle]=useState(story.title),[category,setCategory]=useState(story.category),[rating,setRating]=useState<number|null>(story.numericRating),[review,setReview]=useState(story.review||'');
 const form=useRef<HTMLDivElement>(null),id=useId();
 const patch:StoryChanges={};
 if(full&&title.trim()!==story.title)patch.title=title.trim();
 if(full&&category!==story.category)patch.category=category;
 if(rating!==story.numericRating)patch.rating=rating;
 if(review.trim()!==(story.review||''))patch.review=review.trim();
 const dirty=Object.keys(patch).length>0;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 const close=()=>{if(saving)return;if(dirty&&!window.confirm('Kasta ändringarna i den öppna redigeringen?'))return;if(!staged)cancelDraftWrites('stories');onClose();};
 const closeRef=useRef(close);closeRef.current=close;
 useBackHandler(180,()=>{closeRef.current();return true;});
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const dialog=form.current;dialog?.querySelector<HTMLElement>('input,textarea,button')?.focus();
  const keyboard=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();closeRef.current();}
   if(e.key==='Tab'&&dialog){const nodes=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  };
  document.addEventListener('keydown',keyboard);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keyboard);previous?.focus();};
 },[]);
 return <div className="nh-register-modal-backdrop">
  <div ref={form} className="nh-register-modal story-editor-modal" role="dialog" aria-modal="true" aria-labelledby={id}>
   <header className="nh-register-modal-heading"><div><span>{full?'REDIGERA BERÄTTELSE':'DITT OMDÖME'}</span><h2 id={id}>{story.title}</h2></div><button type="button" aria-label="Stäng redigering" disabled={saving} onClick={close}><X size={20}/></button></header>
   <form onSubmit={async e=>{e.preventDefault();if(dirty&&await onSubmit(patch))onClose();}}>
    <fieldset disabled={saving} className="story-editor-fields"><div className="nh-register-form-fields">
     {full&&<><label className="nh-register-wide">Titel<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={240}/></label><label className="nh-register-wide">Kategori<select value={category} onChange={e=>setCategory(e.target.value)}>{STORY_CATEGORIES.map((c:string)=><option key={c}>{c}</option>)}</select></label></>}
     <div className="nh-register-wide"><span className="story-field-label">Ditt betyg</span><StoryRatingEditor value={rating} onChange={setRating} disabled={saving}/>{story.numericRating===null&&story.ratingLabel!=='Inget registrerat betyg'&&<small className="story-existing-rating">Tidigare: {story.ratingLabel}</small>}</div>
     <label className="nh-register-wide">Ditt omdöme<textarea value={review} maxLength={12000} rows={5} onChange={e=>setReview(e.target.value)} placeholder="Vad tyckte du om berättelsen?"/></label>
    </div></fieldset>
    <p className="nh-register-editor-note">{staged?'Lägg ändringarna i registret och spara flera berättelser tillsammans.':'Betyg och omdöme sparas i ditt berättelseregister i GitHub.'}</p>
    {error&&<p role="alert" className="nh-register-alert">{error}</p>}
    <div className="nh-register-modal-actions"><button type="button" className="secondary" disabled={saving} onClick={close}>Avbryt</button><button type="submit" className="primary" disabled={saving||!dirty||full&&!title.trim()}>{saving?<Loader2 size={16} className="spin"/>:<Save size={16}/>} {saving?'Sparar…':staged?'Lägg till ändringar':'Spara omdöme'}</button></div>
   </form>
  </div>
 </div>;
}
