/** Bridge limits match native validation; exact model tokens are budgeted natively. */
export function buildGemmaContext(messages,question) {
 const text=question.trim();
 if(!text||text.length>12000)throw Error('Frågan är för stor för Android. Dela upp den.');
 const pairs=[];let omitted=0;
 for(let i=0;i<messages.length-1;i++)if(messages[i].role==='user'&&messages[i+1].role==='assistant'){
  const turn=[messages[i],messages[++i]].map(({role,content})=>({role,content}));
  if(turn.every(m=>m.content.trim()&&m.content.trim().length<=12000))pairs.push(turn);else omitted++;
 }
 omitted+=Math.max(0,pairs.length-5);const history=pairs.slice(-5);
 const payload=()=>[...history.flat(),{role:'user',content:text}];
 const fits=value=>value.length<=13&&value.reduce((n,m)=>n+m.content.length,0)<=30000&&JSON.stringify(value).length<=36000;
 while(history.length&&!fits(payload())){history.shift();omitted++;}
 if(!fits(payload()))throw Error('Frågan är för stor för Android. Dela upp den.');
 return {messages:payload(),omittedTurns:omitted};
}
