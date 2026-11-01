import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {githubClient,inboxPath,gitBlobSha} from '../lib/github-inbox.mjs';
const bytes=new TextEncoder().encode('Hej åäö!');
test('inkorgens sökväg kan inte användas för att skriva till andra mappar',()=>{assert.equal(inboxPath('abc','../../test.txt'),'00-Inkorg/abc-_.._test.txt');assert.throws(()=>inboxPath('../id','a'));});
test('originalbytes bevaras och SHA matchar Git-formatet',async()=>{assert.equal(await gitBlobSha(bytes),createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex'));let content;const c=githubClient('test-token',async(url,opts)=>{assert.ok(url.startsWith('https://api.github.com/repos/lobbamannen/Databas/contents/00-Inkorg/'));if(!opts.method)return new Response('{}',{status:404});assert.equal(opts.method,'PUT');assert.equal(opts.redirect,'manual');content=JSON.parse(opts.body);assert.ok(!('sha' in content));return Response.json({content:{sha:await gitBlobSha(bytes),html_url:'https://github.com/file'},commit:{sha:'commit'}});});const result=await c.upload('abc','svenska.txt',bytes);assert.deepEqual(Buffer.from(content.content,'base64'),Buffer.from(bytes));assert.equal(result.commit,'commit');});
test('osäkert tidigare resultat återläses utan en andra skrivning',async()=>{let writes=0;const c=githubClient('test',async(url,opts)=>{if(opts.method)writes++;return Response.json({sha:await gitBlobSha(bytes),html_url:'https://github.com/file'});});assert.equal((await c.upload('abc','a.txt',bytes)).reconciled,true);assert.equal(writes,0);});
test('konflikt och nekad åtkomst rapporteras utan överskrivning eller tokenläcka',async()=>{const c=githubClient('hidden',async()=>Response.json({sha:'different'}));await assert.rejects(c.upload('abc','a.txt',bytes),/Ingenting skrevs över/);const denied=githubClient('hidden',async()=>new Response('{}',{status:403}));await assert.rejects(denied.status(),e=>!e.message.includes('hidden')&&e.message.includes('nekade'));});
test('live-läsning hämtar senaste commit och läser filen från just den versionen',async()=>{
 let revision='a'.repeat(40);const calls=[];
 const c=githubClient('test',async(url,options)=>{calls.push({url,method:options.method||'GET'});if(url.endsWith('/commits?per_page=1'))return Response.json([{sha:revision}]);assert.ok(url.endsWith('?ref='+revision));return Response.json({name:'README.md',path:'README.md',size:3,sha:'blob',encoding:'base64',content:btoa('Hej'),html_url:'https://github.com/file'});});
 assert.equal((await c.browse('README.md')).commit,revision);revision='b'.repeat(40);assert.equal((await c.browse('README.md')).commit,revision);assert.ok(calls.every(c=>c.method==='GET'));
});
test('live-läsning avvisar sökvägar utanför valt repo före nätverksanrop',async()=>{let called=false;const c=githubClient('test',async()=>{called=true;});await assert.rejects(c.browse('../other'));assert.equal(called,false);});
test('plugin-repot kan läsas men aldrig skrivas via uppladdningsfunktionen',async()=>{let called=false;const c=githubClient('test',async()=>{called=true;return Response.json({});},'lobbamannen/ChatGPT-Plugin');await assert.rejects(c.upload('abc','file.txt',bytes),/bara skapa dokument i Databas/);assert.equal(called,false);assert.throws(()=>githubClient('test',fetch,'annan/hemlig'));});
test('original hämtas som råbytes från samma exakta commit utan att följa omdirigeringar',async()=>{const ref='c'.repeat(40);const c=githubClient('test',async(url,opts)=>{assert.ok(url.endsWith('?ref='+ref));assert.equal(opts.redirect,'manual');if(opts.headers.Accept==='application/vnd.github.raw+json')return new Response(bytes);return Response.json({name:'a.pdf',path:'a.pdf',size:bytes.length,sha:'blob',encoding:'base64',content:btoa('hej')});});const result=await c.original('a.pdf',ref);assert.deepEqual(new Uint8Array(await result.response.arrayBuffer()),bytes);});

test('series Vill se writer accepts only a fixed canonical GitHub path with versioned updates',async()=>{
 const content=JSON.stringify({schemaVersion:1,series:[{title:'Silo',wantToWatch:true}]})+'\n';
 const expectedSha='a'.repeat(40),expectedHash=await gitBlobSha(new TextEncoder().encode(content));
 let writes=0;
 const c=githubClient('token',async(url,options)=>{
  writes++;
  assert.equal(url,'https://api.github.com/repos/lobbamannen/Databas/contents/Serier/register.json');
  assert.equal(options.method,'PUT');
  const body=JSON.parse(options.body);
  assert.equal(body.branch,'main');
  assert.equal(body.sha,expectedSha);
  assert.deepEqual(Buffer.from(body.content,'base64'),Buffer.from(content));
  return Response.json({content:{sha:expectedHash,html_url:'https://github.com/file'},commit:{sha:'b'.repeat(40)}});
 });
 const result=await c.writeSeriesRegister(expectedSha,content);
 assert.equal(result.sha,expectedHash);
 assert.equal(writes,1);
 await assert.rejects(c.writeSeriesRegister('../bad',content),/Ogiltig version/);
 assert.equal(writes,1);
 const cOther=githubClient('token',async()=>{throw Error('should never call');},'lobbamannen/ChatGPT-Plugin');
 await assert.rejects(cOther.writeSeriesRegister(expectedSha,content),/bara skrivas i Databas/);
});

test('series writer preserves a large register without the removed legacy 900000-character cap',async()=>{
 const content=JSON.stringify({schemaVersion:1,series:[],note:'x'.repeat(900001)});
 const bytes=new TextEncoder().encode(content),hash=await gitBlobSha(bytes);
 let writes=0;
 const c=githubClient('test',async(_url,options)=>{
  writes++;
  const sent=Buffer.from(JSON.parse(options.body).content,'base64');
  assert.equal(sent.length,bytes.length);
  assert.equal(await gitBlobSha(sent),hash);
  return Response.json({content:{sha:hash},commit:{sha:'b'.repeat(40)}});
 });
 assert.equal((await c.writeSeriesRegister('a'.repeat(40),content)).sha,hash);
 assert.equal(writes,1);
});
