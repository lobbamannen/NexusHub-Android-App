'use client';
import React,{useId} from 'react';
import MaterialIcon from '@/components/MaterialIcon';

type Props={rating:number|null|undefined;compact?:boolean;label?:string;scale?:5|10};
const star='M12 2.15 15.05 8.32 21.87 9.31 16.93 14.12 18.1 20.93 12 17.72 5.9 20.93 7.07 14.12 2.13 9.31 8.95 8.32Z';
/** Five approved Chroma stars; film/series and stories use 1–10, shown as five half-fillable stars. */
export default function ChromaRating({rating,compact=false,label='Vårt betyg',scale=10}:Props){
 const id=useId().replace(/:/g,'');
 if(rating===null||rating===undefined||!Number.isFinite(rating))return <span className="nh-rating-empty">Inte betygsatt</span>;
 const bounded=Math.max(0,Math.min(scale,rating));
 return <span className={'nh-chroma-rating'+(compact?' compact':'')} aria-label={label+': '+rating+' av '+scale}>
  <span className="nh-rating-stars" aria-hidden="true">{[0,1,2,3,4].map(index=>{
   const fraction=Math.max(0,Math.min(1,(bounded-index*(scale/5))/(scale/5)));
   const clipId=id+'-star-'+index;
   return <MaterialIcon key={index} tone="gold" size={compact?19:29}><svg viewBox="0 0 24 24">
    <defs><clipPath id={clipId}><rect x="0" y="0" width={24*fraction} height="24"/></clipPath></defs>
    <path d={star} fill="#211608" stroke="url(#ink-gold)" strokeWidth="1.25" strokeLinejoin="round"/>
    <path d={star} fill="url(#ink-gold)" clipPath={'url(#'+clipId+')'} stroke="none"/>
   </svg></MaterialIcon>;
  })}</span>
  <span className="nh-rating-value">{rating.toLocaleString('sv-SE')} / {scale}</span>
 </span>;
}
