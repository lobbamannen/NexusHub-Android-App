import {github} from '@/lib/github';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{return json(await github().readTodos());}catch(e:any){return json({error:e.message},503);}}
export async function POST(request:Request){try{const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Otillåtet ursprung.'},403);const input=await request.json();return json(await github().saveTodos(input.data,input.expectedSha));}catch(e:any){return json({error:e.message},e.status===409?409:503);}}
