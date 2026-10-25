import {github} from '@/lib/github';
import {bucket} from '@/lib/store';
import {buildPosterIndex,createPosterService} from '@/lib/repository-posters.mjs';

export const dynamic='force-dynamic';
const decode=(file:any)=>Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
const service=createPosterService({
 loadIndex:async()=>{
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
 },
 readBytes:async(entry:any,commit:string)=>{
  const file:any=await github('databas').browse(entry.path,commit);
  if(file.sha!==entry.sha||file.encoding!=='base64'||typeof file.content!=='string')throw Error('Omslagsbilden kunde inte läsas från rätt GitHub-version.');
  return decode(file);
 },
 readCache:async(sha:string)=>{const object=await bucket().get('github-posters/v1/'+sha);return object?new Uint8Array(await object.arrayBuffer()):null;},
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
