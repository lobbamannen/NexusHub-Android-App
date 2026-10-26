import test from 'node:test';
import assert from 'node:assert/strict';
import { githubClient, gitBlobSha } from '../lib/github-inbox.mjs';
const id='12345678-1234-4234-8234-123456789abc';
const idea={schemaVersion:1,id,text:'En idé med åäö 💡',status:'new',createdAt:'2026-10-25T16:00:00.000Z',updatedAt:'2026-10-25T16:00:00.000Z'};
const {validateIdea,ideaPath}=await import('../lib/ideas.mjs').catch(()=>({}));
test('idéformat behåller fri text och samtliga statusar',()=>{
 assert.equal(typeof validateIdea,'function');
 for(const status of ['new','investigating','ready','completed','dismissed']) assert.equal(validateIdea({...idea,status}).text,idea.text);
 for(const invalid of [{...idea,text:'   '},{...idea,status:'bad'},{...idea,id:'../README'},{...idea,createdAt:'igår'},{...idea,schemaVersion:2},{...idea,text:'x'.repeat(50001)}]) assert.throws(()=>validateIdea(invalid));
 assert.equal(ideaPath(id),'Ideer/'+id+'.json');assert.throws(()=>ideaPath('../bad'));
});
function server(){const files=new Map(),trees=new Map(),commits=new Map();let head='a'.repeat(40),sequence=0,writes=0;let lose=false;return {files,get writes(){return writes},set lose(v){lose=v},transport:async(url,opt={})=>{
 const path=decodeURIComponent(new URL(url).pathname.split('/contents/')[1]||'');
 const endpoint=new URL(url).pathname.replace('/repos/lobbamannen/Databas','');
 if(endpoint==='/git/ref/heads/main')return Response.json({object:{sha:head}});
 if(endpoint==='/git/trees'&&opt.method==='POST'){const body=JSON.parse(opt.body),sha=(++sequence).toString(16).padStart(40,'0');trees.set(sha,await Promise.all(body.tree.map(async entry=>({...entry,sha:await gitBlobSha(new TextEncoder().encode(entry.content))}))));return Response.json({sha});}
 if(endpoint==='/git/commits'&&opt.method==='POST'){const body=JSON.parse(opt.body),sha=(++sequence).toString(16).padStart(40,'0');commits.set(sha,body);return Response.json({sha});}
 if(endpoint.startsWith('/git/commits/')&&!opt.method)return Response.json({tree:{sha:head}});
 if(endpoint==='/git/refs/heads/main'&&opt.method==='PATCH'){
  const body=JSON.parse(opt.body),commit=commits.get(body.sha);if(commit.parents[0]!==head)return Response.json({},{status:422});
  for(const entry of trees.get(commit.tree)){files.set(entry.path,{content:entry.content,sha:entry.sha});}
  head=body.sha;writes++;if(lose){lose=false;throw Error('response lost')}return Response.json({object:{sha:head}});
 }

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
 const first=await c.saveIdea(idea,null);assert.equal(first.idea.text,idea.text);assert.equal(s.files.size,2);
 const edit={...idea,text:idea.text+'\nMer tre dagar senare',updatedAt:'2026-10-28T16:00:00.000Z'};
 await c.saveIdea(edit,first.sha);assert.equal((await c.listIdeas()).items[0].idea.text,edit.text);
 await c.saveIdea({...idea,id:'22345678-1234-4234-8234-123456789abc'},null);assert.equal(s.files.size,3);
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

test('samtidiga nya idéer får unika nummer och historiken behålls',async()=>{
 const s=server(),a=githubClient('test',s.transport),b=githubClient('test',s.transport);
 const results=await Promise.all([a.saveIdea(idea,null),b.saveIdea({...idea,id:'22345678-1234-4234-8234-123456789abc'},null)]);
 assert.deepEqual(results.map(r=>r.number).sort(),[1,2]);
 const index=JSON.parse(s.files.get('Ideer/System/nummer.json').content);assert.equal(index.nextNumber,3);assert.equal(index.dailyCounts['2026-10-25'],2);
});
