import {nativeAvailable,nativeCall} from '@/lib/calendar/native-client';
import schema from '@/lib/telemetry-schema.json';
import {createTelemetry} from '@/lib/telemetry.mjs';
export {bucketDuration,bucketFiles,bucketBytes,errorCategory,categoryForPath,resourceForPath} from '@/lib/telemetry.mjs';
export type TelemetryStatus={supported:boolean;enabled:boolean;sdkReady:boolean;project:string;error?:string};
let status:TelemetryStatus={supported:false,enabled:false,sdkReady:false,project:'nexushub-android-eu'},started=false;
const engine=createTelemetry({enabled:()=>status.enabled&&status.sdkReady,send:(event:any)=>nativeCall('telemetry.capture',event)});
export type TelemetryEventName=keyof typeof schema;
export const telemetry=(name:TelemetryEventName,properties:Record<string,string|boolean>={})=>{void engine.capture(name,properties);};
export const trackSection=(module:string)=>{void engine.section(module);};
export const telemetryStatus=()=>status;
function publish(value:TelemetryStatus){const becameEnabled=value.enabled&&!status.enabled;status=value;if(becameEnabled)window.dispatchEvent(new Event('nexus-telemetry-enabled'));window.dispatchEvent(new Event('nexus-telemetry-status'));return value;}
export async function refreshTelemetry(){if(!nativeAvailable())return status;try{return publish(await nativeCall<TelemetryStatus>('telemetry.getStatus'));}catch{return publish({...status,error:'Diagnostiken kunde inte ansluta till Android.'});}}
export async function setTelemetryEnabled(enabled:boolean){
 if(!nativeAvailable())return status;
 const next=await nativeCall<TelemetryStatus>('telemetry.setEnabled',{enabled});engine.reset();publish(next);
 if(next.enabled)window.dispatchEvent(new Event('nexus-telemetry-enabled'));return next;
}
export function startTelemetry(){if(started)return;started=true;void refreshTelemetry();}
