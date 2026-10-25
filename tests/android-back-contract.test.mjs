import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const androidBackSelector='.reader-toolbar .text-button';

test('each nested reader exposes the Android app back-button selector',()=>{
 for(const [path,button] of [
  ['app/films.tsx','Till biblioteket'],
  ['app/series.tsx','Till serierna'],
  ['app/stories.tsx','Till ']
 ]){
  const source=read(path);
  assert.match(source,/<div className="[^"]*reader-toolbar[^"]*"[^>]*>[\s\S]{0,300}<button[^>]*className="[^"]*text-button[^"]*"/,
   `${path} needs a text-button inside a reader-toolbar wrapper`);
  assert.ok(source.includes(button),`${path} must retain its visible back label`);
 }
 assert.equal(androidBackSelector,'.reader-toolbar .text-button');
});
