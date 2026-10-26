import {github} from '@/lib/github';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Otillåtet ursprung.'},403);return json(await github().sendIncoming(await request.json()));}catch(e:any){return json({error:e.message},e.status===409?409:503);}}
