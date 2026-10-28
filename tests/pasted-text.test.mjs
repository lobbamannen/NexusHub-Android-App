import test from 'node:test';import assert from 'node:assert/strict';
import {pastedTextDocument,textSourceLabel} from '../lib/pasted-text.mjs';
const original='  # Rapport åäö 😎\r\n\r\n```mermaid\r\ngraph TD\r\n A-->B\r\n```\r\n[Webb](https://example.com/?a=1&b=2)\n\n';
test('raw Markdown preserves every character and records source separately',()=>{
 const d=pastedTextDocument(original,' DeepSeek ','2026-10-28T20:00:00.000Z');assert.equal(d.content,original);assert.equal(d.sourceLabel,'DeepSeek');assert.match(d.name,/DeepSeek.*\.md$/);assert.equal(d.mime,'text/markdown;charset=utf-8');
});
test('source can be omitted and cannot turn into a path or multiline label',()=>{
 const d=pastedTextDocument(original,'','2026-10-28T20:00:00Z');assert.equal(d.sourceLabel,undefined);assert.match(d.name,/\.md$/);assert.ok(!d.content.startsWith('---'));
 assert.ok(!pastedTextDocument(original,'../AI/"test"','2026-10-28T20:00:00Z').name.includes('/'));
 assert.throws(()=>textSourceLabel('AI\nannan rad'));assert.throws(()=>textSourceLabel('x'.repeat(121)));assert.throws(()=>pastedTextDocument(' \n\t','','2026-10-28T20:00:00Z'));
});
test('long research is not truncated',()=>{const text=original.repeat(10000);assert.equal(pastedTextDocument(text,undefined,'2026-10-28T20:00:00Z').content,text);});
test('textarea selection and edits preserve mixed original line endings',async()=>{
 const {replacePastedSelection,reconcilePastedEdit}=await import('../lib/pasted-text.mjs');const mixed='A\r\nB\rC\nD';
 assert.equal(replacePastedSelection(mixed,2,3,'😎\r\nX'), 'A\r\n😎\r\nX\rC\nD');
 assert.equal(reconcilePastedEdit(mixed,'A\nBee\nC\nD'),'A\r\nBee\rC\nD');
 assert.equal(reconcilePastedEdit(mixed,'A\nB\nC\nD'),mixed);assert.equal(replacePastedSelection('',0,0,original),original);
});
