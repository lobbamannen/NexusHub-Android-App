import {auditMutation,observeSnapshot} from './activity-observer';
import {telemetry,resourceForPath,categoryForPath} from './telemetry';
import * as trainingArchive from '@/app/api/training-archive/route';
import * as connections from '@/app/api/connections/route';
import * as additions from '@/app/api/media-additions/route';
import {localFirstReader,cacheCommitter,compatibleMutationModel} from '@/lib/local-first.mjs';
import {localReadSeed} from './local-read-seed';
import * as calendar from '@/app/api/calendar/route';
import * as watchSettings from '@/app/api/series-watch-settings/route';
import * as watchHistory from '@/app/api/watch-history/route';
import * as dailyActivity from '@/app/api/daily-activity/route';
import * as todos from '@/app/api/todos/route';
import * as incoming from '@/app/api/incoming/route';
import * as ideaFiles from '@/app/api/idea-files/route';
import * as ideaPlans from '@/app/api/idea-plans/route';
import * as ideas from '@/app/api/ideas/route';
import * as films from '@/app/api/films/route';
import * as series from '@/app/api/series/route';
import * as media from '@/app/api/media-register/route';
import * as stories from '@/app/api/story-register/route';
import * as storyStatus from '@/app/api/story-status/route';
import * as bookmarks from '@/app/api/document-bookmarks/route';
import * as posters from '@/app/api/posters/route';
import * as economy from '@/app/api/economy/route';
import * as fallback from '@/app/api/[[...path]]/route';
import { initializeStorage, durableGet, durableSet, durableDelete,durableEntries } from './local-store';
import { configureOutbox, enqueueMutation, isQueuedMutation, noteGithubFailure, affectedReadResources } from './outbox';
import { replicaReader } from './mirror-access';
import { github } from '@/lib/github';
import { createMirrorWriteBarrier } from '@/lib/mirror-write-barrier.mjs';
export { pendingWrites, retryPendingWrites, discardPendingWrite, cancelQueuedEdits } from './outbox';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD' | 'PUT' | 'OPTIONS';
type Route = Partial<Record<Method, (request: Request) => Promise<Response>>>;
const routes: Record<string, Route> = {
 '/api/training-archive':trainingArchive,'/api/connections':connections,
 '/api/media-additions':additions,
 '/api/calendar':calendar,'/api/series-watch-settings':watchSettings,'/api/watch-history':watchHistory,
  '/api/daily-activity':dailyActivity, '/api/todos':todos, '/api/incoming':incoming, '/api/idea-files':ideaFiles, '/api/idea-plans': ideaPlans, '/api/ideas': ideas, '/api/films': films, '/api/series': series, '/api/media-register': media,
  '/api/story-register': stories, '/api/story-status': storyStatus,
  '/api/document-bookmarks': bookmarks, '/api/posters': posters, '/api/economy': economy,
};
interface CachedResponse { body: ArrayBuffer; status: number; headers: [string, string][]; savedAt: string; confirmedThrough?: number; repositorySavedAt?: Record<string, string> }
const cacheable = (request: Request) => request.method === 'GET' && /^\/api\/(media-additions|calendar|series-watch-settings|watch-history|daily-activity|todos|idea-files|idea-plans|ideas|films|series|story-register|story-status|document-bookmarks|economy|github\/browse|portal\/(overview|document))(?:\?|$)/.test(new URL(request.url).pathname + new URL(request.url).search);
async function dispatch(request: Request): Promise<Response> {
  await initializeStorage();
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const route = routes[path] || fallback as Route;
  const handler = route[request.method as Method];
  if (!handler) return Response.json({ error: 'Metoden stöds inte.' }, { status: 405, headers: { Allow: Object.keys(route).filter(key => /^[A-Z]+$/.test(key)).join(', ') } });
  try { return await auditMutation(request,()=>handler(request)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 }); }
}
function readCacheKey(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/portal/overview') url.searchParams.delete('refresh');
  url.searchParams.sort();
  return 'api-read:v1:' + url.pathname + url.search;
}
async function invalidateReadResource(path:string){
  for(const [key] of await durableEntries('api-read:v1:'+path)){
    if(key==='api-read:v1:'+path||key.startsWith('api-read:v1:'+path+'?'))await durableDelete(key);
  }
}
function signalStale(path: string, savedAt: string | null, repositories?: string[]) {
  window.dispatchEvent(new CustomEvent('nexus-offline-read', { detail: { path, savedAt, repositories } }));
}
let apiEpoch=0;
const commitReadCache=cacheCommitter(()=>apiEpoch);
const writeBarrier=createMirrorWriteBarrier();
const unresolvedReceiptPaths=new Set<string>();
const resourceSequences=new Map<string,number>();
const resourceReceipts=new Map<string,any>();
function newerReceipt(candidate:any,previous:any){
  if(!candidate)return false;
  if(!previous)return true;
  if(candidate.sequence!==undefined)return previous.sequence===undefined||candidate.sequence>previous.sequence;
  return previous.sequence===undefined&&String(candidate.completedAt)>String(previous.completedAt);
}
function cacheAfterReceipt(cached:CachedResponse|undefined,receipt:any){
  if(!cached)return false;
  return receipt.sequence!==undefined?(cached.confirmedThrough||0)>=receipt.sequence:Date.parse(cached.savedAt)>Date.parse(receipt.completedAt);
}
async function usableReadCache(key:string,path:string){
  const cached=await durableGet<CachedResponse>(key);
  const required=resourceSequences.get(path)||0;
  return cached&&(cached.confirmedThrough||0)>=required?cached:undefined;
}
async function dispatchWithCache(request: Request) {
  const epoch=apiEpoch;
  const confirmedThrough=resourceSequences.get(new URL(request.url).pathname)||0;
  const response = await dispatch(request);
  if(epoch===apiEpoch&&request.method==='GET'&&response.ok){try{await observeSnapshot(new URL(request.url).pathname,await response.clone().json());}catch{/* History failure never converts a successful read into a failure. */}}
  if (!cacheable(request)) return response;
  if(epoch!==apiEpoch){const headers=new Headers(response.headers);headers.set('X-Nexus-Superseded','true');return new Response(response.body,{status:response.status,headers});}
  const path = new URL(request.url).pathname;
  const key = readCacheKey(request);
  try {
    if (response.ok && path === '/api/portal/overview') {
      const fresh = await response.clone().json();
      const repositories = fresh.repositories && typeof fresh.repositories === 'object' ? fresh.repositories : {};
      const missing = ['databas', 'plugins'].filter(repo => !repositories[repo]);
      const cached = await usableReadCache(key,path);
      let previous: any = null;
      if (cached) { try { previous = JSON.parse(new TextDecoder().decode(cached.body)); } catch { /* Ignore incompatible old cache. */ } }
      const merged = { ...repositories };
      const stale: string[] = [], unavailable: string[] = [];
      const at = new Date().toISOString(), repositorySavedAt: Record<string, string> = {};
      for (const repo of Object.keys(repositories)) repositorySavedAt[repo] = at;
      for (const repo of missing) {
        if (previous?.repositories?.[repo]) {
          merged[repo] = previous.repositories[repo]; stale.push(repo);
          repositorySavedAt[repo] = cached?.repositorySavedAt?.[repo] || cached!.savedAt;
        } else unavailable.push(repo);
      }
      const headers = new Headers(response.headers);
      const body = missing.length ? { ...fresh, repositories: merged, offlineCache: {
        stale: true, cachedRepositories: stale, unavailableRepositories: unavailable, savedAtByRepository: repositorySavedAt,
      } } : fresh;
      if (missing.length) {
        headers.set('X-Nexus-Offline', 'true'); headers.set('X-Nexus-Partial', 'true');
        const oldest = stale.map(repo => repositorySavedAt[repo]).sort()[0] || null;
        if (oldest) headers.set('X-Nexus-Cached-At', oldest);
        signalStale(path, oldest, missing);
      }
      const result = Response.json(body, { status: response.status, headers });
      // Preserve each repository's last good snapshot, including its original age.
      // An entirely unavailable 200 must never erase a useful previous catalog.
      const cachedBody=await result.clone().arrayBuffer();
      if (Object.keys(merged).length) await commitReadCache(epoch,()=>durableSet(key, {
        body: cachedBody, status: result.status,
        headers: Array.from(result.headers.entries()), savedAt: at, confirmedThrough, repositorySavedAt,
      } satisfies CachedResponse));
      return result;
    }
    if (response.ok) {
      const body=await response.clone().arrayBuffer();await commitReadCache(epoch,()=>durableSet(key, { body, status: response.status, headers: Array.from(response.headers.entries()), savedAt: new Date().toISOString(),confirmedThrough } satisfies CachedResponse));
    } else if (response.status >= 500) {
      const cached = await usableReadCache(key,path);
      if (cached) {
        const headers = new Headers(cached.headers);
        const savedAt = cached.repositorySavedAt ? Object.values(cached.repositorySavedAt).sort()[0] || cached.savedAt : cached.savedAt;
        headers.set('X-Nexus-Offline', 'true'); headers.set('X-Nexus-Cached-At', savedAt);
        telemetry('local_read_fallback',{resource:resourceForPath(path),outcome:'stale'});
        signalStale(path, savedAt);
        return new Response(cached.body, { status: cached.status, headers });
      }
    }
  } catch { /* Reading remains usable when the cache is unavailable or full. */ }
  return response;
}

