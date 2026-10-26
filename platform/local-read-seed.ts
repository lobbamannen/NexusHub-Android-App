import {db,bucket} from '@/lib/store';
import {gitBlobSha} from '@/lib/github-inbox.mjs';
import {makeCatalog} from '@/lib/catalog.mjs';
import {mirrorManifest} from '@/lib/mirror';
export async function localReadSeed(path:string){
 const files:Record<string,[string,string]>={'/api/films':['Filmer/register.json','register'],'/api/series':['Serier/register.json','register'],'/api/story-register':['Berattelser/register.json','register'],'/api/story-status':['Berattelser/lasstatus.json','register'],'/api/document-bookmarks':['System/nexus-bookmarks.json','register'],'/api/calendar':['Kalender/egna-handelser.json','data'],'/api/series-watch-settings':['Serier/bevakning-installningar.json','data'],'/api/watch-history':['Serier/Bevakning/handelser.json','data'],'/api/media-additions':['System/NexusHub/tillaggsdatum.json','data']};
 if(path==='/api/portal/overview'){const m=await mirrorManifest('databas');if(!m)return null;return {repositories:{databas:makeCatalog({tree:m.files.map((f:any)=>({...f,type:'blob'})),commit:m.commit,fetchedAt:m.fetchedAt})},errors:[],localSeed:true};}
 const spec=files[path];if(!spec)return null;
 const m=await mirrorManifest('databas'),sha=m?.files.find((f:any)=>f.path===spec[0])?.sha;
 const row=await db().prepare('SELECT object_key,blob_sha FROM mirror_versions WHERE repo=? AND path=?'+(sha?' AND blob_sha=?':'')+' ORDER BY verified_at DESC LIMIT 1').bind(...(sha?['databas',spec[0],sha]:['databas',spec[0]])).first<any>();if(!row)return null;const object=await bucket().get(row.object_key);if(!object)return null;const bytes=await object.arrayBuffer();if(await gitBlobSha(bytes)!==row.blob_sha)return null;
 return {sha:row.blob_sha,[spec[1]]:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))};
}
