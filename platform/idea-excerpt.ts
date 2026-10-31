/**
 * Build a readable excerpt from an exact indexed document generation.
 * This module does not perform retrieval or re-rank candidates.
 */
export type ExcerptWindow={id:string;index:number;text:string};
export type ExcerptResult={text:string;windowIndex:number;contextIndices:number[]};

export function readableIdeaExcerpt(windows:ExcerptWindow[],bestIndex:number,maxChars=2600):ExcerptResult|null{
 const ordered=[...windows].sort((a,b)=>a.index-b.index);
 const chosen=ordered.find(w=>w.index===bestIndex);
 if(!chosen||!chosen.text.trim())return null;
 const contextIndices=ordered.filter(w=>Math.abs(w.index-bestIndex)<=1).map(w=>w.index);
 let full='',anchor=0;
 for(const window of ordered){
  const part=window.text.replace(/\r\n?/g,'\n');
  let overlap=0;
  const upper=Math.min(240,full.length,part.length);
  for(let n=upper;n>=8;n--){
   if(full.endsWith(part.slice(0,n))){overlap=n;break;}
  }
  const offset=full.length-overlap;
  if(window.index===bestIndex)anchor=offset+Math.min(Math.floor(part.length/3),220);
  full+=(overlap?'':'\n')+part.slice(overlap);
 }
 if(!full)return null;
 const blocks:{start:number;end:number;text:string}[]=[];
 const pattern=/\n{2,}/g;
 let cursor=0,match:RegExpExecArray|null;
 while((match=pattern.exec(full))!==null){
  if(match.index>cursor)blocks.push({start:cursor,end:match.index,text:full.slice(cursor,match.index).trim()});
  cursor=pattern.lastIndex;
 }
 if(cursor<full.length)blocks.push({start:cursor,end:full.length,text:full.slice(cursor).trim()});
 if(!blocks.length)return {text:full.slice(0,maxChars),windowIndex:bestIndex,contextIndices};
 const center=Math.max(0,blocks.findIndex(b=>anchor>=b.start&&anchor<=b.end));
 let first=center,last=center;
 // Prefer the nearest heading and preceding explanation if it fits.
 while(first>0&&blocks[first].end-blocks[first-1].start<=maxChars&&center-first<2)first--;
 while(last+1<blocks.length&&blocks[last+1].end-blocks[first].start<=maxChars)last++;
 while(first>0&&blocks[last].end-blocks[first-1].start<=maxChars)first--;
 let excerpt=blocks.slice(first,last+1).map(b=>b.text).join('\n\n').trim();
 // Oversized paragraph/table: retain complete lines around the matched area.
 if(excerpt.length>maxChars){
  const block=blocks[center];
  const lines=block.text.split('\n');
  const relative=Math.max(0,Math.min(block.text.length,anchor-block.start));
  const lineIndex=block.text.slice(0,relative).split('\n').length-1;
  let a=lineIndex,b=lineIndex,total=lines[lineIndex]?.length||0;
  while(a>0||b<lines.length-1){
   const left=a>0?lines[a-1].length+1:Infinity;
   const right=b<lines.length-1?lines[b+1].length+1:Infinity;
   if(total+Math.min(left,right)>maxChars)break;
   if(left<=right){a--;total+=left;}else{b++;total+=right;}
  }
  excerpt=lines.slice(a,b+1).join('\n');
  return {text:(a>0||first>0?'[…]\n':'')+excerpt+(b<lines.length-1||last<blocks.length-1?'\n[…]':''),windowIndex:bestIndex,contextIndices};
 }
 return {text:(first>0?'[…]\n':'')+excerpt+(last<blocks.length-1?'\n[…]':''),windowIndex:bestIndex,contextIndices};
}
