import {github} from '@/lib/github';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){try{return json(await github().ideaFiles(new URL(request.url).searchParams.get('id')));}catch(e:any){return json({error:e.message},503);}}
