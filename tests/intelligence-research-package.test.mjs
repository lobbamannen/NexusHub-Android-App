import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntelligenceResearchPackage} from '../lib/intelligence-research-package.mjs';
const id='123e4567-e89b-42d3-a456-426614174000',blob='a'.repeat(40),commit='b'.repeat(40);
const run={id,workflow:'idea_analysis',state:'local_completed',objectId:id,objectVersion:blob,result:{
 topic:'Gemma',indexCommit:commit,modelSha256:'1'.repeat(64),promptVersion:'v1',
 proposals:[{status:'proposal',path:'Research/example.md',blobSha:blob,repoCommit:commit,
  quote:'Detta är ett källbundet direktcitat.',reason:'Gemensamt ämne',confidence:0.6}],
 nextActions:['Granska evidensen']
}};
test('package separates source evidence from model conclusions and local decisions',()=>{
 const p=createIntelligenceResearchPackage(run,[{proposalIndex:0,decision:'approved'}],'2026-10-30T10:00:00Z');
 assert.equal(p.kind,'nexus_intelligence_research_package');
 assert.equal(p.sourceEvidence[0].epistemicStatus,'ai_proposal_not_fact');
 assert.equal(p.sourceEvidence[0].review,'approved');
 assert.equal(p.sourceEvidence[0].published,false);
 assert.equal(p.dataProvenance.indexCommit,commit);
 assert.equal(p.summary.approved,1);
});
test('refuses invalid source identities and unfinished runs',()=>{
 assert.throws(()=>createIntelligenceResearchPackage({...run,state:'running'}),/färdiga/);
 assert.throws(()=>createIntelligenceResearchPackage({...run,result:{...run.result,proposals:[{...run.result.proposals[0],blobSha:'no'}]}}),/ogiltig/);
});
