import { github, invalidatePortalCache } from '@/lib/github';
import { saveMirror } from '@/lib/mirror';
import { bucket } from '@/lib/store';
import { durableGet, durableSet } from './local-store';
import { hasGithubToken } from './env';
import { invalidateMedia } from '@/lib/media-client';

type File = { path: string; sha: string; size: number; type: string };
export type ReplicaStatus = { running: boolean; done: number; total: number; checkedAt?: string; error?: string };
let state: ReplicaStatus = {running:false,done:0,total:0};
let running=false, installed=false, cooldown=0;
export const replicaStatus = () => state;
const report = (patch: Partial<ReplicaStatus>) => { state={...state,...patch}; window.dispatchEvent(new Event('nexus-replica-status')); };
// Only knowledge content is excluded; metadata in the Git tree is still needed.
export const replicatePath = (path: string) => !/^Kunskap(?:\/|$)/i.test(path);
async function primeViews() {
    invalidateMedia(); invalidatePortalCache();
    for (const url of ['/api/films','/api/series','/api/story-register','/api/story-status','/api/document-bookmarks','/api/economy','/api/ideas','/api/portal/overview?refresh=1','/api/posters?index=1&refresh=1']) {
        const response=await fetch(url);
        if(!response.ok || response.headers.get('X-Nexus-Offline') === 'true') throw Error('Kunde inte uppdatera '+url.split('?')[0]+'. Den lokala kopian behålls.');
        await response.arrayBuffer();
    }
    window.dispatchEvent(new Event('nexus-github-changed'));
}
async function cycle() {
    if(running || !hasGithubToken() || document.visibilityState !== 'visible' || Date.now()<cooldown) return;
    running=true; report({running:true,error:''});
    try {
        for(const repo of ['databas','plugins']) {
            const client=github(repo), head=await client.head();
            const previous=await durableGet<{commit:string}>('replica-complete:v1:'+repo);
            if(previous?.commit===head) continue;
            const snapshot=await client.snapshot();
            if(snapshot.truncated) throw Error('GitHub gav ett ofullständigt filträd. Ingen fullständig synk markeras.');
            const files: File[]=snapshot.tree.filter((f:File)=>f.type==='blob' && (repo!=='databas'||replicatePath(f.path)));
            const index=await durableGet<Record<string,string>>('replica-files:v1:'+repo)||{};
            const missing:File[]=[];
            for(const file of files) {
                if(index[file.path]!==file.sha || !await bucket().get('mirror/'+repo+'/'+file.sha)) missing.push(file);
            }
            report({done:files.length-missing.length,total:files.length});
            // Warm current registers before a potentially long initial image/document download.
            if(repo==='databas') await primeViews();
            for(let offset=0;offset<missing.length;offset+=4) {
                if(document.visibilityState!=='visible') return;
                const results=await Promise.allSettled(missing.slice(offset,offset+4).map(async file=>{
                    const bytes=await client.blob(file.sha);
                    await saveMirror(repo,{...file,fetchedAt:snapshot.fetchedAt},bytes.buffer as ArrayBuffer,snapshot.commit);
                    return file;
                }));
                let failure:unknown;
                for(const result of results) {
                    if(result.status==='fulfilled') {index[result.value.path]=result.value.sha;report({done:state.done+1});}
                    else failure=result.reason;
                }
                await durableSet('replica-files:v1:'+repo,index);
                if(failure) throw failure;
                // Yield between batches so editing and navigation stay responsive.
                await new Promise(resolve=>setTimeout(resolve,0));
            }
            // Keep older bytes as history, but record the exact current file inventory.
            await durableSet('replica-inventory:v1:'+repo,{commit:snapshot.commit,files});
            await primeViews();
            await durableSet('replica-complete:v1:'+repo,{commit:snapshot.commit,at:new Date().toISOString()});
        }
        report({checkedAt:new Date().toISOString(),error:''});
    } catch(error:any) {
        cooldown=Date.now()+60000;
        report({error:error.message||'Lokal kopiering kunde inte slutföras. Försöker igen.'});
    } finally {running=false;report({running:false});}
}
export function startReplicaSync() {
    if(installed) return; installed=true;
    void cycle();
    window.setInterval(()=>void cycle(),15000);
    const wake=()=>{cooldown=0;void cycle();};
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wake();});
    window.addEventListener('online',wake);
    window.addEventListener('nexus-credentials-changed',wake);
    window.addEventListener('nexus-write-completed',wake);
}
