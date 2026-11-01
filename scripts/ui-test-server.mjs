import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';

/** Each browser check owns a strict-port server and verifies its run identity. */
export async function startUiTestServer({port,path,timeoutMs=15000}) {
 const runId=randomUUID();
 const origin='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  stdio:'ignore',env:{...process.env,NEXUS_TEST_RUN_ID:runId},
 });
 let launchError;
 child.on('error',error=>{launchError=error;});
 const stop=async()=>{
  if(child.exitCode!==null||child.signalCode!==null)return;
  const closed=once(child,'close').catch(()=>{});
  child.kill();
  let deadline;
  try {
   await Promise.race([closed,new Promise(resolve=>{deadline=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);})]);
   await closed;
  } finally {clearTimeout(deadline);}
 };
 try {
  const until=Date.now()+timeoutMs;
  while(Date.now()<until) {
   if(launchError)throw launchError;
   if(child.exitCode!==null||child.signalCode!==null)throw Error('Vite-servern kunde inte starta på port '+port+'.');
   try {
    const identity=await fetch(origin+'/__nexus-test-run',{cache:'no-store',signal:AbortSignal.timeout(1000)});
    if(identity.ok&&(await identity.text())===runId) {
     const page=await fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(1000)});
     if(page.ok)return {url:origin+path,origin,runId,stop};
    }
   } catch {/* Wait only for the child we launched, never accept another server. */}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Rätt Vite-server kunde inte verifieras på port '+port+'.');
 } catch(error) {await stop();throw error;}
}
