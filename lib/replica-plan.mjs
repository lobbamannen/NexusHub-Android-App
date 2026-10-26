/** A row alone is insufficient: its durable binary must still exist. */
export function planReplica(files, versions, objectKeys, repo) {
 const keys=new Set(objectKeys), have=new Map(versions.map(row=>[row.path+'\0'+row.blob_sha,row.object_key]));
 const missing=[], current=[];
 for(const file of files){
  const key=have.get(file.path+'\0'+file.sha);
  if(key&&keys.has(key))current.push(file);else missing.push(file);
 }
 missing.sort((a,b)=>Number(/\.(json|md|txt)$/i.test(b.path))-Number(/\.(json|md|txt)$/i.test(a.path))||a.size-b.size||a.path.localeCompare(b.path));
 return {missing,current,total:files.length,done:current.length,totalBytes:files.reduce((n,f)=>n+f.size,0),doneBytes:current.reduce((n,f)=>n+f.size,0)};
}
