'use client';
import React,{useEffect,useRef,useState} from 'react';
import {X,ZoomIn,ZoomOut} from 'lucide-react';
import {useBackHandler} from '@/components/NativeBackBridge';
import './studio-signature.css';
const image='/two-thumbs-incorporated.jpg';
const description='Two Thumbs Incorporated™. Founded by One Man. Driven by Two Thumbs. Powered by AI.';
export default function StudioSignature(){
 const [open,setOpen]=useState(false),[zoom,setZoom]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),scroll=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const close=()=>{dialog.current?.close();setOpen(false);setZoom(false);trigger.current?.focus();};
 useBackHandler(190,()=>{if(!dialog.current?.open)return false;close();return true;});
 useEffect(()=>{const node=dialog.current;if(open&&!node?.open)node?.showModal();else if(!open&&node?.open)node.close();},[open]);
 useEffect(()=>{if(zoom&&scroll.current)scroll.current.scrollLeft=(scroll.current.scrollWidth-scroll.current.clientWidth)/2;},[zoom]);
 return <footer className="nh-studio-signature" aria-label="Two Thumbs Incorporated">
  <button type="button" ref={trigger} className="nh-studio-trigger" onClick={()=>setOpen(true)} aria-label="Visa Two Thumbs Incorporated större"><img src={image} alt={description} width={1536} height={560} loading="lazy" decoding="async"/></button>
  <dialog ref={dialog} className="nh-studio-dialog" aria-label="Two Thumbs Incorporated – originalbild" onCancel={()=>{setOpen(false);setZoom(false);}} onClose={()=>{setOpen(false);setZoom(false);}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
   <div className="nh-studio-dialog-body">
    <div className="nh-studio-toolbar"><button type="button" className="secondary" aria-pressed={zoom} onClick={()=>setZoom(v=>!v)}>{zoom?<ZoomOut size={18}/>:<ZoomIn size={18}/>} {zoom?'Anpassa':'Förstora'}</button><button type="button" className="icon-button" aria-label="Stäng bilden" onClick={close}><X size={22}/></button></div>
    <div ref={scroll} className={'nh-studio-scroll'+(zoom?' is-zoomed':'')} tabIndex={0} aria-label="Originalbild, rulla för att läsa hela bilden när den är förstorad"><img src={image} alt={description} width={1536} height={560}/></div>
   </div>
  </dialog>
 </footer>;
}
