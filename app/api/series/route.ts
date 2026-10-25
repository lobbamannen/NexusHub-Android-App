import {github} from '@/lib/github';
import {gitBlobSha} from '@/lib/github-inbox.mjs';
import {applySeriesWatchlistChange} from '@/lib/series-watchlist.mjs';
import {applySeriesWatchedSeasonsChange} from '@/lib/series-seasons.mjs';
import {saveMirror} from '@/lib/mirror';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

// Canonical source: Databas/Serier/register.json. Verify SHA before every write.
async function read(){
 const file:any=await github('databas').browse('Serier/register.json');
 if(file.type!=='file'||file.encoding!=='base64'||typeof file.content!=='string'||!/^[a-f0-9]{40}$/.test(file.sha||''))throw Error('GitHub levererade inte ett komplett serieregister.');
 const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
 if(await gitBlobSha(bytes)!==file.sha)throw Error('Serieregistrets GitHub-hash kunde inte verifieras.');
 const register=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(register?.schemaVersion!==1||!Array.isArray(register.series))throw Error('Serieregistrets format känns inte igen.');
 return {sha:file.sha,commit:file.commit,register};
}
export async function GET(){
 try{return reply(await read());}
 catch(error:any){return reply({error:error?.message||'Serieregistret kunde inte läsas.'},error?.status===401||error?.status===403?403:503);}
}

export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Otillåtet ursprung.'},403);
  if(!/application\/json/i.test(request.headers.get('content-type')||''))return reply({error:'Förväntade JSON.'},415);
  if(Number(request.headers.get('content-length')||0)>4096)return reply({error:'Ändringen är för stor.'},413);
  const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>4096)return reply({error:'Ändringen är för stor.'},413);
  const input:any=JSON.parse(raw);
  if(!input||!['set-watchlist','set-watched-seasons'].includes(input.action)||!/^[a-f0-9]{40}$/.test(input.expectedSha||''))return reply({error:'Ogiltig serieändring eller saknad versionsnyckel.'},400);
  if(input.action==='set-watchlist'&&typeof input.wantToWatch!=='boolean')return reply({error:'Vill se måste vara sant eller falskt.'},400);
  if(input.action==='set-watched-seasons'&&!Array.isArray(input.watchedSeasons))return reply({error:'Sedda säsonger måste vara en lista.'},400);
  const current=await read();
  if(current.sha!==input.expectedSha)return reply({error:'Serieregistret har ändrats i GitHub. Uppdatera sidan innan du sparar igen.'},409);
  const result=input.action==='set-watchlist'
   ?applySeriesWatchlistChange(current.register,input.target,input.wantToWatch)
   :applySeriesWatchedSeasonsChange(current.register,input.target,input.watchedSeasons);
  if(!result.changed)return reply({saved:true,unchanged:true,sha:current.sha,commit:current.commit,register:result.register});
  const content=JSON.stringify(result.register,null,2)+'\n';
  const saved=await github('databas').writeSeriesRegister(current.sha,content);
  let warning:string|null=null;
  try{
   const bytes=new TextEncoder().encode(content);
   await saveMirror('databas',{path:'Serier/register.json',sha:saved.sha,size:bytes.byteLength,fetchedAt:new Date().toISOString()},bytes.buffer,saved.commit);
  }catch(e:any){warning='Ändringen sparades i GitHub, men spegeln uppdaterades inte direkt. '+(e?.message||'');}
  return reply({saved:true,sha:saved.sha,commit:saved.commit,warning,register:result.register});
 }catch(error:any){
  const code=error?.status===409||error?.status===422?409:error?.status===401||error?.status===403?403:error?.status>=500?503:400;
  return reply({error:code===409?'GitHub avvisade ändringen. Ladda om serieregistret innan du försöker igen.':error?.message||'Serien kunde inte uppdateras.'},code);
 }
}
