/** Domain history uses explicit input fields, never navigation or request bodies. */
const fields=new Set(['status','read','saved','favorite','favourite','rating','ownRating','userRating','wantToWatch','watchedSeasons','releaseWatch','done','ideaId','enabled','title','year','startYear','season','seasons','type','start','end','allDay','date','amount','quantity','price','categoryId','productId']);
const short=value=>typeof value==='string'?value.slice(0,240):undefined;
const selected=value=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>fields.has(key)).map(([key,v])=>[key,v]));
const titleOf=row=>short(row?.title||row?.displayTitle||row?.text||row?.name);
const ref=value=>typeof value==='string'?value:JSON.stringify(value??'');
const event=(category,action,objectId,title,details={},path)=>({category,action,objectType:category,objectId:ref(objectId),...(title?{title}:{}),...(path?{path}:{}),details});
export function mutationActivities(path,method,input={},result={}){
 if(['GET','HEAD','OPTIONS'].includes(method)||result.unchanged)return [];
 const action=method==='DELETE'?'deleted':'updated';
 if(path==='/api/ideas')return [event('ideas',method==='DELETE'?'deleted':input.expectedSha===null?'added':'updated',input.idea?.id||input.id,titleOf(input.idea),{changes:selected(input.idea),number:result.number})];
 if(path==='/api/media-register')return (input.edits||[]).map(edit=>{const id=typeof edit.target==='string'?edit.target:edit.target?.imdbId||ref(edit.target),rows=result.register?.[input.kind]||[],row=rows.find(r=>r.imdbId===id);return event('media','updated',id,titleOf(row)||titleOf(edit.target),{kind:input.kind,changes:selected(edit.changes)});});
 if(path==='/api/films'||path==='/api/series'){const row=input.film||input.series||input.entry||input.target;return [event('media',input.action||action,row?.imdbId||row?.id||input.imdbId||input.id||titleOf(row)||path,titleOf(row),{kind:path.endsWith('films')?'films':'series',changes:selected({...row,...input})})];}
 if(path==='/api/story-status'){
  const edits=input.action==='batch'?input.edits:input.action==='migrate'?input.paths:[{path:input.path,field:input.field,value:input.value}];
  return (edits||[]).map(e=>event('stories','status_changed',e.path,e.path?.split('/').pop(),{changes:input.action==='migrate'?selected(e):{[e.field||'read']:e.value}},e.path));
 }
 if(path==='/api/story-register')return (input.edits||[]).map(e=>event('stories','updated',e.path,e.path?.split('/').pop(),{changes:selected(e.changes)},e.path));
 if(path==='/api/todos')return [event('todos','saved','todo-list','Att göra',{items:(input.data?.items||[]).map(row=>({id:row.id,title:titleOf(row),done:row.done,ideaId:row.ideaId}))})];
 if(path==='/api/calendar'){const row=input.change?.event||input.change;return [event('calendar',input.change?.action||action,row?.id||input.change?.id||'calendar',titleOf(row),{changes:selected(row)})];}
 if(path==='/api/connections')return [event('connections',input.change?.action||action,input.change?.id||input.change?.relation?.id||'relation','Koppling',{changes:input.change?Object.fromEntries(Object.entries(input.change).filter(([key])=>['action','id','from','to','type','status'].includes(key))):{}})];
 if(path==='/api/incoming'){const row=input.item;return [event('inbox',method==='DELETE'?'deleted':input.operation==='mirror'?'uploaded':'transferred',row?.id||input.id||input.receiptId,row?.files?.[0]?.name||input.name||'Mottagningspost',{destination:input.target,ideaId:input.ideaId,files:row?.files?.map(f=>({id:f.id,name:f.name,sha:f.sha}))})];}
 if(path==='/api/idea-files')return [event('ideas','attachment_added',input.ideaId||input.id,'Idébilaga',{files:result.files?.map(f=>({id:f.id,name:f.name,path:f.path}))})];
 if(path==='/api/document-bookmarks')return [event('documents','bookmark_changed',input.entry?.path||input.entry?.copyId||'bookmarks',input.entry?.title,{saved:input.value},input.entry?.path)];
 if(path==='/api/economy')return [event('economy',input.action||action,input.entry?.id||input.id||input.path,titleOf(input.entry)||input.path,{changes:selected(input.entry),kind:input.kind},input.path)];
 if(path==='/api/series-watch-settings'||path==='/api/watch-history')return [event('settings','saved',path,path.endsWith('watch-history')?'Bevakningshistorik':'Seriebevakning',{changes:selected(input.data||input)})];
 if(path.startsWith('/api/files'))return [event('documents','uploaded',result.id||path,result.name||'Dokument',{destination:result.github?.path||result.path})];
 return [event('system',action,path,'Åtgärd i NexusHub',{route:path,method})];
}
function rows(kind,value){
 if(!value)return [];
 const data=value.register||value.data||value;
 if(kind==='media-films')return data.films||[];
 if(kind==='media-series')return data.series||[];
 if(kind==='todos')return data.items||[];
 if(kind==='calendar')return data.events||[];
 if(data.entries&&typeof data.entries==='object')return Object.entries(data.entries).map(([path,row])=>({...row,id:path,path}));
 return Array.isArray(data.items)?data.items:[];
}
function rowId(row){return row.imdbId||row.id||row.path||[row.title,row.startYear??row.year].join('|');}
export function snapshotActivities(kind,before,after){
 if(!before||!after)return [];
 const category=kind.startsWith('media-')?'media':kind.startsWith('stor')?'stories':kind;
 const a=new Map(rows(kind,before).map(row=>[rowId(row),row])),b=new Map(rows(kind,after).map(row=>[rowId(row),row])),out=[];
 for(const [id,row]of b){const old=a.get(id),oldState=selected(old),nextState=selected(row);if(!old)out.push(event(category,'added',id,titleOf(row)||row.path,{after:nextState},row.path));else if(JSON.stringify(oldState)!==JSON.stringify(nextState)||kind==='todos'&&row.text!==old.text)out.push(event(category,'updated',id,titleOf(row)||row.path,{before:oldState,after:nextState},row.path));}
 for(const [id,row]of a)if(!b.has(id))out.push(event(category,'deleted',id,titleOf(row)||row.path,{before:selected(row)},row.path));
 return out;
}
export function fileActivities(before,after){
 if(!before)return [];
 const a=new Map(before.map(f=>[f.path,f])),b=new Map(after.map(f=>[f.path,f])),out=[];
 const add=(file,action,old)=>{if(file.path.startsWith('System/NexusHub/Aktivitetslogg/'))return;const category=file.path.startsWith('Berattelser/')?'stories':file.path.startsWith('Ideer/')?'ideas':file.path.startsWith('NexusHub inkorg/')?'inbox':file.path.startsWith('Kalender/')?'calendar':file.path.startsWith('Filmer/')||file.path.startsWith('Serier/')?'media':file.path.startsWith('Att-gora/')?'todos':file.path.startsWith('Ekonomi/')?'economy':'documents';out.push({...event(category,action,file.path,file.path.split('/').pop(),{sha:action==='deleted'?undefined:file.sha,previousSha:old?.sha},file.path),source:'github'});};
 for(const [path,file]of b){const old=a.get(path);if(!old)add(file,'added');else if(old.sha!==file.sha)add(file,'updated',old);}
 for(const [path,file]of a)if(!b.has(path))add(file,'deleted',file);
 return out;
}
