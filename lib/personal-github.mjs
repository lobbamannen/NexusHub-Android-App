import {applyCalendarChange,watchSettings,mergeWatchHistory} from './calendar/domain.mjs';
import { ideaPath } from './ideas.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function personalGithub(repository,call,gitBlobSha,base64){
 const url=path=>'/contents/'+path.split('/').map(encodeURIComponent).join('/');
 const scope=()=>{if(repository!=='lobbamannen/Databas')throw Error('Personliga filer hör till Databas.');};
 async function read(path){const r=await call(url(path)+'?ref=main');if(r.status===404)return null;const f=await r.json();const bytes=Uint8Array.from(atob(f.content.replace(/\s/g,'')),c=>c.charCodeAt(0));if(await gitBlobSha(bytes)!==f.sha)throw Error('Filens kontrollsumma avviker.');return {sha:f.sha,data:JSON.parse(new TextDecoder().decode(bytes))};}
 async function put(path,bytes,expectedSha,exact=false){
  const r=await call(url(path)+'?ref=main');let current=null;
  if(r.status!==404){const f=await r.json();current=f.sha;}
  const hash=await gitBlobSha(bytes);
  // A sorting plugin may already have moved an inbox file after a lost response.
  // Never recreate a once-used deterministic path without checking its history.
  if(!exact && current===null){
   const historyResponse=await call('/commits?path='+encodeURIComponent(path)+'&per_page=10'),history=await historyResponse.json();
   if(!Array.isArray(history))throw Error('Överföringshistoriken kunde inte kontrolleras.');
   for(const commit of history){const old=await call(url(path)+'?ref='+commit.sha);if(old.status===404)continue;const file=await old.json();if(file.sha===hash)return {saved:true,sha:hash,path,commit:commit.sha,reconciled:true,processed:true};throw Object.assign(Error('Sökvägen har tidigare använts med annat innehåll.'),{status:409});}
   if(history.length)throw Object.assign(Error('Tidigare överföring behöver kontrolleras innan filen skickas igen.'),{status:409});
  }
  if(current===hash)return {saved:true,sha:hash,path,reconciled:true};
  if(exact ? current!==expectedSha : current!==null)throw Object.assign(Error('Filen har ändrats i GitHub. Läs om innan du sparar.'),{status:409});
  const response=await call(url(path),{method:'PUT',body:JSON.stringify({message:'NexusHub: spara personlig post',branch:'main',...(current?{sha:current}:{}),content:base64(bytes)})});
  const receipt=await response.json();if(receipt.content?.sha!==hash||!receipt.commit?.sha)throw Error('GitHub bekräftade inte sparningen.');return {saved:true,path,sha:hash,commit:receipt.commit.sha};
 }
 return {
  async readCalendar(){scope();return await read('Kalender/egna-handelser.json')||{sha:null,data:{schemaVersion:1,events:[]}};},
  async saveCalendar(change,expectedSha){scope();const current=await this.readCalendar();if(current.sha!==expectedSha)throw Object.assign(Error('Kalendern har ändrats i GitHub. Båda versionerna behålls.'),{status:409});const data=applyCalendarChange(current.data,change);const result=await put('Kalender/egna-handelser.json',new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),expectedSha,true);return {...result,data};},
  async readWatchSettings(){scope();return await read('Serier/bevakning-installningar.json')||{sha:null,data:watchSettings()};},
  async saveWatchSettings(input,expectedSha){scope();const data=watchSettings(input),result=await put('Serier/bevakning-installningar.json',new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),expectedSha,true);return {...result,data};},
  async readWatchHistory(){scope();return await read('Serier/Bevakning/handelser.json')||{sha:null,data:{schemaVersion:1,events:[]}};},
  async saveWatchHistory(events,expectedSha){scope();const current=await this.readWatchHistory();if(current.sha!==expectedSha)throw Object.assign(Error('Bevakningshistoriken har ändrats. Läs om före sparning.'),{status:409});const data=mergeWatchHistory(current.data,events);if(JSON.stringify(data)===JSON.stringify(current.data))return {...current,saved:true,unchanged:true};const result=await put('Serier/Bevakning/handelser.json',new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),expectedSha,true);return {...result,data};},
  async readTodos(){scope();return await read('Att-gora/register.json')||{sha:null,data:{schemaVersion:1,items:[]}};},
  async saveTodos(data,expectedSha){scope();if(data?.schemaVersion!==1||!Array.isArray(data.items))throw Error('Ogiltig att-göra-lista.');const ids=new Set();for(const x of data.items){if(!uuid.test(x.id)||ids.has(x.id)||typeof x.text!=='string'||!x.text.trim()||typeof x.done!=='boolean')throw Error('Ogiltig uppgift.');ids.add(x.id);}const result=await put('Att-gora/register.json',new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),expectedSha,true);return {...result,data};},
  async sendIncoming(input){scope();if(!uuid.test(input.receiptId)||!uuid.test(input.fileId)||!['inbox','idea'].includes(input.target))throw Error('Ogiltig överföring.');
   if(input.target==='idea'){ideaPath(input.ideaId);if(!await read(ideaPath(input.ideaId)))throw Error('Spara idén i GitHub före bilagan.');}
   const name=String(input.name).replace(/[\\/\x00-\x1f\x7f]/g,'_').replace(/^\.+/,'').slice(-140)||'dokument';
   const path=(input.target==='inbox'?'00-Inkorg/':'Ideer/Bilagor/'+input.ideaId+'/')+input.receiptId+'-'+input.fileId+'-'+name;
   const bytes=Uint8Array.from(atob(input.base64),c=>c.charCodeAt(0));return put(path,bytes,null);
  },
  async ideaFiles(id){scope();ideaPath(id);const head=(await (await call('/git/ref/heads/main')).json()).object.sha;const r=await call('/git/trees/'+head+'?recursive=1'),tree=await r.json();if(tree.truncated)throw Error('Ofullständig billista.');return {files:tree.tree.filter(f=>f.type==='blob'&&f.path.startsWith('Ideer/Bilagor/'+id+'/')).map(f=>({...f,commit:head,name:f.path.split('/').pop().replace(/^[a-f0-9-]{36}-[a-f0-9-]{36}-/, '')}))};}
 };
}
