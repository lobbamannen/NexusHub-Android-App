import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../platform/idea-excerpt.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {readableIdeaExcerpt}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const window=(index,text)=>({id:'doc#'+index,index,text});

test('keeps full Markdown table lines instead of cutting in the middle',()=>{
 const body='## Jämförelse\n\n| Modell | Dim | Kontext |\n| --- | --- | --- |\n| EmbeddingGemma 1 | 768 | 2048 |\n| EmbeddingGemma 2 | 768 | 8192 |\n\n## Nästa rubrik\n\nAndra ämnen.';
 const w=[window(0,body.slice(0,130)),window(1,body.slice(70,195)),window(2,body.slice(140))];
 const result=readableIdeaExcerpt(w,1,800);
 assert.ok(result?.text.includes('| EmbeddingGemma 2 | 768 | 8192 |'));
 assert.ok(result?.text.includes('| EmbeddingGemma 1 | 768 | 2048 |'));
 assert.ok(!result?.text.includes('V\n[…]'));
 assert.deepEqual(result?.contextIndices,[0,1,2]);
});
test('preserves exact source window and marks truncated context',()=>{
 const blocks=Array.from({length:18},(_,i)=>'## Section '+i+'\n\n'+('Innehåll '+i+' '.repeat(18))).join('\n\n');
 const w=[window(0,blocks.slice(0,800)),window(1,blocks.slice(700,1500)),window(2,blocks.slice(1400))];
 const result=readableIdeaExcerpt(w,1,450);
 assert.equal(result?.windowIndex,1);
 assert.ok(result?.text.length);
 assert.ok(result?.text.length<600);
 assert.ok(!result?.text.includes('\\n'));
});
test('returns null for missing window',()=>{
 assert.equal(readableIdeaExcerpt([window(0,'Hej')],9),null);
});
