import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('local model workloads enforce battery, thermal and RAM gates',()=>{
 const resources=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceResourcePolicy.kt');
 assert.match(resources,/Batterinivån/);
 assert.match(resources,/THERMAL_STATUS_SEVERE/);
 assert.match(resources,/MIN_MEMORY_BYTES/);
 const worker=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceWorker.kt');
 assert.match(worker,/Result\.retry\(\)/);
 assert.match(worker,/waiting_resource/);
 assert.match(worker,/15,TimeUnit\.MINUTES/);
 assert.match(worker,/minOf\(512,runtime\.profile\(\)\.getInt\("maxOutputTokens"\)\)/);
});
