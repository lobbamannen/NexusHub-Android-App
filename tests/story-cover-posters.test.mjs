import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gitBlobSha} from '../lib/github-inbox.mjs';
import {buildPosterIndex,createPosterService} from '../lib/repository-posters.mjs';

const pixels=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=','base64'));
const story='Berattelser/Internetmysterier & nätfenomen/Max Headroom - 5 av 5 ★.md';
const image='Media/story-covers/max-headroom.png';
const catalog={schemaVersion:1,covers:[{id:'max-headroom',storyMarkdownPath:story,file:image,bytes:pixels.byteLength}]};
const snap=async()=>({commit:'b'.repeat(40),truncated:false,tree:[
 {path:story,type:'blob',mode:'100644',sha:'c'.repeat(40),size:2000},
 {path:image,type:'blob',mode:'100644',sha:await gitBlobSha(pixels),size:pixels.length},
]});

test('story image index maps exact Unicode Markdown path to commit-pinned binary blob',async()=>{
 const index=buildPosterIndex(await snap(),{},catalog);
 assert.equal(index.stories[story].path,image);
 assert.equal(index.commit,'b'.repeat(40));
 assert.equal(Object.keys(index.stories).length,1);
 assert.equal(Object.keys(index.films).length,0);
});

test('unknown, missing, duplicate, tampered and unsafe story image references are rejected',async()=>{
 const snapshot=await snap();
 const invalid=[
  {...catalog,covers:[{...catalog.covers[0],file:'Media/story-covers/../other.jpg'}]},
  {...catalog,covers:[{...catalog.covers[0],file:'Media/story-covers/wrong.png'}]},
  {...catalog,covers:[{...catalog.covers[0],storyMarkdownPath:'Berattelser/Ovrigt/nonexistent.md'}]},
  {...catalog,covers:[{...catalog.covers[0],bytes:99999}]},
  {...catalog,covers:[...catalog.covers,catalog.covers[0]]},
  {...catalog,covers:[{...catalog.covers[0],id:'../../bad'}]},
 ];
 for(const input of invalid)assert.throws(()=>buildPosterIndex(snapshot,{},input));
 assert.throws(()=>buildPosterIndex({...snapshot,truncated:true},{},catalog));
 assert.throws(()=>buildPosterIndex({...snapshot,tree:snapshot.tree.map(e=>e.path===image?{...e,mode:'120000'}:e)},{},catalog));
});

test('story images use existing poster service, Git blob integrity, private caching and ETags',async()=>{
 let reads=0;const cached=new Map();
 const service=createPosterService({
  loadIndex:async()=>buildPosterIndex(await snap(),{},catalog),
  readBytes:async()=>{reads++;return pixels;},
  readCache:async sha=>cached.get(sha),
  writeCache:async(sha,bytes)=>{cached.set(sha,bytes);}
 });
 const result=await service.image('stories',story);
 assert.equal(result.status,200);
 assert.equal(result.headers.get('Content-Type'),'image/png');
 assert.match(result.headers.get('Cache-Control'),/^private/);
 assert.equal(result.headers.get('X-Nexus-Poster-Source'),'github');
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),pixels);
 const second=await service.image('stories',story);
 assert.equal(second.status,200);assert.equal(reads,1);
 const notModified=await service.image('stories',story,second.headers.get('ETag'));
 assert.equal(notModified.status,304);
 await assert.rejects(service.image('stories','../../.env'),e=>e.status===404);
 assert.equal(reads,1);
});

test('existing media and story UI all reference the same GitHub-backed image endpoint',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.match(read('app/api/posters/route.ts'),/story-covers\/catalog\.json/);
 assert.match(read('components/repository-poster.tsx'),/stories/);
 assert.match(read('app/stories.tsx'),/RepositoryPoster kind="stories"/);
 assert.match(read('components/home/RecentActivity.tsx'),/kind="story"/);
 assert.match(read('app/portal.tsx'),/RepositoryPoster kind="stories"/);
 assert.match(read('app/stories.css'),/story-cover>img/);
 assert.match(read('app/stories.css'),/aspect-ratio:2\/3/);
 assert.match(read('app/api/posters/route.ts'),/buildPosterIndex\(snapshot,movieCatalog\)/);
});
