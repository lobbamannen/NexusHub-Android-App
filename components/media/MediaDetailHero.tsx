import React from 'react';
import ChromaRating from './ChromaRating';
import {formatRuntime} from '@/lib/media-runtime.mjs';
type Props={poster:React.ReactNode;title:string;year:number|null;genres:string[];runtimeMinutes?:number|null;status:React.ReactNode;favorite?:React.ReactNode;rating:number|null;children?:React.ReactNode};
export default function MediaDetailHero({poster,title,year,genres,runtimeMinutes,status,favorite,rating,children}:Props){
 return <div className="nh-detail-hero">
  <div className="nh-detail-artwork">{poster}</div>
  <div className="nh-detail-copy">
   <div className="nh-detail-flags">{status}{favorite}</div>
   <h2>{title}</h2>
   <p className="nh-detail-facts">{[year??null,runtimeMinutes?formatRuntime(runtimeMinutes):null,...genres.slice(0,3)].filter(v=>v!==null&&v!==undefined&&v!=='').join(' · ')}</p>
   <div className="nh-detail-rating"><span className="nh-detail-caption">VÅRT BETYG</span><ChromaRating rating={rating}/></div>
   <div className="nh-detail-links">{children}</div>
  </div>
 </div>;
}
