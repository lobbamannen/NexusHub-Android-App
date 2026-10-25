import test from 'node:test';
import assert from 'node:assert/strict';
import { githubClient, gitBlobSha } from '../lib/github-inbox.mjs';
const id='12345678-1234-4234-8234-123456789abc';
const idea={schemaVersion:1,id,text:'En idé med åäö 💡',status:'new',createdAt:'2026-10-25T16:00:00.000Z',updatedAt:'2026-10-25T16:00:00.000Z'};
const {validateIdea,ideaPath}=await import('../lib/ideas.mjs').catch(()=>({}));
test('idéformat behåller fri text och samtliga fyra statusar',()=>{
 assert.equal(typeof validateIdea,'function');
 for(const status of ['new','investigating','completed','dismissed']) assert.equal(validateIdea({...idea,status}).text,idea.text);
 for(const invalid of [{...idea,text:'   '},{...idea,status:'bad'},{...idea,id:'../README'},{...idea,createdAt:'igår'},{...idea,schemaVersion:2},{...idea,text:'x'.repeat(50001)}]) assert.throws(()=>validateIdea(invalid));
 assert.equal(ideaPath(id),'Ideer/'+id+'.json');assert.throws(()=>ideaPath('../bad'));
});
function server(){const files=new Map();let writes=0;let lose=false;return {files,get writes(){return writes},set lose(v){lose=v},transport:async(url,opt={})=>{
 const path=decodeURIComponent(new URL(url).pathname.split('/contents/')[1]||'');
 if(opt.method==='PUT'){
  const body=JSON.parse(opt.body),old=files.get(path);writes++;
  if(old?body.sha!==old.sha:body.sha!==undefined)return Response.json({}, {status:409});
  const content=Buffer.from(body.content,'base64').toString('utf8'),sha=await gitBlobSha(new TextEncoder().encode(content));
  files.set(path,{content,sha});if(lose){lose=false;throw Error('response lost')}
  return Response.json({content:{sha},commit:{sha:'c'.repeat(40)}});
 }
 if(url.includes('/git/trees/'))return Response.json({truncated:false,tree:[...files].map(([path,f])=>({path,type:'blob',sha:f.sha}))});
 if(url.includes('/git/blobs/')){const f=[...files.values()].find(f=>url.endsWith(f.sha));return Response.json({...f,encoding:'base64',content:Buffer.from(f.content).toString('base64')})}
 const f=files.get(path);return f?Response.json({...f,encoding:'base64',content:Buffer.from(f.content).toString('base64')}):Response.json({},{status:404});
 }};}
test('create-only, Unicode, efterföljande redigering och separata filer',async()=>{
 const s=server(),c=githubClient('test',s.transport);assert.equal(typeof c.saveIdea,'function');
 const first=await c.saveIdea(idea,null);assert.equal(first.idea.text,idea.text);assert.equal(s.files.size,1);
 const edit={...idea,text:idea.text+'\nMer tre dagar senare',updatedAt:'2026-10-28T16:00:00.000Z'};
 await c.saveIdea(edit,first.sha);assert.equal((await c.listIdeas()).items[0].idea.text,edit.text);
 await c.saveIdea({...idea,id:'22345678-1234-4234-8234-123456789abc'},null);assert.equal(s.files.size,2);
});
test('extern ändring och create-kollision skrivs aldrig över',async()=>{
 const s=server(),c=githubClient('test',s.transport);assert.equal(typeof c.saveIdea,'function');
 const first=await c.saveIdea(idea,null);await c.saveIdea({...idea,text:'Extern ändring'},first.sha);const before=s.writes;
 await assert.rejects(c.saveIdea({...idea,text:'Mitt gamla utkast'},first.sha),e=>e.status===409);
 await assert.rejects(c.saveIdea({...idea,text:'Dubblett'},null),e=>e.status===409);
 assert.equal(s.writes,before);
});
test('förlorad kvittens återläses utan dubbelskrivning',async()=>{
 const s=server(),c=githubClient('test',s.transport);assert.equal(typeof c.saveIdea,'function');s.lose=true;
 await assert.rejects(c.saveIdea(idea,null),/lost/);const result=await c.saveIdea(idea,null);
 assert.equal(result.reconciled,true);assert.equal(s.writes,1);
});
test('trasig/hashfelaktig fil, trunkerad lista och främmande repo avvisas',async()=>{
 const c=githubClient('test',async()=>Response.json({truncated:true,tree:[]}));assert.equal(typeof c.listIdeas,'function');await assert.rejects(c.listIdeas(),/ofullständigt/);
 const other=githubClient('test',()=>{throw Error('network should not run')},'lobbamannen/ChatGPT-Plugin');await assert.rejects(other.saveIdea(idea,null),/Databas/);
 const s=server(),normal=githubClient('test',s.transport);await normal.saveIdea(idea,null);s.files.get(ideaPath(id)).content='broken';await assert.rejects(normal.listIdeas(),/hash/);
});
