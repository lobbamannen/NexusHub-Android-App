import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('document analysis is tied to verified local indexed content',()=>{
 const worker=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceWorker.kt');
 const index=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceIndexStore.kt');
 assert.match(worker,/fun document\(context:Context,path:String\)/);
 assert.match(worker,/sourceSha/);
 assert.match(worker,/sourceCommit/);
 assert.match(worker,/Källdokumentet ändrades under analys/);
 assert.match(index,/fun document\(path:String\)/);
});
test('incremental sync queues bounded research analysis rather than a flood',()=>{
 const worker=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceWorker.kt');
 const index=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceIndexStore.kt');
 assert.match(worker,/fun drainInbox\(context:Context\)/);
 assert.match(worker,/hasPendingDocument/);
 assert.match(index,/CREATE TABLE pending_analysis/);
 assert.match(index,/NexusHub inkorg/);
 const ui=read('components/intelligence/NexusIntelligence.tsx');
 assert.match(ui,/Analysera dokument/);
});
