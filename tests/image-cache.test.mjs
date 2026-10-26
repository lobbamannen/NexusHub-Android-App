import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageCache} from '../lib/image-cache.mjs';

test('two cards with the same poster share one image download and blob URL',async()=>{
 let reads=0;const revoked=[];
 const cache=createImageCache({load:async()=>{reads++;return {size:3};},create:()=>'blob:shared',revoke:url=>revoked.push(url)});
 const a=cache.acquire('/api/posters?key=abc'),b=cache.acquire('/api/posters?key=abc');
 assert.equal(await a.source,'blob:shared');assert.equal(await b.source,'blob:shared');assert.equal(reads,1);
 a.release();b.release();assert.deepEqual(revoked,[]);
});
test('released posters are evicted within the byte bound; live images stay attached',async()=>{
 let next=0;const revoked=[];
 const cache=createImageCache({load:async()=>({size:4}),create:()=>`blob:${++next}`,revoke:url=>revoked.push(url),maxBytes:5,maxEntries:3});
 const first=cache.acquire('a');await first.source;
 const second=cache.acquire('b');await second.source;
 assert.deepEqual(revoked,[]);first.release();assert.deepEqual(revoked,['blob:1']);
 second.release();
});
test('failed downloads can be tried again',async()=>{
 let count=0;const cache=createImageCache({load:async()=>{if(++count===1)throw Error('offline');return {size:2};},create:()=> 'blob:ok',revoke:()=>{}});
 const a=cache.acquire('x');await assert.rejects(a.source);a.release();
 const b=cache.acquire('x');assert.equal(await b.source,'blob:ok');b.release();
});
