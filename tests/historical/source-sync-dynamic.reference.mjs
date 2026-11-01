import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

test('Site integrity rejects database content and still detects code differences',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'nexus-code-sync-'));
 try{
  mkdirSync(path.join(root,'public'),{recursive:true});execFileSync('git',['init','-q'],{cwd:root});
  writeFileSync(path.join(root,'app.js'),'// version 1\n');
  const script=new URL('../scripts/check-sync.mjs',import.meta.url).pathname;
  const run=(...args)=>spawnSync(process.execPath,[script,'--root',root,...args],{encoding:'utf8'});
  assert.equal(run('--write').status,0);
  const original=readFileSync(path.join(root,'public/source-integrity.json'),'utf8');
  const comparison=path.join(tmpdir(),path.basename(root)+'.json');writeFileSync(comparison,original);
  try{
   writeFileSync(path.join(root,'app.js'),'// version 2\n');assert.equal(run('--write').status,0);
   assert.notEqual(run('--compare',comparison).status,0);
   mkdirSync(path.join(root,'Media'),{recursive:true});writeFileSync(path.join(root,'Media/poster-catalog.json'),'{}');
   const data=run('--write');assert.notEqual(data.status,0);assert.match(data.stderr,/Innehåll hör hemma i Databas/);
   rmSync(path.join(root,'Media'),{recursive:true});mkdirSync(path.join(root,'public/posters'),{recursive:true});writeFileSync(path.join(root,'public/posters/image.jpg'),'bytes');
   assert.notEqual(run('--write').status,0);
  }finally{rmSync(comparison,{force:true});}
 }finally{rmSync(root,{recursive:true,force:true});}
});
