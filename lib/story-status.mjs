// Read state always comes from GitHub. This module contains only deterministic schema rules.
export const STORY_STATUS_PATH='Berattelser/lasstatus.json';
export const STORY_STATUS_VERSION=1;
export function validateStoryPath(path){
 if(typeof path!=='string'||path.length>700||path!==path.normalize('NFC')||/[\\\x00-\x1f\x7f]/.test(path))throw Error('Ogiltig berättelsesökväg.');
 const parts=path.split('/');
 if(parts.length!==3||parts[0]!=='Berattelser'||!parts[1]||!parts[2].endsWith('.md')||parts.some(x=>x==='.'||x==='..')||parts[2]==='lasstatus.md')throw Error('Markeringar kan bara sparas för Markdown-berättelser.');
 return path;
}
export function emptyStoryStatus(){return {schemaVersion:STORY_STATUS_VERSION,entries:{}};}
export function validateStoryStatus(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.schemaVersion!==1||!input.entries||typeof input.entries!=='object'||Array.isArray(input.entries))throw Error('GitHubs lässtatusregister har ett okänt format.');
 if(Object.keys(input.entries).length>10000)throw Error('För många lässtatusposter.');
 const entries=Object.create(null);
 for(const [path,row] of Object.entries(input.entries)){
  validateStoryPath(path);
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.saved!=='boolean'||typeof row.read!=='boolean'||typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('Felaktig markering i GitHubs register.');
  entries[path]={saved:row.saved,read:row.read,updatedAt:row.updatedAt};
 }
 return {schemaVersion:1,entries};
}
export function applyStoryStatus(register,input,at){
 const current=validateStoryStatus(register);
 if(!Number.isFinite(Date.parse(at)))throw Error('Ogiltig ändringstid.');
 if(input?.action==='set'){
  const path=validateStoryPath(input.path);
  if(!['saved','read'].includes(input.field)||typeof input.value!=='boolean')throw Error('Ogiltig läsmarkering.');
  const row=current.entries[path]||{saved:false,read:false,updatedAt:at};
  current.entries[path]={...row,[input.field]:input.value,updatedAt:at};
 }else if(input?.action==='migrate'){
  if(!Array.isArray(input.paths)||input.paths.length>200)throw Error('Ogiltig lokal markering.');
  for(const item of input.paths){
   const path=validateStoryPath(item.path);
   if(typeof item.saved!=='boolean'||typeof item.read!=='boolean')throw Error('Ogiltigt migrationsvärde.');
   const row=current.entries[path]||{saved:false,read:false,updatedAt:at};
   // Migration may only add historical true flags, never undo newer GitHub states.
   current.entries[path]={saved:row.saved||item.saved,read:row.read||item.read,updatedAt:at};
  }
 }else throw Error('Okänd lässtatusåtgärd.');
 return current;
}
