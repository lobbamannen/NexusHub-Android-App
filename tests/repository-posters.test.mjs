import test from 'node:test';
import assert from 'node:assert/strict';
import {gitBlobSha} from '../lib/github-inbox.mjs';
import {buildPosterIndex,createPosterService} from '../lib/repository-posters.mjs';

const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=','base64'));
const commit='a'.repeat(40);
const file=async(path='Media/posters/series/tt38760153.png')=>({path,type:'blob',mode:'100644',size:bytes.length,sha:await gitBlobSha(bytes)});
const snapshot=async()=>({commit,truncated:false,tree:[await file()]});

test('a new IMDb poster is discovered without a generated manifest or catalog entry',async()=>{
 const index=buildPosterIndex(await snapshot(),{});
 assert.equal(index.series.tt38760153.path,'Media/posters/series/tt38760153.png');
 assert.equal(index.commit,commit);
});
test('manual title/year and IMDb aliases resolve to the same verified file',async()=>{
 const entry=await file('Media/posters/series/manual-maria-wern.jpg');
 const index=buildPosterIndex({commit,tree:[entry]}, {manualSeriesPosters:[{title:'Maria Wern',year:2008,imdbId:'tt1129398',file:'manual-maria-wern.jpg'}]});
 assert.equal(index.series['Maria Wern|2008'],index.series.tt1129398);
 assert.throws(()=>buildPosterIndex({commit,tree:[entry]},{manualSeriesPosters:[{title:'X',year:2020,file:'../../secrets.jpg'}]}));
});
test('truncated trees, symlinks and ambiguous poster files cannot become live mappings',async()=>{
 const entry=await file();
 assert.throws(()=>buildPosterIndex({commit,truncated:true,tree:[entry]},{}));
 assert.throws(()=>buildPosterIndex({commit,tree:[entry,{...entry,path:entry.path.replace('.png','.jpg')}]},{}));
 assert.equal(Object.keys(buildPosterIndex({commit,tree:[{...entry,mode:'120000'}]},{}).series).length,0);
});
test('raw image bytes are verified, cached by blob SHA and support private conditional requests',async()=>{
 let reads=0;const cache=new Map();
 const service=createPosterService({loadIndex:async()=>buildPosterIndex(await snapshot(),{}),readBytes:async()=>{reads++;return bytes;},readCache:async key=>cache.get(key),writeCache:async(key,value)=>cache.set(key,value)});
 const first=await service.image('series','tt38760153');
 assert.equal(first.status,200);assert.equal(first.headers.get('Content-Type'),'image/png');
 assert.match(first.headers.get('Cache-Control'),/^private/);
 assert.deepEqual(new Uint8Array(await first.arrayBuffer()),bytes);
 const second=await service.image('series','tt38760153');assert.equal(second.status,200);assert.equal(reads,1);
 const conditional=await service.image('series','tt38760153',first.headers.get('ETag'));
 assert.equal(conditional.status,304);assert.equal(await conditional.text(),'');assert.equal(reads,1);
});
test('refresh discovers new and replaced posters in the same running service',async()=>{
 let current=await snapshot(),clock=1,indexReads=0;const changed=new Uint8Array([...bytes,0]);
 const service=createPosterService({now:()=>clock,loadIndex:async()=>{indexReads++;return buildPosterIndex(current,{});},readBytes:async entry=>entry.sha===current.tree[0].sha?changed:bytes});
 const before=await service.index();
 current={commit:'b'.repeat(40),tree:[{...await file(),sha:await gitBlobSha(changed),size:changed.length},await file('Media/posters/films/tt0903624.png')]};
 assert.equal((await service.index()).commit,before.commit);
 const after=await service.index(true);assert.equal(after.commit,current.commit);assert.equal(indexReads,2);
 assert.ok(after.films.tt0903624);
 const image=await service.image('series','tt38760153');assert.equal(image.headers.get('ETag'),'"'+current.tree[0].sha+'"');
 clock+=60001;await service.index();assert.equal(indexReads,3);
});
test('unknown keys never fetch arbitrary repository paths and corrupt/non-image data is refused',async()=>{
 let reads=0;
 const service=createPosterService({loadIndex:async()=>buildPosterIndex(await snapshot(),{}),readBytes:async()=>{reads++;return new TextEncoder().encode('<html>wrong</html>');}});
 await assert.rejects(service.image('series','../../Secrets'),e=>e.status===404);
 await assert.rejects(service.image('other','tt38760153'),e=>e.status===400);
 assert.equal(reads,0);
 await assert.rejects(service.image('series','tt38760153'),/hash|bild/i);
});
