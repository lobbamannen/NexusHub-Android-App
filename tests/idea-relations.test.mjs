import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../platform/idea-relations.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ideaProbes,rankIdeaRelations}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const hit=(path,text,cosine,score=0.015)=>({chunk:{path,id:path+'#0',text,title:path,heading:'',index:0,sha:'a',kind:'report'},cosine,score,lexicalRank:1,semanticRank:1,reason:'hybrid'});

test('uses later idea sections, not just the first 1200 characters',()=>{
 const idea='Intro. '+('Allmän information. '.repeat(80))+'\n\nFörändringsbevakning ska upptäcka ändringar och utlösa händelser.';
 const probes=ideaProbes(idea);
 assert.ok(probes.some(p=>p.includes('Förändringsbevakning')));
 assert.ok(probes.length>1);
});
test('generic technology overlap is insufficient for a relationship',()=>{
 const idea='Bygg automatisk förändringsbevakning som upptäcker nya rapporter och skickar notifieringar.';
 const general=hit('generic','Android AI och databaser på telefonen',0.78);
 assert.equal(rankIdeaRelations(idea,[[general]]).length,0);
});
test('complementary evidence across separate idea probes is eligible',()=>{
 const idea='Händelsestyrda flöden ska bearbeta ändringar. Automatisk förändringsbevakning ska skicka notifieringar.';
 const evidence=hit('händelsestyrda flöden','En händelsestyrd lösning bearbetar ändringar från en bevakning och notifierar vid behov.',0.82);
 const candidates=rankIdeaRelations(idea,[[evidence],[evidence]]);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].confidence,'strong');
 assert.equal(candidates[0].matchedProbes,2);
});
test('different chunks of same document count as one candidate',()=>{
 const idea='Förändringsbevakning ska upptäcka ändringar och skicka notifieringar.';
 const a=hit('report','Förändringsbevakning upptäcker ändringar',0.82);
 const b={...hit('report','Notifieringar skickas från ändringsbevakning',0.83),chunk:{...a.chunk,id:'report#1',text:'Notifieringar skickas från ändringsbevakning'}};
 const candidates=rankIdeaRelations(idea,[[a,b]]);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].evidenceCount,2);
});

test('short EmbeddingGemma idea prefers focused research over incidental mentions',()=>{
 const idea='Lägga till EmbeddingGemma till NexusHub';
 const focused=hit('EmbeddingGemma 2 research','EmbeddingGemma används för semantiska sökningar och embeddings.',0.75);
 const incidental=hit('AI overview','Android AI databaser och EmbeddingGemma nämns som ett exempel.',0.79);
 const result=rankIdeaRelations(idea,[[incidental,focused]]);
 assert.equal(result[0]?.hit.chunk.path,'EmbeddingGemma 2 research');
 assert.equal(result[0]?.confidence,'strong');
 assert.ok(!result.some(x=>x.hit.chunk.path==='AI overview'));
});
