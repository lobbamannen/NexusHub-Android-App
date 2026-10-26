import {nativeAvailable,nativeCall,type WatchState} from '@/lib/calendar/native-client';
import {watchSettings,seriesKey,mergeWatchHistory} from '@/lib/calendar/domain.mjs';
import {durableGet,durableSet} from './local-store';
import {hasGithubToken} from './env';
import {pendingWrites} from './outbox';
let started=false,active:Promise<void>|null=null,wanted=false;
let lastConfig='',lastHistory='';
export let watchSyncError='';
async function fresh(url:string){const response=await fetch(url,{cache:'no-store'}),data=await response.json();if(!response.ok||response.headers.get('X-Nexus-Offline')==='true')throw Error(data.error||'En aktuell GitHub-version behövs för bevakningssynken.');return data;}
export function syncWatchState(){
 wanted=true;if(active)return active;
 active=(async()=>{while(wanted){wanted=false;if(!nativeAvailable()||!hasGithubToken())return;
 try{
  const [series,settings,remoteHistory]=await Promise.all([fresh('/api/series'),fresh('/api/series-watch-settings'),fresh('/api/watch-history')]);
  const config={v:1,sourceShas:{series:series.sha,settings:settings.sha},settings:watchSettings(settings.data),series:series.register.series.filter((s:any)=>s.releaseWatch).map((s:any)=>({key:seriesKey(s),imdbId:s.imdbId,title:s.title,releaseWatch:s.releaseWatch}))};
  const fingerprint=JSON.stringify(config);
  if(fingerprint!==lastConfig){const old=await durableGet<number>('watch:native-generation:v1')||0,generation=Math.max(Date.now(),old+1);await durableSet('watch:native-generation:v1',generation);await nativeCall('watch.setSnapshot',{...config,generation});lastConfig=fingerprint;}
  await nativeCall('watch.restoreHistory',{events:remoteHistory.data.events});
  const state=await nativeCall<WatchState>('watch.getState');
  const merged=mergeWatchHistory(remoteHistory.data,state.events||[]),signature=JSON.stringify(merged);
  if(signature!==JSON.stringify(remoteHistory.data)&&signature!==lastHistory){
   if((await pendingWrites()).some(item=>item.path==='/api/watch-history'))throw Error('Bevakningshistorik väntar på bekräftelse i Inställningar.');
   const r=await fetch('/api/watch-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:state.events,expectedSha:remoteHistory.sha})}),saved=await r.json();if(!r.ok||!saved.saved)throw Error(saved.error||'Historiken är lokal och väntar på GitHub.');lastHistory=signature;
  }
  watchSyncError='';window.dispatchEvent(new Event('nexus-watch-synced'));
 }catch(e:any){watchSyncError=e.message;window.dispatchEvent(new Event('nexus-watch-synced'));}
 }})().finally(()=>{active=null;});return active;
}
export function startWatchSync(){if(started)return;started=true;
 let timer:number|undefined;const wake=()=>{if(document.visibilityState!=='visible')return;clearTimeout(timer);timer=window.setTimeout(()=>void syncWatchState(),1500);};
 window.addEventListener('nexus-github-changed',wake);window.addEventListener('nexus-write-completed',wake);window.addEventListener('nexus-credentials-changed',wake);document.addEventListener('visibilitychange',wake);
 window.addEventListener('nexus-native-event',event=>{if((event as CustomEvent).detail?.event==='watch.changed')wake();});
 wake();
}
