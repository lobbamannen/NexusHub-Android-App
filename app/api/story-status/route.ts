import {github} from '@/lib/github';
import {applyStoryStatus,validateStoryStatus,validateStoryPath} from '@/lib/story-status.mjs';

export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const get=async()=>{const data=await github('databas').readStoryStatus();return {...data,register:validateStoryStatus(JSON.parse(data.content))};};
export async function GET(){
 try{const data=await get();return json({register:data.register,sha:data.sha,source:'github'});}
 catch(e:any){return json({error:e.message||'Lässtatus kunde inte hämtas från GitHub.'},e.status===404?404:503);}
}
export async function POST(request:Request){
 try{
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'Otillåtet ursprung.'},403);
  if(Number(request.headers.get('content-length')||0)>70000)return json({error:'För stor ändring.'},413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>70000)return json({error:'För stor ändring.'},413);
  const input:any=JSON.parse(raw);
  if(input?.action==='batch'){
   if(!/^[a-f0-9]{40}$/.test(input.expectedSha||'')||!Array.isArray(input.edits)||!input.edits.length||input.edits.length>200)return json({error:'Ogiltig ändringslista eller registerversion.'},400);
   const paths=new Set<string>();
   for(const edit of input.edits){validateStoryPath(edit?.path);if(typeof edit.value!=='boolean'||paths.has(edit.path))return json({error:'Ogiltig eller upprepad läsmarkering.'},400);paths.add(edit.path);}
  }else if(input?.action==='set')validateStoryPath(input.path);
  else if(input?.action==='migrate'){
   if(!Array.isArray(input.paths)||input.paths.length>200)return json({error:'För många markeringar.'},400);
   for(const item of input.paths)validateStoryPath(item?.path);
  }else return json({error:'Ogiltig åtgärd.'},400);
  const client=github('databas');
  // Each write applies to the latest GitHub state; a 409 triggers a fresh read.
  // Another field's update can never be lost by replaying an older whole register.
  for(let attempt=0;attempt<5;attempt++){
   const current=await get();
   if(input.action==='batch'&&current.sha!==input.expectedSha)return json({error:'Lässtatus har ändrats i GitHub. Utkasten finns kvar. Läs om status innan du sparar igen.'},409);
   const at=new Date().toISOString();
   const next=input.action==='batch'?input.edits.reduce((register:any,edit:any)=>applyStoryStatus(register,{action:'set',path:edit.path,field:'read',value:edit.value},at),current.register):applyStoryStatus(current.register,input,at);
   const content=JSON.stringify(next,null,2)+'\n';
   try{
    const result=await client.writeStoryStatus(current.sha,content);
    return json({saved:true,source:'github',sha:result.sha,commit:result.commit,register:next});
   }catch(e:any){if(e.status!==409&&e.status!==422)throw e;if(input.action==='batch')return json({error:'Lässtatus ändrades samtidigt i GitHub. Inget skrevs över; utkasten finns kvar.'},409);}
  }
  return json({error:'Registret ändrades samtidigt flera gånger. Försök igen.'},409);
 }catch(e:any){
  const status=e.status===401||e.status===403?403:e.status===404?404:e.status===409||e.status===422?409:e.status&&e.status>=500?503:400;
  return json({error:e.message||'Kunde inte spara lässtatus.'},status);
 }
}
