import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGemmaContext} from '../lib/gemma-context.mjs';
test('oversized previous assistant answers cannot poison subsequent questions or mutate history',()=>{
 const history=[{role:'user',content:'previous'},{role:'assistant',content:'x'.repeat(12001)}];
 const next=buildGemmaContext(history,'new question');assert.deepEqual(next.messages,[{role:'user',content:'new question'}]);assert.equal(next.omittedTurns,1);assert.equal(history[1].content.length,12001);
});
test('context drops complete old turns while keeping the entire current question',()=>{
 const old=Array.from({length:8},()=>[{role:'user',content:'q'.repeat(4000)},{role:'assistant',content:'a'.repeat(4000)}]).flat();
 const next=buildGemmaContext(old,'z'.repeat(12000));assert.equal(next.messages.at(-1).content.length,12000);assert.equal(next.messages.length%2,1);assert.ok(next.omittedTurns>0);assert.equal(old.length,16);assert.ok(JSON.stringify(next.messages).length<=36000);
});
test('serialized escaping and per-message bridge limits are enforced without truncation',()=>{
 assert.throws(()=>buildGemmaContext([],'x'.repeat(12001)),/stor/);
 const next=buildGemmaContext([{role:'user',content:'u'.repeat(12000)},{role:'assistant',content:'\\'.repeat(12000)}],'new');assert.equal(next.omittedTurns,1);assert.equal(next.messages.length,1);
});
