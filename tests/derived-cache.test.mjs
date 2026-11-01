import test from 'node:test';
import assert from 'node:assert/strict';
import {createDerivedCache} from '../lib/derived-cache.mjs';

function setup(maxBytes=180) {
 const data=new Map();let tick=0;
 const store={get:async k=>structuredClone(data.get(k)),set:async(k,v)=>{data.set(k,structuredClone(v));},remove:async k=>{data.delete(k);},keys:async prefix=>[...data.keys()].filter(k=>k.startsWith(prefix))};
 return {data,cache:createDerivedCache({...store,maxBytes,now:()=>++tick}),store};
}
test('derived cache evicts old reconstructible values and preserves protected data',async()=>{
 const {data,cache}=setup();
 for(const key of ['outbox-receipt:v1:a','incoming:v1:a','incoming-removed:v1:a','mirror/databas/a','nexus-idea-decision:v1:a'])data.set(key,{original:true});
 const a='connections:extract:v3:a',b='training:projection:v2:b',c='connections:source:v1:c';
 await cache.set(a,'a'.repeat(70));await cache.set(b,'b'.repeat(70));
 await cache.get(a);await cache.set(c,'c'.repeat(70));
 assert.equal(await cache.get(b),undefined);assert.equal((await cache.get(a)).length,70);
 for(const key of ['outbox-receipt:v1:a','incoming:v1:a','incoming-removed:v1:a','mirror/databas/a','nexus-idea-decision:v1:a'])assert.deepEqual(data.get(key),{original:true});
 await assert.rejects(cache.set('incoming:v1:bad','x'),/cache/i);
});
test('migration accounts for old cache entries without metadata and survives interrupted pruning',async()=>{
 const {cache,data,store}=setup(100);
 data.set('connections:source:v1:old','x'.repeat(70));
 await cache.set('connections:source:v1:new','n'.repeat(70));
 assert.equal(await store.get('connections:source:v1:old'),undefined);
 assert.equal((await cache.get('connections:source:v1:new')).length,70);
 // Missing metadata is recoverable on the next maintenance operation.
 for(const key of data.keys())if(key.startsWith('derived-cache-meta:v1:'))data.delete(key);
 await cache.prune();assert.equal((await cache.get('connections:source:v1:new')).length,70);
});
test('returned derived values remain usable while cache entries are pruned',async()=>{
 const {cache}=setup(80);await cache.set('nexus-idea-retrieval:v2:doc:a',{chunks:['saved']});
 const held=await cache.get('nexus-idea-retrieval:v2:doc:a');
 await cache.set('nexus-idea-retrieval:v2:doc:b','b'.repeat(70));
 assert.deepEqual(held,{chunks:['saved']});
});
test('restart measures durable bytes after interrupted value and metadata replacement',async()=>{
 const {data,cache}=setup(100),key='connections:source:v1:updated';
 data.set(key,'x'.repeat(250));data.set('derived-cache-meta:v1:'+key,{bytes:3,used:1});
 assert.equal(await cache.prune(),0);assert.equal(data.has(key),false);
});
