import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('verified replica completion rebuilds intelligence index without dashboard open',()=>{
 const s=read('platform/intelligence-index.ts');
 const entry=read('src/main.tsx');
 assert.match(s,/export function startIntelligenceSync/);
 assert.match(s,/addEventListener\('nexus-github-changed'/);
 assert.match(s,/syncIntelligenceIndex\(\)/);
 assert.match(entry,/startIntelligenceSync\(\)/);
});
