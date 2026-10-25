import {gitBlobSha} from './github-inbox.mjs';

export const POSTER_LIMIT=500000;
const fail=(message,status=502)=>{throw Object.assign(Error(message),{status});};
const imdb=/^tt\d{7,9}$/;
const filename=/^[a-z0-9-]+\.(jpg|webp|png)$/;
const storyCoverPath=/^Media\/story-covers\/([a-z0-9-]+)\.(jpg|webp|png)$/;
const storyMarkdownPath=/^Berattelser\/[^/]+\/[^/]+\.md$/;

// Only image paths present in a complete, commit-pinned GitHub tree can be served.
export function buildPosterIndex(snapshot,catalog={},storyCatalog=null){
 if(snapshot.truncated||!Array.isArray(snapshot.tree)||!/^[a-f0-9]{40}$/.test(snapshot.commit||''))fail('GitHubs bildindex är ofullständigt.');
 const index={commit:snapshot.commit,films:Object.create(null),series:Object.create(null),stories:Object.create(null)},files=new Map();
 for(const entry of snapshot.tree){
  const match=entry.path?.match(/^Media\/posters\/(films|series)\/([a-z0-9-]+)\.(jpg|webp|png)$/);
  if(!match||entry.type!=='blob'||entry.mode==='120000')continue;
  if(!/^[a-f0-9]{40}$/.test(entry.sha||'')||!Number.isInteger(entry.size)||entry.size<1||entry.size>POSTER_LIMIT)fail('Affischen har ogiltig hash eller storlek: '+entry.path);
  files.set(entry.path,entry);
  if(imdb.test(match[2])){
   if(index[match[1]][match[2]])fail('Flera affischfiler har samma IMDb-ID: '+match[2]);
   index[match[1]][match[2]]=entry;
  }
 }
 for(const [kind,entries] of [['films',catalog.manualMoviePosters||[]],['series',catalog.manualSeriesPosters||[]]]){
  if(!Array.isArray(entries))fail('Ogiltig manuell bildkatalog.');
  for(const item of entries){
   if(!filename.test(item.file||'')||typeof item.title!=='string'||!item.title.trim()||item.title.length>250||!Number.isInteger(item.year))fail('Ogiltig manuell affischreferens.');
   const entry=files.get('Media/posters/'+kind+'/'+item.file);if(!entry)fail('Manuell affisch saknas: '+item.file);
   index[kind][item.title+'|'+item.year]=entry;
   if(item.imdbId){if(!imdb.test(item.imdbId))fail('Ogiltigt IMDb-ID i bildkatalogen.');index[kind][item.imdbId]=entry;}
  }
 }
 if(storyCatalog!==null){
  if(storyCatalog.schemaVersion!==1||!Array.isArray(storyCatalog.covers))fail('Ogiltig katalog för berättelseomslag.');
  const storyFiles=new Map(snapshot.tree.filter(e=>e.type==='blob'&&e.mode!=='120000'&&storyMarkdownPath.test(e.path||'')).map(e=>[e.path,e]));
  const covers=new Map(),seenIds=new Set();
  for(const item of storyCatalog.covers){
   if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)||
      typeof item.storyMarkdownPath!=='string'||!storyMarkdownPath.test(item.storyMarkdownPath)||
      typeof item.file!=='string'||!storyCoverPath.test(item.file))fail('Ogiltig referens till berättelseomslag.');
   const match=item.file.match(storyCoverPath);
   if(match[1]!==item.id||seenIds.has(item.id)||covers.has(item.storyMarkdownPath))fail('Dubbla eller felkopplade berättelseomslag: '+item.id);
   if(!storyFiles.has(item.storyMarkdownPath))fail('Berättelsen saknas i GitHub: '+item.storyMarkdownPath);
   const entry=snapshot.tree.find(e=>e.path===item.file&&e.type==='blob'&&e.mode!=='120000');
   if(!entry||!/^[a-f0-9]{40}$/.test(entry.sha||'')||!Number.isInteger(entry.size)||entry.size<1||entry.size>POSTER_LIMIT||
      !Number.isInteger(item.bytes)||item.bytes!==entry.size)fail('Berättelseomslaget saknas eller har fel storlek: '+item.file);
   seenIds.add(item.id);covers.set(item.storyMarkdownPath,entry);
  }
  for(const [path,entry] of covers)index.stories[path]=entry;
 }
 return index;
}

export function posterMime(bytes){
 const b=new Uint8Array(bytes);
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'image/webp';
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
 fail('GitHub-filen är inte en giltig affischbild.');
}

export function createPosterService({loadIndex,readBytes,readCache=async()=>null,writeCache=async()=>{},now=Date.now}){
 let current=null,expires=0,pending=null;const imagePending=new Map();
 const index=async(refresh=false)=>{
  if(pending)return pending;
  if(!refresh&&current&&now()<expires)return current;
  pending=(async()=>{const next=await loadIndex();current=next;expires=now()+60000;return next;})();
  try{return await pending;}finally{pending=null;}
 };
 const verified=async(entry,bytes)=>{
  const value=new Uint8Array(bytes);
  if(value.byteLength!==entry.size||value.byteLength>POSTER_LIMIT||await gitBlobSha(value)!==entry.sha)fail('Affischens bildhash matchar inte GitHub.');
  return {bytes:value,mime:posterMime(value)};
 };
 const image=async(kind,key,ifNoneMatch=null,revision=null)=>{
  if(!['films','series','stories'].includes(kind))fail('Ogiltig bildtyp.',400);
  if(typeof key!=='string'||key.length>300||!key)fail('Ogiltig bildnyckel.',400);
  let source=await index();
  if(/^[a-f0-9]{40}$/.test(revision||'')&&source.commit!==revision)source=await index(true);
  const entry=source[kind][key];
  if(!entry)fail('Affischen finns inte i GitHub.',404);
  const etag='"'+entry.sha+'"';
  const headers=new Headers({'Cache-Control':'private, max-age=60','ETag':etag,'X-Content-Type-Options':'nosniff','X-Nexus-Poster-Source':'github','X-Nexus-Poster-Commit':source.commit});
  if(ifNoneMatch?.split(',').some(tag=>tag.trim().replace(/^W\//,'')===etag))return new Response(null,{status:304,headers});
  if(!imagePending.has(entry.sha))imagePending.set(entry.sha,(async()=>{
   // Immutable blob keys keep replacements fresh and survive Worker restarts.
   let cached=null;try{cached=await readCache(entry.sha);}catch{}
   if(cached){try{return await verified(entry,cached);}catch{/* Re-fetch a damaged cache object. */}}
   const value=await verified(entry,await readBytes(entry,source.commit));
   try{await writeCache(entry.sha,value.bytes,value.mime);}catch{/* Cache outage must not hide a valid GitHub image. */}
   return value;
  })());
  let value;try{value=await imagePending.get(entry.sha);}finally{imagePending.delete(entry.sha);}
  headers.set('Content-Type',value.mime);headers.set('Content-Length',String(value.bytes.length));
  return new Response(value.bytes,{headers});
 };
 return {index,image};
}
