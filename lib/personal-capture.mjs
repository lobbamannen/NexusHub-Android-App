import {IDEA_ID} from './ideas.mjs';

/** Same task UUID is reused after an uncertain response; other draft edits survive. */
export function upsertQuickTask(data,draft){
 if(data?.schemaVersion!==1||!Array.isArray(data.items))throw Error('Ogiltig att-göra-lista.');
 if(!IDEA_ID.test(draft?.id||'')||typeof draft.text!=='string'||!draft.text.trim()||draft.text.length>50000)throw Error('Skriv en uppgift, högst 50 000 tecken.');
 if(draft.ideaId&&!IDEA_ID.test(draft.ideaId))throw Error('Ogiltig idélänk.');
 const previous=data.items.find(item=>item.id===draft.id);
 const item={...previous,id:draft.id,text:draft.text.trim(),done:previous?.done??false};
 if(draft.ideaId)item.ideaId=draft.ideaId;else delete item.ideaId;
 return {...data,items:previous?data.items.map(row=>row.id===item.id?item:row):[...data.items,item]};
}
export function inboxIdeas(rows,pending={},drafts={}){
 return rows.filter(({idea})=>!['completed','dismissed'].includes(idea.status)||pending[idea.id]||drafts[idea.id]);
}
