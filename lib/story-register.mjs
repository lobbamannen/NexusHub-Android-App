import {validateStoryPath} from './story-status.mjs';
export const STORY_REGISTER_PATH='Berattelser/register.json';
export const STORY_CATEGORIES=['Hemsökta hus','Historiska & paranormala mysterier','Internetmysterier & nätfenomen','True crime','Brott'];
export const emptyStoryRegister=()=>({schemaVersion:1,entries:{}});
export function validateStoryPatch(patch){
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw Error('Ändringen saknar fält.');
 const next={};
 for(const [key,value] of Object.entries(patch)){
  if(key==='title'){
   if(typeof value!=='string'||!value.trim()||value.length>240)throw Error('Ange en titel med högst 240 tecken.');
   next.title=value.trim();
  }else if(key==='category'){
   if(!STORY_CATEGORIES.includes(value))throw Error('Välj en befintlig berättelsekategori.');
   next.category=value;
  }else if(key==='rating'){
   if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<1||value>10||!Number.isInteger(value)))throw Error('Betyget måste vara ett heltal mellan 1 och 10, eller tomt.');
   next.rating=value;
  }else if(key==='review'){
   if(typeof value!=='string'||value.length>12000)throw Error('Omdömet får vara högst 12 000 tecken.');
   next.review=value.trim();
  }else if(key==='favorite'){
   if(typeof value!=='boolean')throw Error('Ogiltig favoritmarkering.');
   next.favorite=value;
  }else throw Error('Fältet får inte redigeras i berättelseregistret.');
 }
 return next;
}
export function validateStoryRegister(input){
 if(!input||input.schemaVersion!==1||!input.entries||typeof input.entries!=='object'||Array.isArray(input.entries)||Object.keys(input.entries).length>10000)throw Error('Okänt berättelseregisterformat.');
 for(const [path,row] of Object.entries(input.entries)){
  validateStoryPath(path);
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Ogiltig berättelsepost.');
  const known=Object.fromEntries(Object.entries(row).filter(([key])=>['title','category','rating','review','favorite'].includes(key)));
  if(Object.keys(known).length)validateStoryPatch(known);
 }
 // Preserve unknown historical fields; only explicitly allowed patches may change them.
 return input;
}
export function applyStoryEdits(register,edits,paths,at){
 validateStoryRegister(register);
 if(!Array.isArray(edits)||!edits.length||edits.length>200)throw Error('Ogiltig ändringslista.');
 const entries={...register.entries},seen=new Set();
 for(const edit of edits){
  const path=validateStoryPath(edit?.path);
  if(!paths.has(path)||seen.has(path))throw Error('Berättelsen saknas i GitHub eller förekommer flera gånger.');
  seen.add(path);
  const patch=validateStoryPatch(edit.changes);
  const row={...entries[path],...patch,updatedAt:at};
  if(Object.prototype.hasOwnProperty.call(patch,'rating'))delete row.ratingLabel;
  entries[path]=row;
 }
 return {...register,entries,lastUpdated:at};
}
export function withStoryMetadata(story,row){
 if(!row)return {...story,review:story.review||'',favorite:!!story.favorite};
 const hasRating=Object.prototype.hasOwnProperty.call(row,'rating');
 return {...story,title:row.title??story.title,category:row.category??story.category,
  numericRating:hasRating?row.rating:story.numericRating,
  ratingLabel:hasRating?(row.rating===null?(row.ratingLabel||'Inget registrerat betyg'):String(row.rating).replace('.',',')+'/10'):story.ratingLabel,
  review:row.review??story.review??'',favorite:row.favorite??story.favorite??false};
}
