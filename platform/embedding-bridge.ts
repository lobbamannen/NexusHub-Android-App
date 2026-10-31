/** Android-only, request-correlated local embedding and Gemma calls. */
export type EmbedItem={id:string;title?:string;text:string;task:'query'|'document'};
export type EmbedVector={id:string;values:number[];durationMs:number};
export type EmbedBatch={vectors:EmbedVector[];modelSha256:string;profileVersion:string;totalMs:number};
export type EmbedStatus={installed:boolean;importing:boolean;processing:boolean;modelSha256:string;profileVersion:string;backend:string;bytes:number;error?:string};
type Native={embeddingStatus?:()=>string;embeddingImportModel?:()=>boolean;embeddingRun?:(raw:string,id:string)=>boolean;gemmaStatus?:()=>string;gemmaChatSend?:(raw:string,id:string)=>boolean;gemmaCancelRequest?:(id:string)=>boolean};
const android=():Native|null=>typeof window==='undefined'?null:(window as any).Android||null;
export function embeddingStatus():EmbedStatus {
 try { const raw=android()?.embeddingStatus?.();return raw?JSON.parse(raw):{installed:false,importing:false,processing:false,error:'Kräver Android-appen',modelSha256:'',profileVersion:'',backend:'',bytes:0} }
 catch(e:any){return {installed:false,importing:false,processing:false,error:e.message,modelSha256:'',profileVersion:'',backend:'',bytes:0}}
}
export function importEmbeddingModel():boolean{return android()?.embeddingImportModel?.()===true}
export async function embedBatch(items:EmbedItem[],signal?:AbortSignal):Promise<EmbedBatch>{
 if(items.length<1||items.length>8||items.some(x=>x.text.length>3500||!x.text.trim()))throw Error('Ogiltig embeddingbatch (max 8 fönster, 3500 tecken).');
 const host=android();if(!host?.embeddingRun)throw Error('Native embeddingmotor saknas.');
 const id=crypto.randomUUID();
 return new Promise<EmbedBatch>((resolve,reject)=>{
  let done=false;
  const cleanup=()=>{window.removeEventListener('nexus-embedding-result',receive);signal?.removeEventListener('abort',abort);clearTimeout(timer)};
  const finish=(error?:Error,value?:EmbedBatch)=>{if(done)return;done=true;cleanup();if(error)reject(error);else resolve(value!)};
  const abort=()=>finish(new DOMException('Avbruten','AbortError'));
  const receive=(e:Event)=>{const payload=(e as CustomEvent<any>).detail;if(payload?.requestId!==id)return;
   if(!payload.ok)return finish(Error(payload.error||'Embeddinginferens misslyckades.'));
   const response=payload.result;
   if(!response?.modelSha256||!response?.profileVersion||response?.vectors?.length!==items.length)return finish(Error('Ofullständigt embeddingresultat.'));
   for(const v of response.vectors){if(!Array.isArray(v.values)||v.values.length!==256||v.values.some((x:any)=>typeof x!=='number'||!Number.isFinite(x)))return finish(Error('Korrupt embeddingvektor.'))}
   finish(undefined,response);
  };
  const timer=setTimeout(()=>finish(Error('Ingen återkoppling från Android inom 180 sekunder. Kontrollera native-status.')),180000);
  window.addEventListener('nexus-embedding-result',receive);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return}
  try{if(!host.embeddingRun!(JSON.stringify({items}),id))finish(Error('Android nekade embeddingbegäran.'))}
  catch(e:any){finish(e)}
 });
}
export async function gemmaRag(prompt:string,signal?:AbortSignal):Promise<{text:string;telemetry?:any;finishReason?:string}>{
 const host=android();if(!host?.gemmaChatSend)throw Error('Gemma-bryggan finns endast i Android.');
 if(!prompt.trim()||prompt.length>12000)throw Error('RAG-underlaget är för långt (max 12000 tecken).');
 const id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  let done=false,stopping=false;let cancelDeadline:ReturnType<typeof setTimeout>|undefined;
  const clean=()=>{window.removeEventListener('nexus-gemma-chat',receive);signal?.removeEventListener('abort',abort);clearTimeout(timer);clearTimeout(cancelDeadline)};
  const finish=(error?:Error,result?:{text:string;telemetry?:any;finishReason?:string})=>{
   if(done)return;done=true;clean();if(error)reject(error);else resolve(result!);
  };
  const abort=()=>{if(done||stopping)return;stopping=true;
   // The coordinator owns the model until the native run actually exits.
   if(!host.gemmaCancelRequest?.(id))finish(new DOMException('Avbruten','AbortError'));
   else cancelDeadline=setTimeout(()=>finish(Error('Native-avbrott kunde inte kvitteras i tid. Modellen hålls fortfarande reserverad tills den är avslutad.')),15000);
  };
  const receive=(event:Event)=>{
   const reply=(event as CustomEvent<any>).detail;if(reply?.requestId!==id)return;
   if(stopping)return finish(new DOMException('Avbruten','AbortError'));
   if(reply.ok&&reply.result)finish(undefined,reply.result);
   else finish(Error(reply.error||'Gemma kunde inte slutföra svaret.'));
  };
  const timer=setTimeout(()=>{if(!done)abort()},180000);
  window.addEventListener('nexus-gemma-chat',receive);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){finish(new DOMException('Avbruten','AbortError'));return;}
  try{if(!host.gemmaChatSend!(JSON.stringify([{role:'user',content:prompt}]),id))finish(Error('Android nekade Gemma-anropet.'))}
  catch(error:any){finish(error)}
 });
}
