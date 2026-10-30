import type {Hit} from './idea-retrieval';

export type RelationCandidate={hit:Hit;confidence:'strong'|'possible';evidenceCount:number;score:number;matchedProbes:number;reason:string};
const generic=new Set(['android','appen','app','appar','nexushub','github','databas','databaser','data','system','teknik','teknisk','tekniska','funktion','funktioner','ai','modell','modeller','dokument','rapport','rapporter','information','användare','användaren','lösning','lösningar','lokal','lokala','skapa','använda','kunna','automatiskt','intelligens','intelligent','genom','mellan','olika','samma','flera','eller','också','detta','denna','dessa','inte','vara','göra','samt','till','från','med','för','och','att','som','den','det','ett','har','kan','ska','vid','över','under','the','and','use','using','systemet','utifrån','andra','alla','utan']);
export function distinctiveTerms(value:string):string[]{
 return [...new Set((value.toLocaleLowerCase('sv-SE').normalize('NFKC').match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(w=>!generic.has(w)))];
}
// Multiple independent portions of an idea keep important requirements after the opening paragraph searchable.
export function ideaProbes(text:string):string[]{
 const cleaned=text.replace(/\r/g,'').trim();
 if(!cleaned)return [];
 const segments=cleaned.split(/(?<=[.!?])\s+|\n{2,}/).map(s=>s.trim()).filter(Boolean);
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
 const byDocument=new Map<string,{best:Hit;scores:number[];probes:Set<number>;windows:Set<string>;matches:Set<string>}>();
 searches.forEach((hits,probe)=>{
  for(const hit of hits){
   const path=hit.chunk.path;
   let candidate=byDocument.get(path);
   if(!candidate){candidate={best:hit,scores:[],probes:new Set(),windows:new Set(),matches:new Set()};byDocument.set(path,candidate);}
   if(!candidate.windows.has(hit.chunk.id)){candidate.windows.add(hit.chunk.id);candidate.scores.push(hit.score);}
   if(hit.score>candidate.best.score)candidate.best=hit;
   candidate.probes.add(probe);
   const source=new Set(distinctiveTerms(hit.chunk.title+' '+hit.chunk.heading+' '+hit.chunk.text));
   for(const term of terms)if(source.has(term))candidate.matches.add(term);
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
  const strong=semantic>=0.76&&(distinct>=2||independent)&&coverage>=0.04;
  const possible=semantic>=0.72&&(distinct>=2||independent)||semantic>=0.80&&distinct>=1;
  if(!strong&&!possible)continue;
  const score=semantic*0.7+Math.min(distinct,6)*0.035+Math.min(entry.probes.size,3)*0.025+Math.min(entry.windows.size,3)*0.01;
  output.push({hit:best,confidence:strong?'strong':'possible',evidenceCount:entry.windows.size,matchedProbes:entry.probes.size,score,reason:strong?'Semantiskt samband med särskiljande stöd':'Möjligt samband – behöver granskas'});
 }
 return output.sort((a,b)=>Number(b.confidence==='strong')-Number(a.confidence==='strong')||b.score-a.score||a.hit.chunk.path.localeCompare(b.hit.chunk.path)).slice(0,limit);
}
