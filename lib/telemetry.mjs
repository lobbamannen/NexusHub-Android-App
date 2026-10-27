import schema from './telemetry-schema.json' with {type:'json'};
export {schema};
export function sanitizeEvent(name,properties={}){
 if(!Object.hasOwn(schema,name)||!properties||typeof properties!=='object'||Array.isArray(properties))return null;
 const out={};for(const [key,allowed] of Object.entries(schema[name])){
  if(!Object.hasOwn(properties,key))continue;const value=properties[key];
  if(allowed==='boolean'?typeof value!=='boolean':!allowed.includes(value))return null;out[key]=value;
 }
 return {name,properties:out};
}
export const bucketDuration=n=>n<100?'under100ms':n<500?'100to499ms':n<1000?'500to999ms':n<3000?'1to3s':n<10000?'3to10s':'over10s';
export const bucketFiles=n=>n<=0?'0':n<=10?'1to10':n<=100?'11to100':n<=1000?'101to1000':'over1000';
export const bucketBytes=n=>n<=0?'0':n<1048576?'under1mb':n<=104857600?'1to100mb':'over100mb';
export const errorCategory=e=>e?.status===401||e?.status===403?'auth':e?.status===429?'rate_limit':e?.status===409?'conflict':e instanceof TypeError?'network':e?.name==='QuotaExceededError'?'storage':'other';
export function categoryForPath(path){return /^\/api\/(films|series|media-register)(?:\?|$)/.test(path)?'media':/^\/api\/idea/.test(path)?'ideas':/^\/api\/stor/.test(path)?'stories':/^\/api\/economy/.test(path)?'economy':/^\/api\/todos/.test(path)?'todos':/^\/api\/(incoming|files)/.test(path)?'incoming':'other';}
export function resourceForPath(path){const c=categoryForPath(path);return ['media','stories','ideas','economy'].includes(c)?c:'other';}
export function createTelemetry({send,enabled}){
 let lastSection='',samples=0;const fallback=new Set();
 const capture=async(name,properties={})=>{try{
  if(!enabled())return;const event=sanitizeEvent(name,properties);if(!event)return;
  if(name==='image_load_slow'){if(samples>=20)return;samples++;}
  if(name==='local_read_fallback'){const key=JSON.stringify(event.properties);if(fallback.has(key))return;fallback.add(key);}
  await send(event);
 }catch{/* Analytics must never change the user's action. */}};
 return {capture,section:async module=>{if(!enabled()||module===lastSection)return;lastSection=module;await capture('section_viewed',{module:Object.values(schema.section_viewed.module).includes(module)?module:'other'});},reset:()=>{lastSection='';samples=0;fallback.clear();}};
}
/** Local input is inspected only to emit constant enums after a verified receipt. */
export function confirmedActions(path,body){try{return deriveConfirmedActions(path,body);}catch{return [];}}
function deriveConfirmedActions(path,body){
 let p;try{if(body?.kind!=='json')return [];p=JSON.parse(body.text);}catch{return [];}
 const out=[],push=(name,properties)=>out.push({name,properties});
 if(path==='/api/media-register')for(const e of p.edits||[]){
  if(e.changes?.releaseWatch)push('series_watch_toggled',{state:e.changes.releaseWatch.enabled?'on':'off'});
  if(['status','wantToWatch','watchedSeasons'].some(k=>Object.hasOwn(e.changes||{},k)))push('media_status_saved',{media_type:p.kind==='series'?'series':'film',action:'other'});
 }
 if(path==='/api/series'){
  if(p.action==='set-release-watch')push('series_watch_toggled',{state:p.releaseWatch?.enabled?'on':'off'});
  else push('media_status_saved',{media_type:'series',action:p.action==='set-watchlist'?'wishlist_changed':'other'});
 }
 if(path==='/api/films')push('media_status_saved',{media_type:'film',action:'other'});
 if(path==='/api/ideas'){
  push(p.expectedSha===null?'idea_created':'idea_updated',{category:'ideas'});
  if(schema.idea_status_changed.status.includes(p.idea?.status))push('idea_status_changed',{status:p.idea.status});
 }
 if(path==='/api/story-status'){
  const changes=p.action==='batch'?p.edits:p.field==='read'?[p]:[];
  for(const e of changes||[])if(e.field==='read'||p.action==='batch')push('story_read_saved',{state:e.value?'read':'unread'});
 }
 if(path==='/api/story-register')for(const e of p.edits||[])if(typeof e.changes?.read==='boolean')push('story_read_saved',{state:e.changes.read?'read':'unread'});
 if(path==='/api/economy')push('economy_action_saved',{action:/Katalog\/kategorier/.test(p.path||'')?'category_change':/Katalog\/produkter/.test(p.path||'')?'product_change':'other'});
 return out;
}
