import {nativeAvailable,nativeCall} from '@/lib/calendar/native-client';
import {dailyWidgetSnapshot} from '@/lib/widget-activity.mjs';
import {hasGithubToken} from './env';
let started=false,running=false,wanted=false;
async function sync(){
 wanted=true;if(running)return;running=true;
 try{while(wanted){wanted=false;if(!nativeAvailable())return;
  if(!hasGithubToken()){await nativeCall('widget.setActivity',{day:'',counts:{},observedAt:Date.now()});continue;}
  const observedAt=Date.now();
  try{
   const [activity,ideas]=await Promise.all(['/api/daily-activity','/api/ideas'].map(async url=>{
    const response=await fetch(url),data=await response.json();if(!response.ok||response.headers.get('X-Nexus-Superseded')==='true')throw Error('Activity unavailable');return data;
   }));
   if(activity.unavailable?.length||!Array.isArray(ideas.numbering?.entries))continue;
   if(hasGithubToken())await nativeCall('widget.setActivity',{...dailyWidgetSnapshot(activity,ideas.numbering.entries),observedAt});
  }catch{/* Keep the last successful same-day snapshot; midnight expires it natively. */}
 }}finally{running=false;}
}
export function startWidgetActivity(){if(started)return;started=true;
 let timer:number|undefined;
 const wake=()=>{if(document.visibilityState!=='visible')return;clearTimeout(timer);timer=window.setTimeout(()=>{void sync().catch(()=>{/* The next foreground wake retries the native bridge. */});},500);};
 for(const event of ['nexus-github-changed','nexus-write-completed','nexus-credentials-changed','online'])window.addEventListener(event,wake);
 document.addEventListener('visibilitychange',wake);
 window.setInterval(wake,60000);wake();
}
