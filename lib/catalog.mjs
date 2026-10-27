export const REPOSITORIES={databas:'lobbamannen/Databas',plugins:'lobbamannen/ChatGPT-Plugin'};
export function cleanTitle(path){return path.split('/').pop().replace(/\.[^.]+$/,'').replace(/^[a-f0-9-]{36}-/i,'').replace(/[_]/g,' ').replace(/\s+/g,' ').trim();}
export function makeCatalog(snapshot,metadata=[],activeRecords=/** @type {Set<string>|null} */(null)){
 const byPath=new Map(metadata.filter(e=>e.source_path).map(e=>[e.source_path,e]));const grouped=new Map();const files=snapshot.tree.filter(f=>f.type==='blob');
 for(const f of files){const m=byPath.get(f.path),parts=f.path.split('/'),ext=f.path.split('.').pop().toLowerCase();
  const inactive=activeRecords&&/^Kunskap\/Kunskapsbanken\/records\/chunk-/.test(f.path)&&!activeRecords.has(f.path);
  const asset=/^Media\//i.test(f.path)||/\.(webp|png|jpe?g|gif|avif|svg|ico|mp4|mp3|woff2?)$/i.test(f.path);
  const technical=asset||!!inactive||/(^|\/)\.gitkeep$/.test(f.path)||/^(\.github|System|99-Slask-Original|Mottagningsinkorg)\//.test(f.path)||/(^|\/)(records|revisions|history|versions)\//i.test(f.path)&&!m||/\.(json|ya?ml|xml|py|js|ts|sh)$/i.test(f.path)&&!m;
  const category=m?.category||(parts[0]==='Kunskap'?parts[1]||'Övrig kunskap':parts[1]||parts[0]);
  const module=parts[0]==='Berattelser'?'mysterier':parts[0]==='00-Inkorg'?'inkorg':parts[0]==='Nyhetsradarn'?'nyheter':technical?'arkiv':m?.module==='verktyg'||/(^|\/)(Verktyg|Mallar|Templates|Tools)(\/|$)/i.test(f.path)?'verktyg':'databas';
  const key=/\.(md|pdf|docx|txt)$/i.test(f.path)?f.path.replace(/\.[^.]+$/,''):f.path;
  const entry={id:f.path,path:f.path,sha:f.sha,size:f.size||0,title:m?.title||cleanTitle(f.path),category,module,kind:m?.kind||({pdf:'PDF',docx:'Word',md:'Dokument',txt:'Text'}[ext]||ext.toUpperCase()),tags:m?.tags?typeof m.tags==='string'?JSON.parse(m.tags):m.tags:[],summary:m?.summary||'',asset,technical,metadataOrigin:m?'sparad katalogmetadata':'sökväg',localId:m?.id||null,topicId:m?.topic_id||null,topicPath:m?.topic_path||null,section:m?.section_title||null,formats:[{path:f.path,sha:f.sha,size:f.size||0,format:ext}]};
  const old=grouped.get(key);if(old){const formats=[...old.formats,...entry.formats];if(ext==='md'||old.kind==='PDF'&&ext==='txt')grouped.set(key,{...entry,formats});else old.formats=formats;}else grouped.set(key,entry);
 }
 const documents=[...grouped.values()].sort((a,b)=>a.title.localeCompare(b.title,'sv'));
 const topics=new Map();for(const d of documents.filter(d=>!d.technical&&d.module!=='inkorg')){const k=d.module+'|'+d.category;const t=topics.get(k)||{name:d.category,module:d.module,count:0};t.count++;topics.set(k,t);}
 return {commit:snapshot.commit,fetchedAt:snapshot.fetchedAt,complete:!snapshot.truncated,fileCount:files.length,bytes:files.reduce((n,f)=>n+(f.size||0),0),documents,topics:[...topics.values()].sort((a,b)=>b.count-a.count),recent:snapshot.recent||[]};
}
export function filterCatalog(documents,{query='',module='',category='',technical=false}={}){const words=query.toLocaleLowerCase('sv').trim().split(/\s+/).filter(Boolean);return documents.filter(d=>(technical||!d.technical)&&(!module||d.module===module)&&(!category||d.category===category)&&words.every(w=>(d.title+' '+d.category+' '+d.tags.join(' ')+' '+d.path).toLocaleLowerCase('sv').includes(w)));}
export function relatedSuggestions(current,documents){const words=s=>new Set(s.toLocaleLowerCase('sv').match(/[\p{L}\d]{4,}/gu)||[]);const a=words(current.title+' '+current.tags?.join(' '));return documents.filter(d=>d.path!==current.path&&!d.technical&&d.module!=='inkorg').map(d=>{const shared=[...words(d.title+' '+d.tags?.join(' '))].filter(w=>a.has(w));return {...d,score:shared.length*3+(d.category===current.category?1:0),reason:shared.length?'Gemensamma ord: '+shared.slice(0,4).join(', '):'Samma ämneskategori'};}).filter(d=>d.score>0).sort((a,b)=>b.score-a.score).slice(0,5);}
export function readableRecord(text){
 let data;try{data=JSON.parse(text);}catch{return {body:text,structured:false};}const r=data.record||data;
 if(typeof r.text==='string')return {body:r.text,structured:true,title:r.title||r.text.match(/^#{1,6}\s+([^\n]+)/m)?.[1],sources:r.sources||r.source_refs||[]};
 if(typeof r.body==='string'||typeof r.content==='string')return {body:r.body||r.content,structured:true,title:r.title,sources:r.sources||[]};
 const head=r.title||r.headline||r.name;if(head){const sections=['summary','description','narrative','details','analysis','conclusion'].filter(k=>typeof r[k]==='string').map(k=>'## '+k+'\n\n'+r[k]);return {body:'# '+head+'\n\n'+sections.join('\n\n')+'\n\n## Fullständig originalpost\n\n```json\n'+JSON.stringify(data,null,2)+'\n```',structured:true,title:head};}
 return {body:'```json\n'+JSON.stringify(data,null,2)+'\n```',structured:true};
}
export function documentKey(d){return d.copyId?'copy:'+d.copyId:'github:'+(d.repoKey||'databas')+':'+d.path;}
