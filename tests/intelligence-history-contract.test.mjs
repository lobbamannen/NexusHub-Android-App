import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('run history is paginated and recoverable beyond the first 200 rows',()=>{
 const runs=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceRunStore.kt');
 const worker=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceWorker.kt');
 const ui=read('components/intelligence/NexusIntelligence.tsx');
 assert.match(runs,/fun list\(limit: Int = 50, offset: Int = 0\)/);
 assert.match(runs,/OFFSET \$offset/);
 assert.match(worker,/while\(offset<=100000\)/);
 assert.match(ui,/Läs in äldre körningar/);
});
