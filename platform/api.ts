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
import { configureOutbox, enqueueMutation, isQueuedMutation, noteGithubFailure } from './outbox';
import { replicaReader } from './mirror-access';
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
interface CachedResponse { body: ArrayBuffer; status: number; headers: [string, string][]; savedAt: string; repositorySavedAt?: Record<string, string> }
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
function signalStale(path: string, savedAt: string | null, repositories?: string[]) {
  window.dispatchEvent(new CustomEvent('nexus-offline-read', { detail: { path, savedAt, repositories } }));
}
let apiEpoch=0;
const commitReadCache=cacheCommitter(()=>apiEpoch);
const writeBarrier=createMirrorWriteBarrier();
async function dispatchWithCache(request: Request) {
  const epoch=apiEpoch;
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
      const cached = await durableGet<CachedResponse>(key);
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
        headers: Array.from(result.headers.entries()), savedAt: at, repositorySavedAt,
      } satisfies CachedResponse));
      return result;
    }
    if (response.ok) {
      const body=await response.clone().arrayBuffer();await commitReadCache(epoch,()=>durableSet(key, { body, status: response.status, headers: Array.from(response.headers.entries()), savedAt: new Date().toISOString() } satisfies CachedResponse));
    } else if (response.status >= 500) {
      const cached = await durableGet<CachedResponse>(key);
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
 get:async(key:string,request:Request)=>{await initializeStorage();const url=new URL(request.url);try{const current=await replicaReader.current('databas');if(writeBarrier.blocked(url.pathname,current?.commit||null))return await durableGet<CachedResponse>(key)||null;const data=await localReadSeed(url.pathname,url.search);if(data){try{await observeSnapshot(url.pathname,data);}catch{/* Optional history projection. */}return {body:new TextEncoder().encode(JSON.stringify(data)).buffer,status:200,headers:[['Content-Type','application/json']],savedAt:new Date().toISOString(),mirrorComplete:true};}}catch{/* Missing or damaged local model falls through to last good read. */}return await durableGet<CachedResponse>(key)||null;},
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
  configureOutbox(dispatch,async(item,receipt)=>{
    apiEpoch++;
    const path=new URL(item.path,location.origin).pathname;
    const paths=[path];
    if(path==='/api/media-register'&&item.body.kind==='json'){
      try{const kind=JSON.parse(item.body.text).kind;if(['films','series'].includes(kind))paths.push('/api/'+kind);}catch{}
    }
    for(const target of paths){
      if(receipt.commit)writeBarrier.record(target,receipt.commit);
      for(const [key] of await durableEntries('api-read:v1:'+target)){
        if(key==='api-read:v1:'+target||key.startsWith('api-read:v1:'+target+'?'))await durableDelete(key);
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
      if (request.method === 'DELETE' && url.pathname === '/api/ideas') {
        apiEpoch++;let id:string;
        try {id=(await request.clone().json()).id;await commitReadCache(null,async()=>{await durableDelete('api-read:v1:/api/ideas');await durableDelete('api-read:v1:/api/ideas?id='+encodeURIComponent(id));});}
        catch {return Response.json({error:'Telefonens cache kunde inte uppdateras. Försök igen.'},{status:503});}
        const response=await dispatchWithCache(request);apiEpoch++;
        if(response.ok){try{const data=await response.clone().json();if(data.deleted)writeBarrier.record('/api/ideas',data.commit);}catch{}}
        if(response.ok)await commitReadCache(null,async()=>{await durableDelete('api-read:v1:/api/ideas');await durableDelete('api-read:v1:/api/ideas?id='+encodeURIComponent(id));});
        return response;
      }
      if(isQueuedMutation(request)){
        apiEpoch++;const response=await enqueueMutation(request);apiEpoch++;
        if(response.ok){try{const data=await response.clone().json();if(data.saved){const paths=url.pathname==='/api/media-register'?['/api/'+(await request.clone().json()).kind]:[url.pathname];for(const path of paths){writeBarrier.record(path,data.commit);await commitReadCache(null,async()=>{const compatible=compatibleMutationModel(path,data);if(!compatible)await durableDelete('api-read:v1:'+path);else await durableSet('api-read:v1:'+path,{body:new TextEncoder().encode(JSON.stringify(data)).buffer,status:200,headers:[['Content-Type','application/json']],savedAt:new Date().toISOString()});});}}}catch{/* Confirmed write is preserved even if cache update fails. */}}
        return response;
      }
      if(request.method==='POST'&&url.pathname==='/api/todos'){
        const response=await dispatch(request);
        if(response.ok){try{const data=await response.clone().json();if(data.saved){telemetry('github_write_confirmed',{category:categoryForPath(url.pathname)});writeBarrier.record(url.pathname,data.commit);await durableDelete(readCacheKey(new Request(url.href)));}}catch{/* The remote write remains confirmed. */}}
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
