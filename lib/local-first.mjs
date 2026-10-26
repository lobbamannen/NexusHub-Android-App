/** Ignore transport timestamps, retaining actual content and source versions. */
export function contentVersion(value){const volatile=new Set(['fetchedAt','generatedAt','checkedAt','savedAt','offlineCache']);const clean=x=>Array.isArray(x)?x.map(clean):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!volatile.has(k)).map(([k,v])=>[k,clean(v)])):x;return JSON.stringify(clean(value));}
/** Cache reads never mutate editor drafts; writes and explicit fresh reads bypass this helper. */
export function localFirstReader({get,refresh,changed,failure}){
 const pending=new Map(),checked=new Map();
 return async function read(key,request){
  const cached=await get(key,request);
  if(!cached)return refresh(request);
  if(!pending.has(key)&&Date.now()-(checked.get(key)||0)>5000){
   checked.set(key,Date.now());
   const task=Promise.resolve().then(()=>refresh(request)).then(async response=>{if(response.headers.get('X-Nexus-Superseded')==='true')return;if(!response.ok||response.headers.get('X-Nexus-Offline')==='true'){failure(key,cached.savedAt);return;}try{const previous=JSON.parse(new TextDecoder().decode(cached.body)),next=await response.clone().json();if(contentVersion(previous)!==contentVersion(next))changed(key);}catch{/* Binary documents still refresh their durable copy. */}}).catch(()=>failure(key,cached.savedAt)).finally(()=>pending.delete(key));pending.set(key,task);
  }
  const headers=new Headers(cached.headers);headers.set('X-Nexus-Local','true');headers.set('X-Nexus-Cached-At',cached.savedAt);return new Response(cached.body.slice(0),{status:cached.status,headers});
 };
}
/** Share one queue for cache writes from reads and confirmed mutations. */
export function cacheCommitter(currentEpoch){let chain=Promise.resolve();return (expected,work)=>{const result=chain.then(()=>expected===null||expected===currentEpoch()?work():undefined);chain=result.catch(()=>{});return result;};}
export function compatibleMutationModel(path,data){return Boolean((['/api/films','/api/series','/api/story-register','/api/story-status','/api/document-bookmarks'].includes(path)&&data.register)||(['/api/calendar','/api/todos','/api/series-watch-settings','/api/watch-history'].includes(path)&&data.data));}
