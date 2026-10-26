import {ideaDay} from './idea-numbers.mjs';
import {makeCatalog} from './catalog.mjs';
import {storyList} from './stories.mjs';
const cache=new Map();
// Locate the actual Stockholm midnight, including summer/winter time.
export function stockholmDayStart(day){
 let low=Date.parse(day+'T00:00:00Z')-86400000,high=low+172800000;
 while(low<high){const mid=Math.floor((low+high)/2);if(ideaDay(new Date(mid).toISOString())<day)low=mid+1;else high=mid;}
 return new Date(low).toISOString();
}
export function addedIdentities(current,previous,key){
 const before=new Set(previous.map(key)),after=new Set(current.map(key));
 return [...after].filter(id=>id&&!before.has(id)).length;
}
const mediaKey=x=>String(x.imdbId||x.id||((x.title||'').trim().toLocaleLowerCase('sv')+'|'+(x.year??x.startYear??'')));
export function dailyActivityGithub(repository,call,gitBlobSha){return {async dailyActivity(){
 if(repository!=='lobbamannen/Databas')throw Error('Aktivitet hör till Databas.');
 const day=ideaDay(new Date().toISOString()),head=(await (await call('/git/ref/heads/main')).json()).object?.sha;
 if(!/^[a-f0-9]{40}$/.test(head||''))throw Error('GitHub-version saknas.');
 const cacheKey=repository+':'+head+':'+day;
 if(cache.has(cacheKey))return cache.get(cacheKey);
 const until=new Date(Date.parse(stockholmDayStart(day))-1).toISOString();
 const history=await (await call('/commits?sha='+head+'&until='+encodeURIComponent(until)+'&per_page=1')).json();
 if(!Array.isArray(history))throw Error('Dagshistoriken kunde inte läsas.');
 const before=history[0]?.sha;
 async function tree(ref){if(!ref)return [];const data=await (await call('/git/trees/'+ref+'?recursive=1')).json();if(data.truncated||!Array.isArray(data.tree))throw Error('Ofullständigt filträd.');return data.tree;}
 const [currentTree,previousTree]=await Promise.all([tree(head),tree(before)]);
 async function register(files,path,key){const file=files.find(f=>f.path===path&&f.type==='blob');if(!file)return [];const b=await (await call('/git/blobs/'+file.sha)).json();if(b.encoding!=='base64')throw Error('Registret kunde inte läsas.');const bytes=Uint8Array.from(atob(b.content.replace(/\s/g,'')),c=>c.charCodeAt(0));if(await gitBlobSha(bytes)!==file.sha)throw Error('Fel kontrollsumma.');const data=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(data[key]))throw Error('Okänt registerformat.');return data[key];}
 const counts={},unavailable=[];
 await Promise.all([['films','Filmer/register.json','films'],['series','Serier/register.json','series']].map(async([name,path,key])=>{try{const [current,previous]=await Promise.all([register(currentTree,path,key),register(previousTree,path,key)]);counts[name]=addedIdentities(current,previous,mediaKey);}catch{unavailable.push(name);}}));
 const stories=files=>storyList(makeCatalog({tree:files}).documents);
 counts.stories=addedIdentities(stories(currentTree),stories(previousTree),x=>x.path.replace(/\.(md|docx)$/i,''));
 const result={day,head,counts,unavailable,checkedAt:new Date().toISOString()};
 // Partial failures are retried, never cached as a false zero.
 if(!unavailable.length){cache.clear();cache.set(cacheKey,result);}
 return result;
}};}
