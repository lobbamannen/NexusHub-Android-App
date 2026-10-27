import {github} from '@/lib/github';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function origin(request:Request){const value=request.headers.get('origin');if(value&&value!==new URL(request.url).origin)throw Error('Otillåtet ursprung.');}
const fail=(e:any)=>json({error:e.message},e.status===409?409:503);
export async function GET(request:Request){try{const q=new URL(request.url).searchParams;return json(q.has('fileId')?await github().readSharedIncomingFile(q.get('id'),q.get('fileId')):await github().listSharedIncoming());}catch(e){return fail(e);}}
export async function POST(request:Request){try{origin(request);const data=await request.json();return json(data.operation==='mirror'?await github().saveSharedIncoming(data.item):await github().sendIncoming(data));}catch(e){return fail(e);}}
export async function DELETE(request:Request){try{origin(request);const data=await request.json();return json(await github().deleteSharedIncoming(data.id,data.expected));}catch(e){return fail(e);}}
