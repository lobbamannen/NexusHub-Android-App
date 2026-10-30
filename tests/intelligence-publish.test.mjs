import test from 'node:test';
import assert from 'node:assert/strict';
import {publishApprovedIntelligenceRelation as publish,intelligenceRelationId} from '../lib/intelligence-publish.mjs';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40),h='1'.repeat(64),id='123e4567-e89b-42d3-a456-426614174000';
const path='Research/verified.md';
const proposal={status:'proposal',path,blobSha:b,repoCommit:c,quote:'Exakt citerat avsnitt ur dokumentet.',reason:'Samma ämne i forskning'};
const run={id,objectId:id,objectVersion:a,workflow:'idea_analysis',state:'local_completed',result:{proposals:[proposal]}};
const decision={proposalIndex:0,decision:'approved',proposalHash:h,path,blobSha:b,repoCommit:c,quote:proposal.quote};
const mock=()=>{let calls=0,relations=[];const client={
 readIdea:async()=>({sha:a}),browse:async()=>({type:'file',sha:b}),
 readConnections:async()=>({sha:relations.length?a:null,data:{relations}}),
 saveConnection:async(change,expected)=>{calls++;if(expected!==(relations.length?a:null))throw Error('CAS');
  const rel=change.relation;if(!relations.some(r=>r.id===rel.id))relations.push({...rel,status:'active'});
  return {sha:a};},head:async()=>c
 };return {client,count:()=>calls,relations:()=>relations};};
test('publishes an explicit approved source-bound idea relationship and verifies read-back',async()=>{
 const m=mock();const receipt=await publish(run,0,decision,m.client);
 assert.equal(receipt.publicationState,'github_verified');
 assert.equal(receipt.registrySha,a);
 assert.equal(m.relations().length,1);
 assert.equal(m.relations()[0].id,intelligenceRelationId(id,0));
 await publish(run,0,decision,m.client);
 assert.equal(m.relations().length,1);
});
test('refuses unapproved or stale sources before any write',async()=>{
 const m=mock();
 await assert.rejects(publish(run,0,{...decision,decision:'rejected'},m.client),/godkänna/);
 await assert.rejects(publish({...run,objectVersion:b},0,decision,m.client),/ändrats/);
 await assert.rejects(publish(run,0,decision,{...m.client,browse:async()=>({type:'file',sha:a})}),/ändrats/);
 assert.equal(m.count(),0);
});
