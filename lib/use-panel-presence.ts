import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
/** Retain a closing panel just long enough for its reverse animation. */
export function usePanelPresence(initial=false):[boolean,Dispatch<SetStateAction<boolean>>,boolean]{
 const [visible,setVisible]=useState(initial),[closing,setClosing]=useState(false);const desired=useRef(initial),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const change:Dispatch<SetStateAction<boolean>>=value=>{
  const next=typeof value==='function'?value(desired.current):value;desired.current=next;clearTimeout(timer.current);
  if(next){setClosing(false);setVisible(true);return;}
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.visibilityState!=='visible'){setClosing(false);setVisible(false);return;}
  setClosing(true);timer.current=setTimeout(()=>{setVisible(false);setClosing(false);},160);
 };
 return [visible,change,closing];
}