const readUiLocal=localFirstReader({
 get:async(key:string,request:Request)=>{await initializeStorage();const url=new URL(request.url);try{const current=await replicaReader.current('databas');if(unresolvedReceiptPaths.has(url.pathname)||await writeBarrier.blockedAsync(url.pathname,current?.commit||null,(expected:string,actual:string)=>github('databas').isAncestor(expected,actual)))return await usableReadCache(key,url.pathname)||null;const data=await localReadSeed(url.pathname,url.search);if(data){try{await observeSnapshot(url.pathname,data);}catch{/* Optional history projection. */}return {body:new TextEncoder().encode(JSON.stringify(data)).buffer,status:200,headers:[['Content-Type','application/json']],savedAt:new Date().toISOString(),mirrorComplete:true};}}catch{/* Missing or damaged local model falls through to last good read. */}return await usableReadCache(key,url.pathname)||null;},
 refresh:(request:Request)=>{telemetry('local_read_fallback',{resource:resourceForPath(new URL(request.url).pathname),outcome:'network'});return dispatchWithCache(request);},
 changed:()=>window.dispatchEvent(new Event('nexus-github-changed')),
 failure:(key:string,at:string)=>signalStale(key,at),
});
let installed = false;
/** Intercept only this WebView's /api routes. GitHub uses the real network. */
export function installLocalApi(): void {
  if (installed) return;
  installed = true;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  // Reconciliation deliberately bypasses the offline cache: only a current GitHub
  // response can prove that an interrupted write actually committed.
  // Recover confirmed writes even if the WebView was terminated after GitHub accepted them.
  let startupError: unknown;
  const restored = (async()=>{
    await initializeStorage();
    const entries=await durableEntries<any>('outbox-receipt:v1:');
    const newest=new Map<string,any>();
    for(const [,receipt] of entries) {
      if(typeof receipt?.path!=='string')continue;
      // Legacy media receipts did not retain kind; fence both projections.
      const resources=Array.isArray(receipt.affectedResources)?receipt.affectedResources:
        affectedReadResources({path:receipt.path,body:{kind:'json',text:'{}'}});
      for(const path of resources){
        const old=newest.get(path);
        if(newerReceipt(receipt,old))newest.set(path,receipt);
      }
    }
    for(const [path,receipt] of newest){
      resourceReceipts.set(path,receipt);
      if(receipt.sequence!==undefined)resourceSequences.set(path,receipt.sequence);
      if(/^[a-f0-9]{40}$/.test(receipt.commit||''))writeBarrier.record(path,receipt.commit);
      else unresolvedReceiptPaths.add(path);
      // Drop only reads older than the acknowledgement. Newer verified reads
      // remain useful offline; a pre-write cache cannot impersonate this write.
      for(const [key,cached] of await durableEntries<CachedResponse>('api-read:v1:'+path)){
        if((key==='api-read:v1:'+path||key.startsWith('api-read:v1:'+path+'?'))&&!cacheAfterReceipt(cached,receipt))await durableDelete(key);
      }
      if(receipt.response?.body){
        let data:any;try{data=JSON.parse(receipt.response.body);}catch{continue;}
        const key=compatibleMutationModel(path,data)?'api-read:v1:'+path:
          path==='/api/ideas'&&data.saved===true&&typeof data.idea?.id==='string'?'api-read:v1:/api/ideas?id='+encodeURIComponent(data.idea.id):null;
        if(key){
          const cached=await durableGet<CachedResponse>(key);
          if(!cacheAfterReceipt(cached,receipt))await durableSet(key,{
            body:new TextEncoder().encode(receipt.response.body).buffer,status:200,
            headers:[['Content-Type','application/json']],savedAt:receipt.completedAt,confirmedThrough:receipt.sequence,
          } satisfies CachedResponse);
        }
      }
    }
  })().catch(error=>{startupError=error;});
  configureOutbox(dispatch,async(item,receipt)=>{
    apiEpoch++;
    const paths=receipt.affectedResources||affectedReadResources(item);
    receipt.affectedResources=paths;
    // For reconciled acknowledgements the route may contain no commit SHA.
    // Read a fresh GitHub head before dropping the durable outbox entry;
    // failure keeps the already-confirmed receipt for a safe local retry.
    const commit=receipt.commit||await github('databas').head();
    if(!/^[a-f0-9]{40}$/.test(commit))throw Error('GitHub-versionen kunde inte bekräftas.');
    receipt.commit=commit;
    // Resolve and persist the fence before any fallible cache integration.
    await durableSet('outbox-receipt:v1:'+item.id,receipt);
    for(const target of paths){
      if(newerReceipt(resourceReceipts.get(target),receipt))continue;
      resourceReceipts.set(target,receipt);
      if(receipt.sequence!==undefined)resourceSequences.set(target,receipt.sequence);
      unresolvedReceiptPaths.delete(target);
      writeBarrier.record(target,commit);
      await invalidateReadResource(target);
      if(receipt.response?.body){
        const data=JSON.parse(receipt.response.body);
        const key=compatibleMutationModel(target,data)?'api-read:v1:'+target:
          target==='/api/ideas'&&data.saved===true&&typeof data.idea?.id==='string'?'api-read:v1:/api/ideas?id='+encodeURIComponent(data.idea.id):null;
        if(key)await commitReadCache(null,()=>durableSet(key,{
          body:new TextEncoder().encode(receipt.response!.body).buffer,status:200,
          headers:[['Content-Type','application/json']],savedAt:receipt.completedAt,confirmedThrough:receipt.sequence,
        } satisfies CachedResponse));
      }
    }
    // The actual remote confirmation is not lost if the local integration is interrupted.
    window.dispatchEvent(new Event('nexus-github-changed'));
  });
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const request = new Request(input instanceof Request ? input : url.href, init);
      await restored;
      if(startupError)return Response.json({error:'Telefonens bekräftade sparningar kunde inte återställas. Försök igen när lagringen kan läsas.'},{status:503});
      if(isQueuedMutation(request)){
        apiEpoch++;const response=await enqueueMutation(request);apiEpoch++;

        return response;
      }
      const eligible=cacheable(request)&&!url.pathname.startsWith('/api/portal/document')&&!url.pathname.startsWith('/api/github/');
      return eligible&&request.headers.get('X-Nexus-Fresh')!=='true'&&request.cache!=='reload'&&!url.searchParams.has('refresh')?readUiLocal(readCacheKey(request),request):dispatchWithCache(request);
    }
    // Observe failures so routes that convert fetch's TypeError to HTTP 400 can
    // still retain the durable intent as pending, without changing server code.
    try {
      const response = await nativeFetch(input, init);
      if (url.hostname === 'api.github.com' && (response.status >= 500 || response.status === 429)) noteGithubFailure();
      return response;
    } catch (error) { if (url.hostname === 'api.github.com') noteGithubFailure(); throw error; }
  };
}
