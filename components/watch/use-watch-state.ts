import {useEffect,useState} from 'react';
import {nativeAvailable,nativeCall,type WatchState} from '@/lib/calendar/native-client';
export function useWatchState(){
 const [state,setState]=useState<WatchState>({configured:false,running:false,notificationGranted:false,usedThisMonth:0,monthlyBudget:900,events:[]}),[error,setError]=useState('');
 useEffect(()=>{let active=true;const refresh=()=>{if(!nativeAvailable()||document.visibilityState!=='visible')return;void nativeCall<WatchState>('watch.getState').then(data=>{if(active){setState(data);setError('');}}).catch(e=>{if(active)setError(e.message);});};const listener=(e:Event)=>{if((e as CustomEvent).detail?.event==='watch.changed')refresh();};refresh();const timer=window.setInterval(refresh,15000);window.addEventListener('nexus-native-event',listener);window.addEventListener('nexus-watch-synced',refresh);document.addEventListener('visibilitychange',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('nexus-native-event',listener);window.removeEventListener('nexus-watch-synced',refresh);document.removeEventListener('visibilitychange',refresh);};},[]);
 return {state,error};
}
