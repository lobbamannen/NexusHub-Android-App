import test from 'node:test';
import assert from 'node:assert/strict';
import {githubClient,gitBlobSha} from '../lib/github-inbox.mjs';
const path='/contents/Berattelser/lasstatus.json';
const text='{"schemaVersion":1,"entries":{}}\n';
test('reads the exact GitHub register and verifies blob contents before use',async()=>{
 const bytes=new TextEncoder().encode(text),sha=await gitBlobSha(bytes),urls=[];
 const client=githubClient('test',async(url,options)=>{urls.push(url);assert.equal(options.redirect,'manual');return Response.json({sha,encoding:'base64',content:Buffer.from(bytes).toString('base64').match(/.{1,8}/g).join('\n')});});
 const result=await client.readStoryStatus();
 assert.equal(result.content,text);assert.equal(result.sha,sha);assert.equal(urls.length,1);
 assert.ok(urls[0].endsWith(path+'?ref=main'));
});
test('rejects an incorrect Git blob hash',async()=>{
 const client=githubClient('secret',async()=>Response.json({sha:'e'.repeat(40),encoding:'base64',content:btoa(text)}));
 await assert.rejects(client.readStoryStatus(),/filhash/);
});
test('only allowed story register is written with expected SHA',async()=>{
 const original='a'.repeat(40),sha=await gitBlobSha(new TextEncoder().encode(text));
 let writes=0;
 const client=githubClient('secret',async(url,options)=>{writes++;assert.ok(url.endsWith(path));assert.equal(options.method,'PUT');const body=JSON.parse(options.body);assert.equal(body.sha,original);assert.equal(body.branch,'main');assert.equal(Buffer.from(body.content,'base64').toString(),text);return Response.json({content:{sha,html_url:'https://github.com/example'},commit:{sha:'b'.repeat(40)}});});
 const receipt=await client.writeStoryStatus(original,text);
 assert.equal(writes,1);assert.equal(receipt.sha,sha);assert.equal(receipt.commit,'b'.repeat(40));
});
test('rejects a stale version, wrong repository and malformed register size',async()=>{
 const rejected=githubClient('secret',async()=>Response.json({message:'conflict'},{status:409}));
 await assert.rejects(rejected.writeStoryStatus('a'.repeat(40),text),e=>e.status===409);
 const other=githubClient('secret',async()=>Response.json({}),'lobbamannen/ChatGPT-Plugin');
 await assert.rejects(other.writeStoryStatus('a'.repeat(40),text),/bara skrivas/);
 await assert.rejects(other.readStoryStatus(),/bara läsas/);
 await assert.rejects(rejected.writeStoryStatus('',text),/Ogiltig version/);
});
