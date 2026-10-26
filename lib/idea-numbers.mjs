import { ideaPath, ideaContent } from './ideas.mjs';
export const ideaDay = date => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
export async function readIdeaNumbers(call,gitBlobSha,ref='main'){
 const response=await call('/contents/Ideer/System/nummer.json?ref='+ref);if(response.status===404)return {schemaVersion:1,nextNumber:1,entries:[],dailyCounts:{}};
 const file=await response.json(),bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));if(await gitBlobSha(bytes)!==file.sha)throw Error('Idénumrens kontrollsumma avviker.');
 const index=JSON.parse(new TextDecoder().decode(bytes));if(index.schemaVersion!==1||!Array.isArray(index.entries)||!Number.isSafeInteger(index.nextNumber))throw Error('Ogiltigt idéindex.');return index;
}
/** Index and new idea move main together. A conflicting ref is retried from a fresh head. */
export async function createNumberedIdea(idea,call,gitBlobSha,base64){
 for(let attempt=0;attempt<4;attempt++){
  const headResponse=await call('/git/ref/heads/main'),head=(await headResponse.json()).object.sha;
  const existing=await call('/contents/'+ideaPath(idea.id)+'?ref='+head);
  if(existing.status!==404)throw Object.assign(Error('Idén finns redan. Försök igen för att kontrollera sparningen.'),{status:409});
  const index=await readIdeaNumbers(call,gitBlobSha,head);
  let entry=index.entries.find(e=>e.id===idea.id);
  if(!entry){entry={id:idea.id,number:index.nextNumber++,createdAt:idea.createdAt};index.entries.push(entry);const day=ideaDay(idea.createdAt);index.dailyCounts[day]=(index.dailyCounts[day]||0)+1;}
  const commitResponse=await call('/git/commits/'+head),commit=await commitResponse.json();
  const content=ideaContent(idea),sha=await gitBlobSha(new TextEncoder().encode(content));
  const treeResponse=await call('/git/trees',{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:[{path:ideaPath(idea.id),mode:'100644',type:'blob',content},{path:'Ideer/System/nummer.json',mode:'100644',type:'blob',content:JSON.stringify(index,null,2)+'\n'}]})});
  const tree=await treeResponse.json();const newCommitResponse=await call('/git/commits',{method:'POST',body:JSON.stringify({message:'NexusHub: spara idé '+entry.number,tree:tree.sha,parents:[head]})});const next=await newCommitResponse.json();
  try{await call('/git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});return {idea,sha,commit:next.sha,number:entry.number,saved:true,source:'github'};}
  catch(error){if(![409,422].includes(error.status)||attempt===3)throw error;}
 }
 throw Error('Idén kunde inte numreras. Försök igen.');
}
