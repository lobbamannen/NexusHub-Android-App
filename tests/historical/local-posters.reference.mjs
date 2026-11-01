import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const script=new URL('../scripts/sync-posters.mjs',import.meta.url).pathname;
test('poster importer requires an explicit Databas checkout',()=>{
 const result=spawnSync(process.execPath,[script],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/--database-root/);
});
test('poster importer preserves existing bytes and writes only to Databas Media',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'nexus-image-content-'));
 try{
  mkdirSync(path.join(root,'Media/posters/films'),{recursive:true});
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=','base64');
  const image=path.join(root,'Media/posters/films/tt0903624.png');writeFileSync(image,bytes);
  writeFileSync(path.join(root,'Media/poster-catalog.json'),JSON.stringify({movies:['tt0903624'],series:[],manualSeriesPosters:[]}));
  const result=spawnSync(process.execPath,[script,'--database-root',root],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).skipped,1);
  assert.deepEqual(readFileSync(image),bytes);assert.ok(existsSync(path.join(root,'Media/poster-catalog.json')));
  assert.equal(existsSync(path.join(root,'public')),false);assert.equal(existsSync(path.join(root,'lib/posters.generated.ts')),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
