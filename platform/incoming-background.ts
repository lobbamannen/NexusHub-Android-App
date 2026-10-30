import {base64} from '@/lib/github-inbox.mjs';
import type {Incoming,SharedReceipt} from './incoming-store';
type Job={id:string;state:string;receipt?:SharedReceipt&{deleted?:boolean};error?:string;remoteDeleted?:boolean};
const bridge=()=>typeof window==='undefined'?null:window.Android as any;
export const nativeIntakeAvailable=()=>typeof bridge()?.queueIncoming==='function'&&typeof bridge()?.incomingJobs==='function';
export function backgroundIncomingJobs():Job[]{if(!nativeIntakeAvailable())return [];const jobs=JSON.parse(bridge().incomingJobs());if(!Array.isArray(jobs))throw Error('Bakgrundskön kunde inte läsas.');return jobs;}
export async function stageBackgroundIncoming(item:Incoming):Promise<Job|null>{
 if(!nativeIntakeAvailable()||(item.localOnly??!!item.destinations?.length)||item.deleting||item.shared)return null;
 const files=[];for(const file of item.files){if(file.error)throw Error(file.error);const encoded=file.blob?base64(new Uint8Array(await file.blob.arrayBuffer())):bridge()?.readIncomingFile?.(item.id,file.id);if(typeof encoded!=='string')throw Error('Originalfilen kunde inte säkras för bakgrundsuppladdning.');files.push({id:file.id,name:file.name,mime:file.mime,base64:encoded,...(file.sha?{sha:file.sha}:{})});}
 const job=JSON.parse(bridge().queueIncoming(JSON.stringify({id:item.id,text:item.text,createdAt:item.createdAt,...(item.sourceLabel?{sourceLabel:item.sourceLabel}:{}),files})));
 if(job.error&&!job.state||job.id!==item.id)throw Error(job.error||'Bakgrundsuppladdningen kunde inte köas. Originalet finns kvar på telefonen.');return job;
}
export async function cancelBackgroundIncoming(id:string){if(!nativeIntakeAvailable())return;const until=Date.now()+150000;while(bridge().cancelIncomingJob(id)!==true){if(Date.now()>until)throw Error('Raderingen väntar på att den pågående uppladdningen avslutas. Försök igen; originalet behålls.');await new Promise(resolve=>setTimeout(resolve,250));}}
export function retryBackgroundIncoming(){if(!nativeIntakeAvailable())return;for(const job of backgroundIncomingJobs())if(['failed','conflict','pending'].includes(job.state))bridge().retryIncomingJob?.(job.id);}
