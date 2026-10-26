import {github} from '@/lib/github';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{return json(await github().readWatchSettings());}catch(e:any){return json({error:e.message},e.status===401||e.status===403?403:503);}}
export async function POST(request:Request){try{
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Otillåtet ursprung.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Förväntade JSON.'},415);
 const input=await request.json();if(input.expectedSha!==null&&!/^[a-f0-9]{40}$/.test(input.expectedSha||''))return json({error:'Saknad versionsnyckel.'},400);
 return json(await github().saveWatchSettings(input.data,input.expectedSha));
}catch(e:any){return json({error:e.message},e.status===409||e.status===422?409:e.status===401||e.status===403?403:e.status>=500?503:400);}}
