import React,{useEffect,useRef,useState} from 'react';
import './pulse-motion.css';
export default function WelcomeFrame({children}:{children:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null);const [size,setSize]=useState({w:320,h:80}),[visible,setVisible]=useState(false),[foreground,setForeground]=useState(true);
 const id=React.useId().replace(/:/g,'');
 useEffect(()=>{const node=ref.current;if(!node)return;
  const resize=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;setSize({w:width,h:height});});resize.observe(node);
  const observe=new IntersectionObserver(entries=>setVisible(entries[0].isIntersecting));observe.observe(node);
  const visibility=()=>setForeground(document.visibilityState==='visible');visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{resize.disconnect();observe.disconnect();document.removeEventListener('visibilitychange',visibility);};
 },[]);
 return <div ref={ref} className="nh-welcome-frame" data-running={visible&&foreground}><svg className="nh-welcome-light" aria-hidden="true" width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none"><defs><linearGradient id={id}><stop stopColor="var(--nh-blue)"/><stop offset="1" stopColor="var(--nh-accent)"/></linearGradient></defs><rect className="nh-welcome-base" x="1" y="1" width={Math.max(0,size.w-2)} height={Math.max(0,size.h-2)} rx="17"/><rect className="nh-welcome-trace nh-welcome-trace-tail" pathLength="100" x="1" y="1" width={Math.max(0,size.w-2)} height={Math.max(0,size.h-2)} rx="17" stroke={`url(#${id})`}/><rect className="nh-welcome-trace" pathLength="100" x="1" y="1" width={Math.max(0,size.w-2)} height={Math.max(0,size.h-2)} rx="17" stroke={`url(#${id})`}/></svg><div className="nh-welcome-content">{children}</div></div>;
}
