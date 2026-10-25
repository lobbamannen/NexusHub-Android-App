import test from 'node:test';
import assert from 'node:assert/strict';
import {storyFromDocument,storyList,storyExcerpt} from '../lib/stories.mjs';

const doc=(name,category='Hemsökta hus')=>({
 path:'Berattelser/'+category+'/'+name+'.md',formats:[
 {path:'Berattelser/'+category+'/'+name+'.docx',format:'docx',sha:'a'.repeat(40)},
 {path:'Berattelser/'+category+'/'+name+'.md',format:'md',sha:'b'.repeat(40)}]
});

test('kanonisk berättelse samlar Markdown och DOCX som en enda post',()=>{
 const a=doc('Borgvattnets prästgård — 4,5 av 5 ★');
 const items=storyList([a,{...a,path:a.path.replace('.md','.docx')}]);
 assert.equal(items.length,1);
 assert.equal(items[0].title,'Borgvattnets prästgård');
 assert.equal(items[0].ratingLabel,'4,5/5');
 assert.equal(items[0].numericRating,4.5);
 assert.ok(items[0].docx.endsWith('.docx'));
 assert.ok(items[0].markdown.endsWith('.md'));
});
test('intervallet 3,5–4 får behålla intervall utan falskt entydigt betyg',()=>{
 const x=storyFromDocument(doc('Man from Taured  —  John Zegrus — 3,5–4 av 5 ★','Historiska & paranormala mysterier'));
 assert.equal(x.title,'Man from Taured  —  John Zegrus');
 assert.equal(x.ratingLabel,'3,5–4/5');
 assert.equal(x.numericRating,null);
});
test('kvalitativa omdömen blir inte siffror',()=>{
 const x=storyFromDocument(doc('Lake City Quiet Pills — Bra','Internetmysterier & nätfenomen'));
 assert.equal(x.title,'Lake City Quiet Pills');
 assert.equal(x.ratingLabel,'Bra');assert.equal(x.numericRating,null);
 const y=storyFromDocument(doc('Calcott Hall - Obetygsatt','Historiska & paranormala mysterier'));
 assert.equal(y.title,'Calcott Hall');assert.equal(y.ratingLabel,'Obetygsatt');
});
test('innehållet från metadata-mappar och andra moduler kan inte felklassificeras',()=>{
 assert.equal(storyFromDocument({path:'Filmer/register.json'}),null);
 assert.equal(storyFromDocument({path:'Berattelser/kopieringsmanifest.json'}),null);
 assert.equal(storyFromDocument({path:'Berattelser/.gitkeep'}),null);
});
test('ingressen härleds endast från originaltext, utan extra påståenden',()=>{
 const body='**Betyg:** 5/5\n\n# Mysteriet\n\nEn dokumenterad händelse beskrevs av flera personer som vittnade om samma observation, men källorna var oeniga om när allt inträffade och vad som egentligen hade hänt.\n\nKällor följer.';
 assert.match(storyExcerpt(body),/En dokumenterad händelse/);
 assert.doesNotMatch(storyExcerpt(body),/Betyg/);
});
