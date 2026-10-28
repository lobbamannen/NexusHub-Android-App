/** Source is metadata, never inserted into or used to rewrite the original text. */
export function textSourceLabel(value){
 if(value===undefined||value==='')return undefined;
 if(typeof value!=='string'||/[\r\n\x00-\x1f\x7f]/.test(value)||value.trim().length>120)throw Error('Källa / AI får vara högst 120 tecken på en rad.');
 return value.trim()||undefined;
}
export function pastedTextDocument(text,source,createdAt){
 if(typeof text!=='string'||!text.trim())throw Error('Klistra in text innan du sparar.');
 if(!Number.isFinite(Date.parse(createdAt)))throw Error('Ogiltigt datum.');
 const sourceLabel=textSourceLabel(source),prefix=(sourceLabel||'Research').normalize('NFC').replace(/[\\/\x00-\x1f\x7f:*?"<>|]/g,'_').replace(/^\.+/,'').slice(0,80)||'Research';
 return {name:prefix+'-'+new Date(createdAt).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+'.md',mime:'text/markdown;charset=utf-8',content:text,...(sourceLabel?{sourceLabel}:{})};
}
const textareaText=value=>value.replace(/\r\n?/g,'\n');
function rawOffset(value,offset){let raw=0,visible=0;while(raw<value.length&&visible<offset){if(value[raw]==='\r'&&value[raw+1]==='\n')raw++;raw++;visible++;}return raw;}
/** Textareas count CRLF as one LF; keep the clipboard's original bytes in state. */
export function replacePastedSelection(current,start,end,pasted){return current.slice(0,rawOffset(current,start))+pasted+current.slice(rawOffset(current,end));}
export function reconcilePastedEdit(current,next){
 const previous=textareaText(current);let start=0,tail=0;
 while(start<previous.length&&start<next.length&&previous[start]===next[start])start++;
 while(tail<previous.length-start&&tail<next.length-start&&previous[previous.length-1-tail]===next[next.length-1-tail])tail++;
 return replacePastedSelection(current,start,previous.length-tail,next.slice(start,next.length-tail));
}
