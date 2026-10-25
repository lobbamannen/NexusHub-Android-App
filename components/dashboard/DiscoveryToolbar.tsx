'use client';
import React from 'react';
import {ArrowRight,ChevronUp,Search,X} from 'lucide-react';
type Props={
 query:string;onQuery:(value:string)=>void;placeholder:string;
 browsing:boolean;onShowAll:()=>void;onClose:()=>void;showAllLabel:string;
 secondary?:React.ReactNode;children?:React.ReactNode
};
export default function DiscoveryToolbar({query,onQuery,placeholder,browsing,onShowAll,onClose,showAllLabel,secondary,children}:Props){
 return <section className="nh-discovery" aria-label="Sök och bläddra i biblioteket">
  <div className="nh-discovery-main">
   <label className="nh-discovery-search"><Search size={19} aria-hidden="true"/><input type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder}/>{query&&<button type="button" onClick={()=>onQuery('')} aria-label="Rensa sökning"><X size={16}/></button>}</label>
   {browsing?<button type="button" className="nh-discovery-main-action" onClick={onClose}><ChevronUp size={17}/>Till översikten</button>:<button type="button" className="nh-discovery-main-action" onClick={onShowAll}>{showAllLabel}<ArrowRight size={17}/></button>}
  </div>
  {(secondary||children)&&<div className="nh-discovery-bottom">{secondary}{children}</div>}
 </section>;
}
