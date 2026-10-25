import React from 'react';
// Only fixed, attribute-free formatting is interpreted. All other HTML remains escaped text.
export function inline(text,depth=0){
 if(depth>12)return [text];
 const pattern=/(`[^`]+`|\[(?:\\.|[^\]\\])*\]\(https?:\/\/(?:[^\s()]|\([^()]*\))+\)|<(u|strong|b|em|i|s|del|sup|sub)>([\s\S]*?)<\/\2>|<br\s*\/?\s*>|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
 const out=[];let end=0;let match;
 while((match=pattern.exec(text))){
  if(match.index>end)out.push(text.slice(end,match.index));
  const token=match[0],key=match.index,children=s=>inline(s,depth+1),el=(tag,s)=>React.createElement(tag,{key},...children(s));
  if(token.startsWith('`'))out.push(React.createElement('code',{key},token.slice(1,-1)));
  else if(token.startsWith('[')){const link=token.match(/^\[((?:\\.|[^\]\\])*)\]\((https?:\/\/(?:[^\s()]|\([^()]*\))+)\)$/);out.push(React.createElement('a',{key,href:link[2],target:'_blank',rel:'noopener noreferrer'},...children(link[1].replace(/\\([\[\]])/g,'$1'))));}
  else if(match[2])out.push(el(match[2],match[3]));
  else if(token.startsWith('<br'))out.push(React.createElement('br',{key}));
  else if(token.startsWith('**')||token.startsWith('__'))out.push(el('strong',token.slice(2,-2)));
  else if(token.startsWith('~~'))out.push(el('del',token.slice(2,-2)));
  else out.push(el('em',token.slice(1,-1)));
  end=pattern.lastIndex;
 }
 if(end<text.length)out.push(text.slice(end));return out;
}
