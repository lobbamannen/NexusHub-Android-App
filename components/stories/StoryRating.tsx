'use client';
import React from 'react';
import {Star,X} from 'lucide-react';
import ChromaRating from '@/components/media/ChromaRating';
export function StoryRating({rating,label,compact=true}:{rating:number|null;label?:string;compact?:boolean}){
 return rating===null?<span className="nh-rating-empty">{label&&label!=='Inget registrerat betyg'?label:'Ej betygsatt'}</span>:<ChromaRating rating={rating} scale={10} compact={compact} label="Ditt betyg"/>;
}
export function StoryRatingEditor({value,onChange,disabled=false}:{value:number|null;onChange:(value:number|null)=>void;disabled?:boolean}){
 return <div className="nh-register-rating story-rating-editor" role="group" aria-label="Välj betyg, 1 till 10 poäng med fem halveringsbara stjärnor">
  <span className="nh-register-stars">{[0,1,2,3,4].map(index=>{
   const percent=Math.max(0,Math.min(100,((value??0)-index*2)/2*100));
   return <span className="nh-register-star" key={index}>
    <Star className="nh-register-star-outline" size={23} aria-hidden="true"/>
    <Star className="nh-register-star-filled" size={23} fill="currentColor" style={{clipPath:`inset(0 ${100-percent}% 0 0)`}} aria-hidden="true"/>
    {[1,2].map((half,i)=><button type="button" key={half} disabled={disabled} className={'nh-register-half nh-register-half-'+(i+1)} aria-label={'Sätt betyg '+String(index*2+half)+' av 10'} aria-pressed={value===index*2+half} onClick={()=>onChange(index*2+half)}/>)}
   </span>;
  })}</span>
  <span className="nh-register-rating-number">{value===null?'–':String(value)+'/10'}</span>
  {value!==null&&<button type="button" className="nh-register-clear" disabled={disabled} aria-label="Rensa betyg" onClick={()=>onChange(null)}><X size={15}/></button>}
 </div>;
}
