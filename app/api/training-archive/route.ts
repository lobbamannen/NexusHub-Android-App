import {trainingArchive} from '@/platform/training-archive';
export async function GET(request:Request){try{return Response.json(await trainingArchive(new URL(request.url).searchParams.get('month')||undefined));}catch(e:any){return Response.json({error:e.message},{status:503});}}
