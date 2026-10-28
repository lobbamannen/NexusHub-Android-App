import {useCallback,useEffect,useRef,useState} from 'react';
import {nativeAvailable,nativeCall} from '@/lib/calendar/native-client';
import type {WeatherLocation,WeatherState} from './types';
export function useWeather(){
 const [state,setState]=useState<WeatherState|null>(null),[error,setError]=useState('');const alive=useRef(false),reading=useRef(false);
 const read=useCallback(async()=>{if(!nativeAvailable()||reading.current)return;reading.current=true;try{const next=await nativeCall<WeatherState>('weather.getState');if(alive.current){setState(next);setError('');}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Vädret kunde inte läsas.');}finally{reading.current=false;}},[]);
 const refresh=useCallback(async()=>{setError('');try{const next=await nativeCall<WeatherState>('weather.refresh');if(alive.current)setState(next);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Vädret kunde inte uppdateras.');}},[]);
 const selectLocation=useCallback(async(location:WeatherLocation)=>{const next=await nativeCall<WeatherState>('weather.setLocation',location);if(alive.current)setState(next);},[]);
 useEffect(()=>{alive.current=true;void read();if(nativeAvailable())void nativeCall('weather.refresh',{manual:false}).then(()=>read()).catch(()=>{});
  const changed=(event:Event)=>{if((event as CustomEvent).detail?.event==='weather.changed')void read();};
  const visible=()=>{if(document.visibilityState==='visible')void read();};
  const refreshModule=(event:Event)=>{if(['vader','hem'].includes((event as CustomEvent).detail?.view))void refresh();};
  window.addEventListener('nexus-native-event',changed);window.addEventListener('nexus-refresh-module',refreshModule);document.addEventListener('visibilitychange',visible);
  const tick=window.setInterval(()=>{if(document.visibilityState==='visible')void read();},60000);
  return()=>{alive.current=false;window.clearInterval(tick);window.removeEventListener('nexus-native-event',changed);window.removeEventListener('nexus-refresh-module',refreshModule);document.removeEventListener('visibilitychange',visible);};
 },[read,refresh]);
 return {state,error,refresh,selectLocation,supported:nativeAvailable()};
}
