import {mutationActivities,snapshotActivities,fileActivities} from '@/lib/activity-events.mjs';
import {recordActivity} from './activity';
import {durableGet,durableSet} from './local-store';
import {backgroundWork} from './background-work';
import {bucket} from '@/lib/store';

const snapshotKind=(path:string)=>({'/api/films':'media-films','/api/series':'media-series','/api/story-register':'stories','/api/story-status':'story-status','/api/todos':'todos','/api/calendar':'calendar'} as Record<string,string>)[path];
export async function auditMutation(request:Request,handler:()=>Promise<Response>){
 if(['GET','HEAD','OPTIONS'].includes(request.method))return handler();
 return backgroundWork('save',async()=>{
  const path=new URL(request.url).pathname,operationId=crypto.randomUUID();let input:any={};
  try{if(request.headers.get('content-type')?.includes('application/json'))input=await request.clone().json();else if(request.headers.get('content-type')?.includes('multipart/form-data')){const f=await request.clone().formData();input={name:(f.get('file') as File)?.name};}}catch{/* The unchanged route validates malformed requests. */}
  const started=mutationActivities(path,request.method,input,{});
  for(let i=0;i<started.length;i++)await recordActivity({...started[i],id:operationId+':pending:'+i,operationId,status:'pending',source:'app'});
  try{
   const response=await handler();let result:any={};try{result=await response.clone().json();}catch{}
   const status=response.status===409?'conflict':!response.ok?'failed':result.queued||result.github?.state==='pending'||result.state==='pending'?'pending':'succeeded';
   const events=mutationActivities(path,request.method,input,result);
   for(let i=0;i<events.length;i++)await recordActivity({...events[i],id:operationId+':result:'+i,operationId,status,source:'app',details:{...events[i].details,httpStatus:response.status,...(result.error?{message:String(result.error).slice(0,400)}:{}),...(result.sha?{sha:result.sha}:{}),...(result.commit?{commit:result.commit}:{}),...(result.reconciled?{reconciled:true}:{})}});
   if(status==='succeeded'&&snapshotKind(path))try{await observeSnapshot(path,result,'app',operationId);}catch{/* A history projection cannot turn a confirmed write into a failed save. */}
   return response;
  }catch(error){await recordActivity({id:operationId+':failed',operationId,category:'sync',action:'save_failed',status:'failed',source:'app',title:'Sparningen kunde inte bekräftas',details:{route:path}});throw error;}
 });
}
export async function observeSnapshot(path:string,value:any,source='github',operationId?:string){
 const kind=snapshotKind(path);if(!kind)return;
 // Only validated successful models enter this function. No offline or partial models.
 const model=value.register||value.data;if(!model)return;
 const key='activity-snapshot:v1:'+kind,previous=await durableGet<any>(key);
 const events=snapshotActivities(kind,previous,model),version=value.sha||value.commit||crypto.randomUUID();
 for(let i=0;i<events.length;i++)await recordActivity({...events[i],id:'snapshot:'+kind+':'+version+':'+i,operationId:operationId||'snapshot:'+version,status:'succeeded',source,details:{...events[i].details,...(value.sha?{sha:value.sha}:{})}});
 await durableSet(key,model);
}
export async function observeFiles(repo:string,before:any[]|null,after:any[],commit:string){
 for(const e of fileActivities(before,after))await recordActivity({...e,id:'file:'+repo+':'+commit+':'+e.action+':'+e.path,operationId:'replica:'+repo+':'+commit,status:'succeeded',details:{...e.details,repo,commit}});
 if(repo!=='databas')return;
 const models:Record<string,string>={'Filmer/register.json':'/api/films','Serier/register.json':'/api/series','Berattelser/register.json':'/api/story-register','Berattelser/lasstatus.json':'/api/story-status','Att-gora/register.json':'/api/todos','Kalender/egna-handelser.json':'/api/calendar'};
 for(const [path,route]of Object.entries(models)){
  const next=after.find(f=>f.path===path),old=before?.find(f=>f.path===path);if(!next||old?.sha===next.sha)continue;
  try{
   const read=async(sha:string)=>{const file=await bucket().get('mirror/'+repo+'/'+sha);if(!file)throw Error('Historikunderlag saknas');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()));};
   const kind=snapshotKind(route),key='activity-snapshot:v1:'+kind;
   if(!await durableGet(key)&&old)await durableSet(key,await read(old.sha));
   await observeSnapshot(route,{register:await read(next.sha),sha:next.sha,commit},'github');
  }catch{/* File history is still retained; partial/unknown register data never becomes a deletion. */}
 }
}
