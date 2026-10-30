import {contentCandidate} from './connections.mjs';

const gitSha=/^[a-f0-9]{40}$/;
const proposalHash=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9-]{36}$/i;
const validPath=p=>typeof p==='string'&&p.length>0&&p.length<=1000&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..');
export const intelligenceRelationId=(runId,index)=>{
 if(!uuid.test(runId)||!Number.isSafeInteger(index)||index<0||index>100)throw Error('Ogiltigt körnings-ID eller förslag');
 return 'nexus-intelligence:'+runId+':'+index;
};
const nodeId=path=>'databas:'+path.replace(/\.(md|txt|pdf|docx)$/i,'');

/**
 * This is the only publishing operation. Never called by the model or worker:
 * a human must first approve a source-bound proposal and click Publish.
 * GitHub's existing connections CAS writer owns serialization and idempotence.
 */
export async function publishApprovedIntelligenceRelation(run,index,review,client){
 if(!run||run.workflow!=='idea_analysis'||!['local_completed','completed'].includes(run.state))
  throw Error('Endast en avslutad, GitHub-verifierad idéanalys kan publiceras.');
 if(!uuid.test(run.id)||!uuid.test(run.objectId)||!gitSha.test(run.objectVersion||''))
  throw Error('Idéns identitet eller källversion är ogiltig.');
 const proposal=run.result?.proposals?.[index];
 if(!proposal||proposal.status!=='proposal'||review?.proposalIndex!==index||review.decision!=='approved')
  throw Error('Du måste först godkänna det specifika förslaget.');
 if(!proposalHash.test(review.proposalHash||'')||proposal.path!==review.path||
    proposal.blobSha!==review.blobSha||proposal.repoCommit!==review.repoCommit||
    proposal.quote!==review.quote)
  throw Error('Beslut och källunderlag stämmer inte överens.');
 if(!validPath(proposal.path)||!contentCandidate(proposal.path)||!gitSha.test(proposal.blobSha||'')||
    !gitSha.test(proposal.repoCommit||'')||typeof proposal.quote!=='string'||
    proposal.quote.length<12||proposal.quote.length>250)
  throw Error('Källan är inte en godkänd dokumenttyp eller saknar verifierbara identiteter.');
 const idea=await client.readIdea(run.objectId);
 if(!idea||idea.sha!==run.objectVersion)
  throw Error('Idén har ändrats eller raderats på GitHub. Kör om analysen.');
 const target=await client.browse(proposal.path);
 if(target.type!=='file'||target.sha!==proposal.blobSha)
  throw Error('Forskningskällan har ändrats eller raderats. Kör om analysen.');
 const relation={
  id:intelligenceRelationId(run.id,index),from:nodeId('Ideer/'+run.objectId+'.json'),
  to:nodeId(proposal.path),type:'related',
  note:('Nexus Intelligence – användargodkänd relation. Citat: '+proposal.quote+
    '. Motivering: '+String(proposal.reason||'')).slice(0,1950)
 };
 if(relation.from===relation.to)throw Error('Ett dokument kan inte kopplas till sig självt.');
 const current=await client.readConnections();
 const written=await client.saveConnection({action:'add',relation},current.sha);
 if(!gitSha.test(written.sha||''))throw Error('GitHub svarade utan verifierbar filidentitet.');
 // Read back the authoritative register, including after an uncertain prior PUT.
 const check=await client.readConnections();
 if(check.sha!==written.sha||!check.data?.relations?.some(r=>
   r.id===relation.id&&r.from===relation.from&&r.to===relation.to&&
   r.type===relation.type&&r.note===relation.note&&r.status==='active'))
  throw Error('Kopplingen kunde inte verifieras genom återläsning av GitHub.');
 const latestCommit=await client.head();
 if(!gitSha.test(latestCommit))throw Error('GitHub saknar verifierad HEAD.');
 return {runId:run.id,proposalIndex:index,proposalHash:review.proposalHash,
  registrySha:check.sha,registryCommit:latestCommit,relationId:relation.id,
  publicationState:'github_verified'};
}
