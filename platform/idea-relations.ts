import type {Hit} from './idea-retrieval';

export type EvidenceClass='direct'|'background'|'uncertain';
export type RelationCandidate={hit:Hit;confidence:'strong'|'possible';evidenceClass:EvidenceClass;evidenceTerms:string[];distinctPassages:number;evidenceCount:number;score:number;matchedProbes:number;reason:string};
const generic=new Set(['android','appen','app','appar','nexushub','github','databas','databaser','data','system','teknik','teknisk','tekniska','funktion','funktioner','ai','modell','modeller','dokument','rapport','rapporter','information','användare','användaren','lösning','lösningar','lokal','lokala','skapa','använda','kunna','automatiskt','intelligens','intelligent','genom','mellan','olika','samma','flera','eller','också','detta','denna','dessa','inte','vara','göra','samt','till','från','med','för','och','att','som','den','det','ett','har','kan','ska','vid','över','under','the','and','use','using','systemet','utifrån','andra','alla','utan','lägga','jämför','jämföra','jämförelse','lägga','implementera','införa','bygga','utveckla','stödja','hantera','tillägg']);
export function distinctiveTerms(value:string):string[]{
 return [...new Set((value.toLocaleLowerCase('sv-SE').normalize('NFKC').match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(w=>!generic.has(w)))];
}
// Multiple independent portions of an idea keep important requirements after the opening paragraph searchable.
export function ideaProbes(text:string):string[]{
 const cleaned=text.replace(/\r/g,'').trim();
 if(!cleaned)return [];
 const segments=cleaned.split(/(?<=[.!?])\s+|\n{2,}/).map(s=>s.trim()).filter(Boolean);
 if(segments.length>1&&cleaned.length<=850)return segments.slice(0,4);
 const probes:string[]=[];let current='';
 for(const segment of segments){
  if(current&&current.length+segment.length+1>850){probes.push(current);current='';}
  if(segment.length>850){if(current){probes.push(current);current='';}for(let i=0;i<segment.length;i+=850)probes.push(segment.slice(i,i+850));}
  else current+=(current?' ':'')+segment;
 }
 if(current)probes.push(current);
 return probes.length<=4?probes:[probes[0],probes[Math.floor((probes.length-1)/3)],probes[Math.floor(2*(probes.length-1)/3)],probes[probes.length-1]];
}
export function rankIdeaRelations(ideaText:string,searches:Hit[][],limit=6):RelationCandidate[]{
 const terms=new Set(distinctiveTerms(ideaText));
 const shortIdea=terms.size<=3;
 const byDocument=new Map<string,{best:Hit;scores:number[];probes:Set<number>;windows:Set<string>;matches:Set<string>;titleMatches:Set<string>;focusedWindows:number;windowTerms:Map<number,Set<string>>}>();
 searches.forEach((hits,probe)=>{
  for(const hit of hits){
   const path=hit.chunk.path;
   let candidate=byDocument.get(path);
   if(!candidate){candidate={best:hit,scores:[],probes:new Set(),windows:new Set(),matches:new Set(),titleMatches:new Set(),focusedWindows:0,windowTerms:new Map()};byDocument.set(path,candidate);}
   if(!candidate.windows.has(hit.chunk.id)){
    candidate.windows.add(hit.chunk.id);candidate.scores.push(hit.score);
    const bodyTerms=new Set(distinctiveTerms(hit.chunk.text));
    const matched=new Set([...terms].filter(t=>bodyTerms.has(t)));
    if(matched.size)candidate.focusedWindows++;
    candidate.windowTerms.set(hit.chunk.index,matched);
   }
   if(hit.score>candidate.best.score)candidate.best=hit;
   candidate.probes.add(probe);
   const source=new Set(distinctiveTerms(hit.chunk.title+' '+hit.chunk.heading+' '+hit.chunk.text));
   const titleTerms=new Set(distinctiveTerms(hit.chunk.title.replace(/^[0-9a-f-]{36}-/i,'')+' '+hit.chunk.heading));
   for(const term of terms){if(source.has(term))candidate.matches.add(term);if(titleTerms.has(term))candidate.titleMatches.add(term);}
  }
 });
 const output:RelationCandidate[]=[];
 for(const entry of byDocument.values()){
  const best=entry.best;
  const semantic=best.cosine??0;
  const distinct=entry.matches.size;
  const coverage=terms.size?distinct/terms.size:0;
  // Reject lexical-only matches and generic semantic proximity unless supported by
  // distinctive vocabulary or independent probes; confidence is NOT proof of relation.
  const independent=entry.probes.size>=2;
  const titleFocused=entry.titleMatches.size>0;
  const strong=shortIdea
   ? semantic>=0.73&&distinct>=1&&titleFocused&&entry.focusedWindows>=1
   : semantic>=0.76&&(distinct>=2||independent)&&coverage>=0.04;
  const possible=shortIdea
   ? semantic>=0.70&&distinct>=1&&(titleFocused||entry.focusedWindows>=2)
   : semantic>=0.72&&(distinct>=2||independent)||semantic>=0.80&&distinct>=1;
  if(!strong&&!possible)continue;
  // Evidence and ranking are independent: a high retrieval score cannot create facts.
  // Adjacent / overlapping retrieval windows are a single passage, not independent support.
  const clusters:Array<Set<string>>=[];
  let last=-2;
  for(const [index,matched] of [...entry.windowTerms.entries()].sort((a,b)=>a[0]-b[0])){
   if(!matched.size)continue;
   if(index>last+1)clusters.push(new Set());
   for(const term of matched)clusters[clusters.length-1].add(term);
   last=index;
  }
  const bodyCoverage=new Set(clusters.flatMap(group=>[...group]));
  const bestTextTerms=new Set(distinctiveTerms(best.chunk.text));
  const bestMatches=[...terms].filter(t=>bestTextTerms.has(t));
  const focusedTitle=entry.titleMatches.size>0;
  // Two explicit idea concepts in a passage (or one in both title and body)
  // supports a direct topical source, not a verified factual claim.
  const passageHasMultiple=clusters.some(group=>group.size>=2);
  const direct=bestMatches.length>0 && (passageHasMultiple || (focusedTitle&&bodyCoverage.size>=1));
  const background=!direct&&bodyCoverage.size>=1;
  const evidenceClass:EvidenceClass=direct?'direct':background?'background':'uncertain';
  const score=semantic*0.7+Math.min(distinct,6)*0.035+Math.min(entry.probes.size,3)*0.025+Math.min(entry.windows.size,3)*0.01+Math.min(entry.titleMatches.size,2)*0.13+Math.min(entry.focusedWindows,4)*0.025;
  output.push({hit:best,evidenceClass,evidenceTerms:[...bodyCoverage],distinctPassages:clusters.length,confidence:strong?'strong':'possible',evidenceCount:entry.windows.size,matchedProbes:entry.probes.size,score,reason:titleFocused?'Ämnet finns i dokumentets titel eller avsnitt och stöds av innehållet':strong?'Semantiskt samband med särskiljande stöd':'Möjligt samband – behöver granskas'});
 }
 return output.sort((a,b)=>({direct:2,background:1,uncertain:0}[b.evidenceClass]-{direct:2,background:1,uncertain:0}[a.evidenceClass])||Number(b.confidence==='strong')-Number(a.confidence==='strong')||b.score-a.score||a.hit.chunk.path.localeCompare(b.hit.chunk.path)).slice(0,limit);
}
