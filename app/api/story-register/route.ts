import {github,invalidatePortalCache} from '@/lib/github';
import {applyStoryEdits,validateStoryRegister} from '@/lib/story-register.mjs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const read=async()=>{const file=await github('databas').readStoryRegister();return {...file,register:validateStoryRegister(JSON.parse(file.content))};};
export async function GET(){
 try{const data=await read();return reply({register:data.register,sha:data.sha,source:'github'});}
 catch(e:any){return reply({error:e.message||'Berättelseregistret kunde inte läsas.'},503);}
}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return reply({error:'Otillåtet ursprung.'},403);
  if(!/application\/json/i.test(request.headers.get('content-type')||''))return reply({error:'Förväntade JSON.'},415);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>250000)return reply({error:'För stor ändring.'},413);
  const input=JSON.parse(raw);
  if(!Object.prototype.hasOwnProperty.call(input,'expectedSha')||input.expectedSha!==null&&!/^[a-f0-9]{40}$/.test(input.expectedSha||''))return reply({error:'Saknad registerversion.'},400);
  const current=await read();
  if(current.sha!==input.expectedSha)return reply({error:'Registret har ändrats i GitHub. Dina ändringar finns kvar. Kopiera dem vid behov och läs om registret innan du sparar igen.'},409);
  const client=github('databas'),snapshot=await client.snapshot();
  if(snapshot.truncated)return reply({error:'GitHubs filinventering är ofullständig. Ingenting sparades.'},503);
  const paths=new Set<string>(snapshot.tree.filter((f:any)=>f.type==='blob'&&f.mode!=='120000'&&f.path.endsWith('.md')).map((f:any)=>f.path));
  const next=applyStoryEdits(current.register,input.edits,paths,new Date().toISOString());
  const content=JSON.stringify(next,null,2)+'\n';
  const saved=await client.writeStoryRegister(current.sha,content);
  invalidatePortalCache();
  return reply({saved:true,register:next,sha:saved.sha,commit:saved.commit,source:'github'});
 }catch(e:any){const status=e.status===409||e.status===422?409:e.status===401||e.status===403?403:e.status>=500?503:400;return reply({error:status===409?'GitHub-registret ändrades samtidigt. Inget skrevs över; dina ändringar finns kvar.':e.message||'Kunde inte spara i GitHub.'},status);}
}
