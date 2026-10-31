import {durableGet,durableSet} from '@/platform/local-store';
import {github} from '@/lib/github';
import {bucket} from '@/lib/store';
import {buildPosterIndex,createPosterService} from '@/lib/repository-posters.mjs';
import {replicaReader} from '@/platform/mirror-access';

export const dynamic='force-dynamic';
const decode=(file:any)=>Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
const loadMirrorIndex=async()=>{
  const mirror=await replicaReader.current('databas');
  if(!mirror)return null;
  const movie=await replicaReader.json('databas','Media/poster-catalog.json');
  if(!movie)return null;
  const snapshot={commit:mirror.commit,truncated:false,tree:mirror.files.map((f:any)=>({...f,type:'blob'}))};
  try {
    const story=mirror.files.some((f:any)=>f.path==='Media/story-covers/catalog.json')
      ?await replicaReader.json('databas','Media/story-covers/catalog.json'):null;
    if(mirror.files.some((f:any)=>f.path==='Media/story-covers/catalog.json')&&!story)
      throw Error('Berättelseomslagens lokala katalog kunde inte verifieras.');
    return buildPosterIndex(snapshot,movie,story);
  } catch(error:any) {
    return {...buildPosterIndex(snapshot,movie),storyError:error?.message||'Berättelseomslagen kunde inte verifieras.'};
  }
};
const loadLiveIndex=async()=>{
  const client=github('databas'),snapshot=await client.snapshot();
  const file:any=await client.browse('Media/poster-catalog.json',snapshot.commit);
  if(file.encoding!=='base64'||typeof file.content!=='string')throw Error('Filmernas bildkatalog kunde inte läsas.');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  const movieCatalog=JSON.parse(decoder.decode(decode(file)));
  // Story media must never make the existing films/series poster service fail.
  try{
   const stories:any=await client.browse('Media/story-covers/catalog.json',snapshot.commit);
   if(stories.encoding!=='base64'||typeof stories.content!=='string')throw Error('Berättelsernas bildkatalog kunde inte läsas.');
   return buildPosterIndex(snapshot,movieCatalog,JSON.parse(decoder.decode(decode(stories))));
  }catch(error:any){
   console.warn('Berättelseomslag kunde inte uppdateras från GitHub:',error?.message||'Okänt fel');
   return {...buildPosterIndex(snapshot,movieCatalog),storyError:error?.message||'Berättelsernas bildkatalog kunde inte läsas.'};
  }
 };
const service=createPosterService({
 loadIndex:async()=>{
   try { const index=await loadMirrorIndex()||await loadLiveIndex(); await durableSet('posters:index:v1',index); return index; }
   catch(error) { const cached=await durableGet<any>('posters:index:v1'); if(cached)return cached; throw error; }
 },
 readBytes:async(entry:any,commit:string)=>{
  const file:any=await github('databas').browse(entry.path,commit);
  if(file.sha!==entry.sha||file.encoding!=='base64'||typeof file.content!=='string')throw Error('Omslagsbilden kunde inte läsas från rätt GitHub-version.');
  return decode(file);
 },
 readCache:async(sha:string)=>{const object=await bucket().get('github-posters/v1/'+sha)||await bucket().get('mirror/databas/'+sha);return object?new Uint8Array(await object.arrayBuffer()):null;},
 writeCache:async(sha:string,bytes:Uint8Array,mime:string)=>{await bucket().put('github-posters/v1/'+sha,bytes,{httpMetadata:{contentType:mime}});},
} as any);

// Sites' existing owner-private Dispatch boundary protects both images and registers.
export async function GET(request:Request){
 try{
  const params=new URL(request.url).searchParams;
  if(params.get('index')==='1'){
   const index=await service.index(params.get('refresh')==='1');
   return Response.json({revision:index.commit,available:{films:Object.keys(index.films),series:Object.keys(index.series),stories:Object.keys(index.stories)},storyError:index.storyError||null},{headers:{'Cache-Control':'no-store'}});
  }
  return await (service.image as any)(params.get('kind'),params.get('key'),request.headers.get('if-none-match'),params.get('v')||undefined);
 }catch(e:any){return Response.json({error:e.message||'Affischen kunde inte hämtas.'},{status:e.status||503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
}
