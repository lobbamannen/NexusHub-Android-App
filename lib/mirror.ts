import {db,bucket,sha256,now} from './store';
import {gitBlobSha} from './github-inbox.mjs';
import {readableRecord,REPOSITORIES} from './catalog.mjs';
// Immutable content-addressed versions. Never edits entries/files or writes to GitHub.
const LIMIT=Number.POSITIVE_INFINITY;
const textFile=(path:string)=>/\.(md|txt|json|csv|ya?ml|xml|log|rst|js|mjs|ts|tsx|jsx|py|toml|html|css|sh)$/i.test(path)||/(^|\/)(LICENSE|README)$/i.test(path);
export async function mirrorManifest(repo='databas'){const r=await db().prepare('SELECT value FROM settings WHERE key=?').bind('mirror_manifest:'+repo).first<any>();return r?JSON.parse(r.value):null;}
export function renderMirror(bytes:ArrayBuffer,path:string,metadata:any){let body='',title=path.split('/').pop()||path,structured=false;if(textFile(path)){try{body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return {...metadata,path,name:path.split('/').pop(),title,body:'',structured:false,type:'file',readOnly:true,textWarning:'Originalet är bevarat men kan inte visas som UTF-8-text.'};}if(/\.md$/i.test(path))title=body.match(/^#\s+([^\n]+)/m)?.[1]||title;if(/\.json$/i.test(path)){const r=readableRecord(body);body=r.body;title=r.title||title;structured=r.structured;}}return {...metadata,path,name:path.split('/').pop(),title,body,structured,type:'file',readOnly:true};}
async function observe(repo:string,path:string,sha:string,observedAt:string){await db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE json_extract(settings.value,'$.observedAt')<=json_extract(excluded.value,'$.observedAt')").bind('mirror_head:'+repo+':'+path,JSON.stringify({sha,observedAt})).run();}
async function latest(repo:string,path:string,sha?:string){return await db().prepare('SELECT * FROM mirror_versions WHERE repo=? AND path=?'+(sha?' AND blob_sha=?':'')+' ORDER BY verified_at DESC LIMIT 1').bind(...(sha?[repo,path,sha]:[repo,path])).first<any>();}
async function unpack(row:any){const object=await bucket().get(row.object_key);if(!object)throw Error('Spegelns original saknas.');const bytes=await object.arrayBuffer();if(await sha256(bytes)!==row.content_hash||await gitBlobSha(bytes)!==row.blob_sha)throw Error('Spegelns kontrollsumma stämmer inte.');if(row.text_indexed===0&&textFile(row.path))return renderMirror(bytes,row.path,JSON.parse(row.document));return JSON.parse(row.document);}
export async function saveMirror(repo:string,file:any,bytes:ArrayBuffer,commit:string,key?:string){
 if(bytes.byteLength!==file.size||await gitBlobSha(bytes)!==file.sha)throw Error('GitHub-filens storlek eller kontrollsumma stämmer inte. Ingen spegelversion ersattes.');
 const hash=await sha256(bytes),objectKey=key||'mirror/'+repo+'/'+file.sha;
 if(!key)await bucket().put(objectKey,bytes);
 const verifiedAt=now(),document=renderMirror(bytes,file.path,{repoKey:repo,sha:file.sha,commit,size:file.size,url:'https://github.com/'+(REPOSITORIES as any)[repo]+'/blob/'+commit+'/'+file.path,fetchedAt:verifiedAt,origin:'github-mirror'});
 const indexed=new TextEncoder().encode(document.body).length<350000;
 await db().prepare('INSERT INTO mirror_versions(repo,path,blob_sha,commit_sha,object_key,content_hash,size,document,body,text_indexed,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repo,path,blob_sha) DO NOTHING').bind(repo,file.path,file.sha,commit,objectKey,hash,bytes.byteLength,JSON.stringify({...document,body:indexed?document.body:''}),indexed?document.body:'',indexed?1:0,verifiedAt).run();
 await observe(repo,file.path,file.sha,file.fetchedAt||verifiedAt);
 return {...document,mirror:{state:'verified',verifiedAt,contentHash:hash}};
}
// Repair creates a fresh R2 object, verifies its actual bytes, then repoints the
// exact existing version (if any). Older GitHub blob revisions remain untouched.
export async function repairMirrorVersion(repo:string,file:any,bytes:ArrayBuffer,commit:string){
 if(!(REPOSITORIES as any)[repo]||!file||typeof file.path!=='string'||file.size!==bytes.byteLength||!/^[a-f0-9]{40}$/.test(file.sha||'')||await gitBlobSha(bytes)!==file.sha)throw Error('Originalet kunde inte verifieras mot GitHubs filhash.');
 if(bytes.byteLength>LIMIT)throw Error('Filen överskrider nuvarande säkerhetsgräns för spegeln.');
 const hash=await sha256(bytes),objectKey='mirror/repairs/'+repo+'/'+file.sha+'/'+crypto.randomUUID();
 await bucket().put(objectKey,bytes);
 // Do not change D1 pointers before R2's newly written object passes both hashes.
 const check=await bucket().get(objectKey);
 if(!check)throw Error('Den reparerade R2-filen saknas efter skrivningen.');
 const saved=await check.arrayBuffer();
 if(saved.byteLength!==bytes.byteLength||await sha256(saved)!==hash||await gitBlobSha(saved)!==file.sha)throw Error('Ny R2-kopia kunde inte verifieras. Tidigare registerpost lämnades orörd.');
 const verifiedAt=now(),document=renderMirror(saved,file.path,{repoKey:repo,sha:file.sha,commit,size:file.size,url:'https://github.com/'+(REPOSITORIES as any)[repo]+'/blob/'+commit+'/'+file.path,fetchedAt:verifiedAt,origin:'github-mirror'});
 const indexed=new TextEncoder().encode(document.body||'').length<350000;
 await db().prepare('INSERT INTO mirror_versions(repo,path,blob_sha,commit_sha,object_key,content_hash,size,document,body,text_indexed,verified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repo,path,blob_sha) DO UPDATE SET commit_sha=excluded.commit_sha,object_key=excluded.object_key,content_hash=excluded.content_hash,size=excluded.size,document=excluded.document,body=excluded.body,text_indexed=excluded.text_indexed,verified_at=excluded.verified_at').bind(repo,file.path,file.sha,commit,objectKey,hash,saved.byteLength,JSON.stringify({...document,body:indexed?document.body:''}),indexed?document.body:'',indexed?1:0,verifiedAt).run();
 const row=await latest(repo,file.path,file.sha);
 if(!row||row.object_key!==objectKey)throw Error('R2 verifierades men D1-uppdateringen kunde inte bekräftas.');
 await unpack(row);
 await observe(repo,file.path,file.sha,file.fetchedAt||verifiedAt);
 return {...document,mirror:{state:'verified',verifiedAt,contentHash:hash,repaired:true}};
}
export async function mirroredRead(repo:string,path:string,client:any){
 try{const metadata:any=await client.browse(path);
 if(metadata.type!=='file')return null;
 const cached=await latest(repo,path,metadata.sha);
 if(cached){await observe(repo,path,metadata.sha,metadata.fetchedAt||now());try{return {...await unpack(cached),...metadata,content:undefined,origin:'github-mirror',mirror:{state:'verified',verifiedAt:cached.verified_at,lastTreeVerifiedAt:metadata.fetchedAt,checkedAt:metadata.fetchedAt,contentHash:cached.content_hash}};}catch(localError:any){if(metadata.size>LIMIT)throw localError;try{const bytes=metadata.encoding==='base64'&&typeof metadata.content==='string'?Uint8Array.from(atob(metadata.content.replace(/\s/g,'')),c=>c.charCodeAt(0)).buffer:await (await client.original(path,metadata.commit)).response.arrayBuffer();const repaired=await repairMirrorVersion(repo,metadata,bytes,metadata.commit);return {...repaired,mirror:{...repaired.mirror,checkedAt:metadata.fetchedAt}};}catch{throw Error('GitHub svarar, men den lokala spegeln avviker och kunde inte repareras.');}}}
 if(metadata.size>LIMIT)return null;
 let bytes:ArrayBuffer;
 if(metadata.encoding==='base64'&&typeof metadata.content==='string')bytes=Uint8Array.from(atob(metadata.content.replace(/\s/g,'')),c=>c.charCodeAt(0)).buffer;
 else bytes=await (await client.original(path,metadata.commit)).response.arrayBuffer();
 return await saveMirror(repo,metadata,bytes,metadata.commit);
 }catch(e:any){return await fallbackMirror(repo,path,e);}
}
async function fallbackMirror(repo:string,path:string,e:any){
  const manifest=await mirrorManifest(repo),remote=manifest?.files?.find((f:any)=>f.path===path),headRow=await db().prepare('SELECT value FROM settings WHERE key=?').bind('mirror_head:'+repo+':'+path).first<any>(),head=headRow?JSON.parse(headRow.value):null;const wanted=head&&(!remote||head.observedAt>=manifest.fetchedAt)?head.sha:remote?.sha;const row=(wanted?await latest(repo,path,wanted):null)||await latest(repo,path);if(row){return {...await unpack(row),mirror:{state:manifest&&!remote?'archived':'stale',verifiedAt:row.verified_at,lastTreeVerifiedAt:manifest?.fetchedAt,error:e.message,contentHash:row.content_hash}};}
  // Keep the initial import usable before it has been adopted into the mirror.
  if(repo==='databas'){const old=await db().prepare("SELECT * FROM files WHERE source_path=? AND origin='github' LIMIT 1").bind(path).first<any>();if(old){const object=await bucket().get(old.key);if(object){const bytes=await object.arrayBuffer();if(await sha256(bytes)===old.hash)return {...renderMirror(bytes,path,{repoKey:repo,sha:old.source_sha,commit:null,origin:'github-copy',files:[{id:old.id,name:old.name,size:old.size}]}),mirror:{state:'stale',verifiedAt:null,error:e.message,importedAt:old.created_at}};}}}
  throw e;
}

export async function mirrorStatus(repo='databas'){
 const manifest=await mirrorManifest(repo),rows=(await db().prepare('SELECT path,blob_sha,size,text_indexed FROM mirror_versions WHERE repo=?').bind(repo).all()).results as any[];
 const current=new Map<string,string>((manifest?.files||[]).map((f:any)=>[f.path,f.sha] as [string,string]));const paths=new Set(rows.map(r=>r.path));const verified=rows.filter(r=>current.get(r.path)===r.blob_sha);const revisions=new Map<string,Set<string>>();for(const r of rows){if(current.has(r.path)){if(!revisions.has(r.path))revisions.set(r.path,new Set());revisions.get(r.path)!.add(r.blob_sha);}}
 const error=await db().prepare('SELECT value FROM settings WHERE key=?').bind('mirror_error:'+repo).first<any>();
 const fileErrors=JSON.parse((await db().prepare('SELECT value FROM settings WHERE key=?').bind('mirror_file_errors:'+repo).first<any>())?.value||'{}');return {repo,commit:manifest?.commit,lastTreeVerifiedAt:manifest?.fetchedAt,totalFiles:current.size,cachedPaths:paths.size,verifiedFiles:verified.length,checked:verified.length,skipped:verified.length,copiedFiles:[...current.keys()].filter(p=>verified.some(r=>r.path===p)&&revisions.get(p)?.size===1).length,updatedFiles:[...revisions.values()].filter(s=>s.size>1).length,failed:Object.keys(fileErrors).length,pending:manifest?current.size-verified.length:null,remaining:manifest?current.size-verified.length:null,archivedPaths:[...paths].filter(p=>manifest&&!current.has(p)).length,versions:rows.length,storedVersionBytes:rows.reduce((s,r)=>s+r.size,0),indexedFiles:verified.filter(r=>r.text_indexed).length,error:error?JSON.parse(error.value):null,maxFileBytes:LIMIT,batchSize:20,backgroundWhileClosed:false,fileErrors};
}
export async function syncMirror(client:any,{repo='databas',refresh=false,limit=20}:{repo?:string,refresh?:boolean,limit?:number}={}){
 if(!(REPOSITORIES as any)[repo])throw Error('Okänt repo.');
 const owner=crypto.randomUUID(),key='mirror_lock:'+repo,startedAt=Date.now();
 const lock=await db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.startedAt') AS INTEGER) < ?").bind(key,JSON.stringify({owner,startedAt}),startedAt-180000).run();
 if(!lock.meta.changes)return {...await mirrorStatus(repo),busy:true};
 const processed:any[]=[];try{
  let manifest=await mirrorManifest(repo);
  if(refresh||!manifest||Date.now()-Date.parse(manifest.fetchedAt)>300000){const snap=await client.snapshot();if(snap.truncated)throw Error('Ofullständigt GitHub-träd. Föregående spegelinventering behålls.');manifest={commit:snap.commit,fetchedAt:snap.fetchedAt,files:snap.tree.filter((f:any)=>f.type==='blob').map((f:any)=>({path:f.path,sha:f.sha,size:f.size}))};await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mirror_manifest:'+repo,JSON.stringify(manifest)).run();}
  const cached=(await db().prepare('SELECT path,blob_sha FROM mirror_versions WHERE repo=?').bind(repo).all()).results as any[];const have=new Set(cached.map(r=>r.path+'\0'+r.blob_sha));
  const heads=(await db().prepare("SELECT key,value FROM settings WHERE key LIKE ?").bind('mirror_head:'+repo+':%').all()).results as any[];const knownHeads=new Map(heads.map(r=>[r.key,JSON.parse(r.value)]));for(const f of manifest.files){if(have.has(f.path+'\0'+f.sha)){const head=knownHeads.get('mirror_head:'+repo+':'+f.path);if(!head||head.sha!==f.sha)await observe(repo,f.path,f.sha,manifest.fetchedAt);}}
  const originals=repo==='databas'?(await db().prepare("SELECT source_path,source_sha,key,hash FROM files WHERE origin='github'").all()).results as any[]:[];const originalMap=new Map(originals.map(r=>[r.source_path,r]));
  const errorRow=await db().prepare('SELECT value FROM settings WHERE key=?').bind('mirror_file_errors:'+repo).first<any>();const fileErrors:any=errorRow?JSON.parse(errorRow.value):{};
  const queue=manifest.files.filter((f:any)=>!have.has(f.path+'\0'+f.sha)&&f.size<=LIMIT&&(!fileErrors[f.path]||fileErrors[f.path].sha!==f.sha||fileErrors[f.path].retryAt<Date.now())).sort((a:any,b:any)=>Number(originalMap.has(b.path))-Number(originalMap.has(a.path))||Number(textFile(b.path))-Number(textFile(a.path))||a.path.localeCompare(b.path));
  for(const file of queue.slice(0,Math.min(20,Math.max(1,limit)))){
   // A stale lease holder must not publish progress for another worker's run.
   const lease=await db().prepare('SELECT value FROM settings WHERE key=?').bind(key).first<any>();if(!lease||JSON.parse(lease.value).owner!==owner)throw Error('Synklåset har löpt ut. Fortsätt med nästa omgång.');
   try{const old=originalMap.get(file.path);let bytes:ArrayBuffer|undefined,adoptedKey:string|undefined;
   if(old?.source_sha===file.sha){const object=await bucket().get(old.key);if(object){bytes=await object.arrayBuffer();if(await sha256(bytes)===old.hash)adoptedKey=old.key;else bytes=undefined;}}
   if(!bytes)bytes=await (await client.original(file.path,manifest.commit)).response.arrayBuffer();
   const doc=await saveMirror(repo,{...file,fetchedAt:manifest.fetchedAt},bytes!,manifest.commit,adoptedKey);processed.push({path:file.path,sha:file.sha,contentHash:doc.mirror.contentHash,reusedOriginal:!!adoptedKey});delete fileErrors[file.path];
   }catch(e:any){fileErrors[file.path]={sha:file.sha,error:e.message,retryAt:Date.now()+300000};processed.push({path:file.path,error:e.message});}
   await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mirror_file_errors:'+repo,JSON.stringify(fileErrors)).run();
  }
  await db().prepare('DELETE FROM settings WHERE key=?').bind('mirror_error:'+repo).run();return {...await mirrorStatus(repo),processed,oversized:manifest.files.filter((f:any)=>f.size>LIMIT).length};
 }catch(e:any){await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mirror_error:'+repo,JSON.stringify({at:now(),message:e.message})).run();return {...await mirrorStatus(repo),processed};}
 finally{await db().prepare("DELETE FROM settings WHERE key=? AND json_extract(value,'$.owner')=?").bind(key,owner).run();}
}
export async function compareMirrorPaths(paths:string[],repo='databas',client?:any){
 if(!['databas','plugins'].includes(repo)||!Array.isArray(paths)||paths.length>40||paths.some(path=>typeof path!=='string'||path.length>1000||path.startsWith('/')||path.split('/').some(p=>p==='..'||p==='.')||path.includes('\\')))throw Error('Ogiltig jämförelseförfrågan.');
 const manifest=await mirrorManifest(repo);let snapshot=manifest,checkedAt:string|null=null,available=true;
 if(client){try{const current=await client.snapshot();if(current.truncated)throw Error('GitHub returnerade ett ofullständigt filträd.');snapshot={commit:current.commit,fetchedAt:current.fetchedAt,files:current.tree.filter((f:any)=>f.type==='blob').map((f:any)=>({path:f.path,sha:f.sha,size:f.size}))};checkedAt=current.fetchedAt;}catch{available=false;}}
 if(!snapshot)return {repo,commit:null,checkedAt:null,items:paths.map(path=>({path,state:'unknown',label:'GitHub har inte kunnat verifieras'}))};
 const byPath=new Map(snapshot.files.map((f:any)=>[f.path,f.sha]));const statements=paths.map(path=>db().prepare('SELECT * FROM mirror_versions WHERE repo=? AND path=? ORDER BY verified_at DESC').bind(repo,path));const results:any[]=await db().batch(statements) as any;
 return {repo,commit:snapshot.commit,checkedAt,items:await Promise.all(paths.map(async(path,i)=>{const versions=results[i]?.results||[];if(!available)return {path,state:'unknown',lastVerifiedAt:versions[0]?.verified_at||null};const sha=byPath.get(path);if(!sha)return {path,state:versions.length?'archived':'github-missing',githubSha:null,mirrorSha:versions[0]?.blob_sha||null,verifiedAt:versions[0]?.verified_at||null};const same=versions.find((r:any)=>r.blob_sha===sha);if(!same)return {path,state:versions.length?'different':'missing',githubSha:sha,mirrorSha:versions[0]?.blob_sha||null,verifiedAt:versions[0]?.verified_at||null};try{await unpack(same);return {path,state:'same',githubSha:sha,mirrorSha:same.blob_sha,verifiedAt:same.verified_at};}catch{return {path,state:'divergent',githubSha:sha,mirrorSha:same.blob_sha,verifiedAt:same.verified_at};}}))};
}
export async function mirrorDiscrepancies(offset=0,limit=30,client?:any){
 let manifest=await mirrorManifest(),available=true;
 if(client){try{const snap=await client.snapshot();if(snap.truncated)throw Error('Ofullständigt filträd.');manifest={commit:snap.commit,fetchedAt:snap.fetchedAt,files:snap.tree.filter((f:any)=>f.type==='blob').map((f:any)=>({path:f.path,sha:f.sha,size:f.size}))};await db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('mirror_manifest:databas',JSON.stringify(manifest)).run();}catch{available=false;}}
 if(!manifest)return {items:[],total:0,commit:null,checkedAt:null};
 const json=JSON.stringify(manifest.files);const total:any=await db().prepare("WITH current_files AS (SELECT json_extract(value,'$.path') path,json_extract(value,'$.sha') sha FROM json_each(?)) SELECT count(*) n FROM current_files c LEFT JOIN mirror_versions v ON v.repo='databas' AND v.path=c.path AND v.blob_sha=c.sha WHERE v.path IS NULL").bind(json).first();
 const rows:any[]=(await db().prepare("WITH current_files AS (SELECT json_extract(value,'$.path') path,json_extract(value,'$.sha') sha FROM json_each(?)) SELECT c.path,c.sha githubSha,(SELECT blob_sha FROM mirror_versions v WHERE v.repo='databas' AND v.path=c.path ORDER BY verified_at DESC LIMIT 1) mirrorSha,EXISTS(SELECT 1 FROM mirror_versions same WHERE same.repo='databas' AND same.path=c.path AND same.blob_sha=c.sha) same FROM current_files c LEFT JOIN mirror_versions exact ON exact.repo='databas' AND exact.path=c.path AND exact.blob_sha=c.sha WHERE exact.path IS NULL ORDER BY c.path LIMIT ? OFFSET ?").bind(json,Math.min(50,Math.max(1,limit)),Math.max(0,offset)).all()).results as any[];
 return {items:rows.map(r=>({...r,state:available?(r.mirrorSha?'different':'missing'):'unknown'})),total:total.n,offset,limit:Math.min(50,Math.max(1,limit)),commit:manifest.commit,checkedAt:available?manifest.fetchedAt:null,lastVerifiedAt:available?null:manifest.fetchedAt};
}
export async function searchMirror(query:string,offset=0){
 const manifest=await mirrorManifest(),terms=query.trim().split(/\s+/).filter(Boolean).slice(0,8);if(!terms.length)return {entries:[],total:0};
 // D1 LIKE patterns are bounded to 50 bytes. Reject long tokens explicitly.
 const patterns=terms.map(t=>{const p='%'+t.replace(/[\\%_]/g,'\\$&')+'%';if(new TextEncoder().encode(p).length>50)throw Error('Använd kortare sökord (högst 48 byte per ord).');return p;});
 const where=patterns.map(()=>"(body LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')").join(' AND ');
 const cte="WITH current_files AS (SELECT json_extract(value,'$.path') path,json_extract(value,'$.sha') sha FROM json_each(?)) ";
 const eligible="v.repo=? AND v.text_indexed=1 AND "+where+" AND v.blob_sha=COALESCE((SELECT sha FROM current_files c WHERE c.path=v.path),(SELECT json_extract(value,'$.sha') FROM settings WHERE key='mirror_head:'||v.repo||':'||v.path),(SELECT blob_sha FROM mirror_versions old WHERE old.repo=v.repo AND old.path=v.path ORDER BY verified_at DESC LIMIT 1))";
 const args=[JSON.stringify(manifest?.files||[]),'databas',...patterns.flatMap(p=>[p,p])];
 const total:any=await db().prepare(cte+'SELECT count(*) n FROM mirror_versions v WHERE '+eligible).bind(...args).first();
 const rows=(await db().prepare(cte+"SELECT v.path,json_remove(v.document,'$.body') document,substr(v.body,1,240) excerpt,v.verified_at,EXISTS(SELECT 1 FROM current_files c WHERE c.path=v.path) active FROM mirror_versions v WHERE "+eligible+' ORDER BY verified_at DESC,path LIMIT 30 OFFSET ?').bind(...args,offset).all()).results as any[];
 return {entries:rows.map(r=>({...JSON.parse(r.document),excerpt:r.excerpt,mirror:{state:manifest?(r.active?'verified':'archived'):'stale',verifiedAt:r.verified_at,lastTreeVerifiedAt:manifest?.fetchedAt}})),total:total.n,lastTreeVerifiedAt:manifest?.fetchedAt};
}
export async function mirrorOriginal(repo:string,path:string,ref:string,blob?:string){const useBlob=!!blob&&/^[a-f0-9]{40}$/.test(blob);const row=await db().prepare('SELECT * FROM mirror_versions WHERE repo=? AND path=? AND '+(useBlob?'blob_sha':'commit_sha')+'=? LIMIT 1').bind(repo,path,useBlob?blob:ref).first<any>();if(!row)return null;const object=await bucket().get(row.object_key);if(!object)return null;const bytes=await object.arrayBuffer();if(await sha256(bytes)!==row.content_hash)throw Error('Originalets kontrollsumma stämmer inte.');return {file:{name:path.split('/').pop()},response:new Response(bytes)};}
