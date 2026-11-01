import test from 'node:test';
import assert from 'node:assert/strict';
import {extractReferences} from '../lib/connections.mjs';

test('explicit JSON paths are repository rooted, including new and temporary roots',()=>{
  for(const path of ['00-Inkorg/test.md','NexusHub inkorg/a/report.md','Anvandaren/Robin.md','Ekonomi/Robin/budget.json','FutureRoot/new.md']) {
    assert.deepEqual(extractReferences(JSON.stringify({path}),'Research/example.md').paths,[path]);
  }
});
test('Markdown retains document-relative and explicit root-relative references',()=>{
  const refs=extractReferences('[a](./Ekonomi/a.md) [b](../Kalender/event.md) [c](/00-Inkorg/a.md)','Research/example.md');
  assert.deepEqual(refs.paths,['Research/Ekonomi/a.md','Kalender/event.md','00-Inkorg/a.md']);
});
test('reference normalization rejects escaping, malformed escapes, schemes and backslashes',()=>{
  for(const path of ['../outside.md','/../../outside.md','bad%XX','javascript:alert(1)','C:\\private\\a.md']) {
    assert.deepEqual(extractReferences(JSON.stringify({path}),'Research/example.md').paths,[]);
  }
});
