// Registry array order is insertion order: edits preserve position, creates append.
// This is not release-year sorting. Missing poster identifiers are skipped.
import {matchesGenreGroup} from './genre-taxonomy.mjs';
/** @param {string[] | null} [availableKeys] */
export function recentGenrePosters(entries=[],kind='films',limit=4,availableKeys=null){
 /** @type {Record<string,{key:string,title:string}[]>} */
 const result={};
 if(!Array.isArray(entries))return result;
 const available=Array.isArray(availableKeys)?new Set(availableKeys):null;
 // Only create previews for real genre groups used by the UI.
 for(const id of ['dokumentar','kriminal','reality','skrack','scifi','action','fantasy','drama','komedi','natur','livsstil','ovrigt']){
  const posters=[],seen=new Set();
  for(let i=entries.length-1;i>=0&&posters.length<limit;i--){
   const item=entries[i];
   if(!matchesGenreGroup(item,id))continue;
   const key=typeof item?.imdbId==='string'&&/^tt\d{7,9}$/.test(item.imdbId)?item.imdbId:kind==='series'&&item?.title&&Number.isInteger(item.startYear)?item.title+'|'+item.startYear:null;
   if(!key||seen.has(key)||(available&&!available.has(key)))continue;
   seen.add(key);posters.push({key,title:item.title});
  }
  if(posters.length)result['genregroup:'+id]=posters;
 }
 return result;
}
