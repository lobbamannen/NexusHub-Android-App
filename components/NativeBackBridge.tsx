'use client';
import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {createBackDispatcher} from '@/lib/back-navigation.mjs';
const dispatcher=createBackDispatcher();
export function useBackHandler(priority:number,handler:()=>boolean){
 const latest=useRef(handler);
 useLayoutEffect(()=>{latest.current=handler;});
 useEffect(()=>dispatcher.register(priority,()=>latest.current()),[priority]);
}
/** Keep the exact selector used by the already installed APK, before other readers.
 * The focusable, clipped button also allows keyboard QA of the native entrypoint.
 */
export default function NativeBackBridge(){
 useEffect(()=>{
  const host=window as any,previous=host.NexusHubNavigation;
  host.NexusHubNavigation={back:()=>dispatcher.back()};
  return()=>{host.NexusHubNavigation=previous;};
 },[]);
 return <div className="reader-toolbar" aria-hidden="true" style={{position:'fixed',width:1,height:1,overflow:'hidden',clipPath:'inset(50%)',pointerEvents:'none',margin:0,padding:0}}>
  <button type="button" className="text-button" data-testid="native-back" tabIndex={-1} onClick={()=>dispatcher.back()}>Tillbaka</button>
 </div>;
}
