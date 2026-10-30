const sha=/^[a-f0-9]{40}$/;
const uuid=/^[a-f0-9-]{36}$/i;
const clean=v=>typeof v==='string'?v.slice(0,3000):'';
/**
 * Shareable, deterministic report. Claims remain marked as AI proposals;
 * citations remain anchored to exact Git blob+commit and never imply truth.
 */
export function createIntelligenceResearchPackage(run,reviews=[],generatedAt=new Date().toISOString()) {
 if(!run||!uuid.test(run.id)||!['local_completed','completed'].includes(run.state))
  throw Error('Endast färdiga lokala körningar kan bli forskningspaket.');
 if(!Array.isArray(reviews))throw Error('Beslutsregistret måste vara en lista.');
 const result=run.result||{};
 const source=result.indexCommit;
 const proposals=Array.isArray(result.proposals)?result.proposals:[];
 const items=proposals.map((p,index)=>{
  if(!p||p.status!=='proposal'||!sha.test(p.blobSha||'')||!sha.test(p.repoCommit||'')||
    typeof p.path!=='string'||p.path.length>1000||typeof p.quote!=='string'||!p.quote.trim())
   throw Error('Förslagets källreferens är ogiltig.');
  const decision=reviews.find(r=>r.proposalIndex===index);
  return {
   proposalIndex:index,path:p.path,blobSha:p.blobSha,repoCommit:p.repoCommit,
   verbatimQuote:clean(p.quote),modelReason:clean(p.reason),
   modelConfidence:Number.isFinite(p.confidence)?p.confidence:null,
   epistemicStatus:'ai_proposal_not_fact',
   review:decision?.decision||'pending',
   published:!!decision?.publicationSha,
   publicationSha:decision?.publicationSha||null
  };
 });
 const missing=Array.isArray(result.nextActions)?result.nextActions.map(clean).slice(0,12):[];
 return {
  schemaVersion:1,kind:'nexus_intelligence_research_package',
  createdAt:generatedAt,
  run:{id:run.id,workflow:run.workflow,startedAt:run.startedAt,updatedAt:run.updatedAt,
       sourceObjectId:run.objectId||null,sourceObjectVersion:run.objectVersion||null},
  dataProvenance:{source:'verified_local_databas_replica',indexCommit:source||null,
    modelSha256:result.modelSha256||null,promptVersion:result.promptVersion||null,
    workflowVersion:result.workflowVersion||null},
  summary:{topic:clean(result.topic),keywords:result.keywords||[],
    candidatesConsidered:result.candidatesConsidered??0,proposals:items.length,
    approved:items.filter(p=>p.review==='approved').length,
    published:items.filter(p=>p.published).length},
  sourceEvidence:items,questionsAndNextActions:missing,
  limitations:['AI-genererade samband är inte verifierade fakta.',
    'Ett ordagrant citat visar endast förekomst i angivet källmaterial.',
    'Källversionskontroll krävs på nytt före framtida publicering.']
 };
}
