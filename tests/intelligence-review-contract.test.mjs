import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=(p)=>readFileSync(new URL(p,root),'utf8');
test('review persists source identity, explicit local-only decision and audit',()=>{
 const store=read('app/src/main/java/se/lobbamannen/nexushub/app/IntelligenceReviewStore.kt');
 assert.match(store,/PRIMARY KEY\(run_id,proposal_index\)/);
 assert.match(store,/current\.second==proposalHash/);
 assert.match(store,/getString\("repoCommit"\)/);
 assert.match(store,/getString\("blobSha"\)/);
 assert.match(store,/syncState","local_only"/);
 assert.match(store,/intelligence_review/);
});
test('Android bridge and UI require user confirmation for each proposal',()=>{
 const main=read('app/src/main/java/se/lobbamannen/nexushub/app/MainActivity.kt');
 const ui=read('components/intelligence/NexusIntelligence.tsx');
 assert.match(main,/intelligenceReview\(id:String,index:Int,decision:String\)/);
 assert.match(main,/resumeModelWaiters\(applicationContext\)/);
 assert.match(ui,/Godkänn lokalt/);
 assert.match(ui,/Avvisa/);
 assert.match(ui,/intelligenceReviews/);
});
