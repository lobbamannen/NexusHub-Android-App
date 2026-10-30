/** A lease is acquired while the user starts work; it ends on the real result. */
export function beginBackgroundWork(label='sync'){
 const id=label+':'+crypto.randomUUID();let ended=false;
 try{(window.Android as any)?.backgroundActive?.(id,true);}catch{/* Native intake still has its persisted WorkManager queue. */}
 return ()=>{if(ended)return;ended=true;try{(window.Android as any)?.backgroundActive?.(id,false);}catch{/* Lease timeout is the final cleanup. */}};
}
export async function backgroundWork<T>(label:string,work:()=>Promise<T>):Promise<T>{const end=beginBackgroundWork(label);try{return await work();}finally{end();}}
