import {github} from '@/lib/github';
export async function GET(){try{return Response.json(await github().readAdditionDates(),{headers:{'Cache-Control':'no-store'}});}catch(e:any){return Response.json({error:e.message},{status:503});}}
