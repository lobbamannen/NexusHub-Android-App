import {replicaReader} from './mirror-access';
import {buildPosterIndex} from '@/lib/repository-posters.mjs';
/** One completed snapshot, actual poster paths, no stale poster-service fallback. */
export async function guardianAssets(){
 const snapshot=await replicaReader.current('databas');if(!snapshot)throw Error('Affischkontrollen väntar på en komplett lokal inventering.');
 const read=async(path:string)=>{const f=await replicaReader.file('databas',path);if(!f||f.commit!==snapshot.commit)throw Error('Kontrollfilen kunde inte verifieras: '+path);return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(f.bytes));};
 const [films,series,catalog]=await Promise.all([read('Filmer/register.json'),read('Serier/register.json'),read('Media/poster-catalog.json')]);
 const index=buildPosterIndex({...snapshot,tree:snapshot.files.map((f:any)=>({...f,type:'blob'}))},catalog);
 const missing:string[]=[],incomplete:string[]=[];
 for(const [kind,register]of [['films',films.films],['series',series.series]]as const){if(!Array.isArray(register))throw Error('Mediaregistret har ett okänt format.');for(const item of register){const key=item.imdbId||item.title+'|'+(item.startYear??item.year??'');if(!(index as any)[kind][key])missing.push(item.displayTitle||item.title||'Namnlös titel');if(!item.title||!(item.startYear??item.year))incomplete.push(item.title||'Namnlös titel');}}
 if((await replicaReader.current('databas'))?.commit!==snapshot.commit)throw Error('Databasen ändrades under affischkontrollen.');
 return {missing,incomplete,commit:snapshot.commit};
}
