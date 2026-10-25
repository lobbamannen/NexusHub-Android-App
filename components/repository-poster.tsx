'use client';
import React,{useEffect,useState} from 'react';
import {useLocalImage} from '@/platform/resources';

export function usePosterRevision():[string,()=>Promise<void>,{films:string[],series:string[],stories:string[]}]{
 const [revision,setRevision]=useState('');
 const [available,setAvailable]=useState<{films:string[],series:string[],stories:string[]}>({films:[],series:[],stories:[]});
 const refresh=async()=>{
  try{
   const response=await fetch('/api/posters?index=1&refresh=1',{cache:'no-store'}),body:any=await response.json();
   if(!response.ok||!/^[a-f0-9]{40}$/.test(body.revision||''))throw Error('Bildindex saknas.');
   setRevision(body.revision);
   setAvailable({films:Array.isArray(body.available?.films)?body.available.films:[],series:Array.isArray(body.available?.series)?body.available.series:[],stories:Array.isArray(body.available?.stories)?body.available.stories:[]});
  }catch{setRevision(String(Date.now()));setAvailable({films:[],series:[],stories:[]});}
 };
 return [revision,refresh,available];
}

export default function RepositoryPoster({kind,posterKey,revision,alt,children}:{kind:'films'|'series'|'stories';posterKey:string;revision:string;alt:string;children:React.ReactNode}){
 const [failed,setFailed]=useState(false);
 const url='/api/posters?'+new URLSearchParams({kind,key:posterKey,v:revision}).toString();
 useEffect(()=>setFailed(false),[url]);
 const image=useLocalImage(url,true);
 return !failed&&!image.error?<img ref={image.ref} src={image.source||undefined} loading="lazy" alt={alt} onError={()=>setFailed(true)}/>:<>{children}</>;
}
