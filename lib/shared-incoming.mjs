/** Temporary, user-deletable inbox. Only paths inside one UUID package may be mutated. */
export const INCOMING_ROOT='Mottagningsinkorg/';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sha=/^[a-f0-9]{40}$/;
const conflict=()=>Object.assign(Error('Mottagningsposten har ändrats i GitHub. Uppdatera och granska innan du raderar.'),{status:409});
const name=value=>String(value).normalize('NFC').replace(/[\\/\x00-\x1f\x7f]/g,'_').replace(/^\.+/,'').slice(-140)||'dokument';
export function incomingPrefix(id){if(!uuid.test(id))throw Error('Ogiltigt mottagnings-ID.');return INCOMING_ROOT+id+'/';}
export function incomingDocumentCount(items){return items.reduce((n,item)=>n+item.files.length+(item.text?.trim()?1:0),0);}
export function sharedIncomingGithub(repository,call,gitBlobSha,base64){
 const scope=()=>{if(repository!=='lobbamannen/Databas')throw Error('Mottagning hör endast till Databas.');};
 async function state(){scope();const head=(await(await call('/git/ref/heads/main')).json()).object?.sha;if(!sha.test(head||''))throw Error('GitHub-version saknas.');const commit=await(await call('/git/commits/'+head)).json();const tree=await(await call('/git/trees/'+head+'?recursive=1')).json();if(tree.truncated||!Array.isArray(tree.tree)||!sha.test(commit.tree?.sha||''))throw Error('Ofullständig mottagningslista.');return {head,base:commit.tree.sha,tree:tree.tree.filter(f=>f.type==='blob')};}
 async function bytes(hash){const f=await(await call('/git/blobs/'+hash)).json();if(f.sha!==hash||f.encoding!=='base64')throw Error('Mottagningsfilen kunde inte läsas.');const data=Uint8Array.from(atob(f.content.replace(/\s/g,'')),c=>c.charCodeAt(0));if(await gitBlobSha(data)!==hash)throw Error('Mottagningsfilens kontrollsumma avviker.');return data;}
 async function manifest(s,id){const prefix=incomingPrefix(id),entry=s.tree.find(f=>f.path===prefix+'metadata.json');if(!entry)return null;const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(entry.sha)));
  if(data.schemaVersion!==1||data.id!==id||typeof data.text!=='string'||!Number.isFinite(Date.parse(data.createdAt))||!Array.isArray(data.files))throw Error('Ogiltig mottagningsmetadata.');
  const paths=new Set([prefix+'metadata.json']),ids=new Set();for(const f of data.files){if(!uuid.test(f.id)||ids.has(f.id)||typeof f.name!=='string'||typeof f.mime!=='string'||f.path!==prefix+f.id+'-'+name(f.name)||!sha.test(f.sha)||!s.tree.some(x=>x.path===f.path&&x.sha===f.sha))throw Error('Mottagningspaketet är ofullständigt eller har ändrats.');paths.add(f.path);ids.add(f.id);}
  if(data.text.trim()){const p=prefix+'delad-text.txt',h=await gitBlobSha(new TextEncoder().encode(data.text));if(!s.tree.some(f=>f.path===p&&f.sha===h))throw Error('Den delade texten har ändrats.');paths.add(p);}
  if(s.tree.some(f=>f.path.startsWith(prefix)&&!paths.has(f.path)))throw conflict();
  return {metadata:data,entries:s.tree.filter(f=>paths.has(f.path)).map(f=>({path:f.path,sha:f.sha})),manifestSha:entry.sha,commit:s.head};
 }
 async function commit(s,entries,message){const tree=await(await call('/git/trees',{method:'POST',body:JSON.stringify({base_tree:s.base,tree:entries})})).json();const c=await(await call('/git/commits',{method:'POST',body:JSON.stringify({message,tree:tree.sha,parents:[s.head]})})).json();if(!sha.test(c.sha||''))throw Error('GitHub bekräftade inte mottagningsändringen.');await call('/git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:c.sha,force:false})});return c.sha;}
 return {
  async listSharedIncoming(){const s=await state(),items=[],ids=new Set(s.tree.filter(f=>f.path.startsWith(INCOMING_ROOT)).map(f=>f.path.slice(INCOMING_ROOT.length).split('/')[0]).filter(id=>uuid.test(id)));for(const id of ids){const item=await manifest(s,id);if(!item)throw Error('Mottagningspaketet '+id+' saknar metadata. Filerna behålls och behöver kontrolleras.');items.push(item);}return {items,commit:s.head};},
  async readSharedIncomingFile(id,fileId){const s=await state(),m=await manifest(s,id),file=m?.metadata.files.find(f=>f.id===fileId);if(!file)throw Error('Mottagningsfilen saknas.');return {base64:base64(await bytes(file.sha)),sha:file.sha};},
  async saveSharedIncoming(input){scope();const prefix=incomingPrefix(input.id);if(typeof input.text!=='string'||!Number.isFinite(Date.parse(input.createdAt))||!Array.isArray(input.files)||!input.files.length&&!input.text.trim())throw Error('Ogiltig mottagningspost.');const entries=[],files=[],ids=new Set();
   for(const f of input.files){if(!uuid.test(f.id)||ids.has(f.id)||typeof f.name!=='string'||typeof f.mime!=='string'||typeof f.base64!=='string')throw Error('Ogiltig mottagningsfil.');ids.add(f.id);const data=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0)),hash=await gitBlobSha(data),path=prefix+f.id+'-'+name(f.name);files.push({id:f.id,name:f.name,mime:f.mime,path,sha:hash});entries.push({path,data,sha:hash});}
   if(input.text.trim()){const data=new TextEncoder().encode(input.text);entries.push({path:prefix+'delad-text.txt',data,sha:await gitBlobSha(data)});}
   const metadata={schemaVersion:1,id:input.id,text:input.text,createdAt:input.createdAt,files},data=new TextEncoder().encode(JSON.stringify(metadata,null,2)+'\n');entries.push({path:prefix+'metadata.json',data,sha:await gitBlobSha(data)});
   const s=await state(),current=s.tree.filter(f=>f.path.startsWith(prefix));
   if(current.length){if(current.length!==entries.length||!entries.every(e=>current.some(f=>f.path===e.path&&f.sha===e.sha)))throw conflict();return {...await manifest(s,input.id),saved:true,reconciled:true};}
   // A committed then deleted package must never be resurrected after a lost response.
   const history=await(await call('/commits?path='+encodeURIComponent(prefix+'metadata.json')+'&per_page=1')).json();if(!Array.isArray(history))throw Error('Mottagningshistoriken kunde inte kontrolleras.');if(history.length)return {deleted:true,id:input.id};
   const tree=[];for(const e of entries){const blob=await(await call('/git/blobs',{method:'POST',body:JSON.stringify({content:base64(e.data),encoding:'base64'})})).json();if(blob.sha!==e.sha)throw Error('GitHub bekräftade inte filens bytes.');tree.push({path:e.path,mode:'100644',type:'blob',sha:e.sha});}
   const committed=await commit(s,tree,'NexusHub: mottaget tillfälligt material');const after=await state(),result=await manifest(after,input.id);if(!result)throw Error('Mottagningskopian kunde inte återläsas.');if(result.manifestSha!==entries.at(-1).sha)throw conflict();return {...result,saved:true,commit:committed};
  },
  async deleteSharedIncoming(id,expected){const prefix=incomingPrefix(id);if(!Array.isArray(expected)||expected.some(f=>!f.path?.startsWith(prefix)||!sha.test(f.sha||'')))throw Error('Ogiltigt raderingsunderlag.');const s=await state(),current=s.tree.filter(f=>f.path.startsWith(prefix));if(!current.length)return {deleted:true,id,reconciled:true};if(current.length!==expected.length||!current.every(f=>expected.some(e=>e.path===f.path&&e.sha===f.sha)))throw conflict();const committed=await commit(s,current.map(f=>({path:f.path,mode:'100644',type:'blob',sha:null})),'NexusHub: radera tillfällig mottagning');const after=await state();if(after.tree.some(f=>f.path.startsWith(prefix)))throw conflict();return {deleted:true,id,commit:committed};}
 };
}
