import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
test('64K selectable and validated through NexusHub UI, profile and pinned JNI',()=>{
 const cpp=read('app/src/main/cpp/llama-android-accelerated.cpp');
 const runtime=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceRuntime.kt');
 const ui=read('components/intelligence/NexusIntelligence.tsx');
 assert.match(cpp,/g_engine\.context_size\s*=\s*std::clamp\(\(int\)contextSize, 1024, 65536\)/);
 assert.match(runtime,/Triple\("contextSize",1024,65536\)/);
 assert.match(runtime,/initialized\.optInt\("active_ctx_size",-1\)/);
 assert.match(runtime,/appliedContext==p\.getInt\("contextSize"\)/);
 assert.match(ui,/contextSize:\['1024','2048','4096','8192','16384','32768','65536'\]/);
 assert.match(ui,/key==='contextSize'\?Number\(e\.target\.value\)/);
});
test('default stays at 8192 and runtime rejects silent context clamp',()=>{
 const runtime=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceRuntime.kt');
 assert.match(runtime,/\.put\("contextSize",8192\)/);
 assert.match(runtime,/Ingen tyst nedskalning tillåts/);
});
