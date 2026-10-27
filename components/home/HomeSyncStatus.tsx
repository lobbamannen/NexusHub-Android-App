'use client';
import React,{useEffect,useState} from 'react';
import {CheckCircle2,RefreshCw,AlertCircle} from 'lucide-react';
import {replicaStatus} from '@/platform/replica-sync';
import {homeSyncStatus} from '@/lib/home-sync-status.mjs';
export default function HomeSyncStatus({files,onNavigate}:{files:number|null;onNavigate:(view:string)=>void}){
 const [state,setState]=useState(replicaStatus);
 useEffect(()=>{const update=()=>setState(replicaStatus());update();window.addEventListener('nexus-replica-status',update);return()=>window.removeEventListener('nexus-replica-status',update);},[]);
 const status=homeSyncStatus(state),Icon=status.tone==='ready'?CheckCircle2:status.tone==='error'?AlertCircle:RefreshCw;
 const detail=[typeof files==='number'?files.toLocaleString('sv-SE')+' filer':null,state.checkedAt?'Senast slutförd synk: '+new Date(state.checkedAt).toLocaleString('sv-SE'):null,state.error||null].filter(Boolean).join('. ');
 return <button type="button" className={'nh-home-sync nh-home-sync-'+status.tone} onClick={()=>onNavigate('installningar')} aria-label={status.label+'. Visa synkdetaljer och inställningar. '+detail} title={detail}><Icon size={12} aria-hidden="true"/><span>{status.label}</span></button>;
}
