import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('index builds out of sight and changes generation in one transaction',()=>{
 const s=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceIndexStore.kt');
 assert.match(s,/CREATE TABLE staging_documents/);
 assert.match(s,/staging_documents.*ORDER BY path/);
 assert.match(s,/setMeta\(db,"completed",commit\)/);
 assert.match(s,/setMeta\(db,"ready","true"\)/);
 assert.doesNotMatch(s,/fun begin\([\s\S]{0,500}setMeta\(db,"ready","false"\)/);
});
test('non-AI index runs and recovery use durable store',()=>{
 const s=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceWorker.kt');
 assert.match(s,/fun indexCompleted\(/);
 assert.match(s,/fun reconcile\(/);
 assert.match(s,/ExistingWorkPolicy\.KEEP/);
 const m=read('app/src/main/java/se/lobbamannen/nexushub/app/MainActivity.kt');
 assert.match(m,/IntelligenceJobs\.indexCompleted\(/);
 assert.match(m,/IntelligenceJobs\.reconcile\(/);
});
