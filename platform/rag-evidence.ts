import type {Hit} from './idea-retrieval';

/** Preserve RRF order. Diversity is only a small tie-break among similarly ranked hits. */
export function selectRagEvidence(hits:Hit[],mode:'baseline'|'diverse',limit=6):Hit[]{
 if(mode==='baseline')return hits.slice(0,limit);
 const remaining=hits.slice(),selected:Hit[]=[];
 while(selected.length<limit&&remaining.length){
  const best=remaining[0].score;
  // Never promote a weak result merely because it comes from another document.
  const eligible=remaining.filter(h=>h.score>=best*0.92);
  const chosen=eligible.reduce((winner,h)=>{
   const count=selected.filter(s=>s.chunk.path===h.chunk.path).length;
   const prior=selected.filter(s=>s.chunk.path===winner.chunk.path).length;
   const rank=h.score/(best||1)-Math.min(count,3)*0.035;
   const priorRank=winner.score/(best||1)-Math.min(prior,3)*0.035;
   return rank>priorRank? h:winner;
  },eligible[0]);
  selected.push(chosen);
  remaining.splice(remaining.indexOf(chosen),1);
 }
 return selected;
}
/** Current embedding unit is the complete ~900-character chunk, not a sub-window. */
export function formatRagEvidence(hits:Hit[]):string{
 return hits.map((h,i)=>'[D'+(i+1)+' | '+h.chunk.path+' | chunk '+h.chunk.index+' | '+h.chunk.sha.slice(0,12)+']\n'+h.chunk.text).join('\n\n');
}
export function ragAnswerGuidance(question:string):string{
 const complex=/\b(jämför|analysera|utvärdera|fördelar|nackdelar|skillnader|orsaker|alternativ|sammanställ|samtliga|alla|hur mycket|hur intelligent|varför)\b/i.test(question)
   ||(question.match(/[?？]/g)||[]).length>1||question.length>200;
 return complex
  ?'Svara fullständigt på frågans delar, med tydliga källhänvisningar. Sammanför överlappande fakta och undvik upprepningar. Prioritera fullständighet framför godtycklig korthet.'
  :'Svara kort och direkt, normalt några meningar. Ange källa. Lägg inte till introduktioner, upprepningar eller slutsatser som inte behövs.';
}
