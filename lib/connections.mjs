const rootKinds={Kunskap:'Kunskap',Research:'Forskning',Berattelser:'Berättelse',Nyhetsradarn:'Nyhet',Ideer:'Idé','Fardiga-ideer':'Idéunderlag',Filmer:'Film',Serier:'Serie',Cortex:'Träning',Ekonomi:'Ekonomi'};
const excluded=/^(\.github|System|99-Slask-Original|Mottagningsinkorg|NexusHub inkorg)\/|(^|\/)(Original|revisions|history|versions)\/|\.(png|jpe?g|webp|svg|zip|gz|bin|sqlite|db)$/i;
export const relationTypes={related:'Hör ihop med',builds_on:'Bygger på',supports:'Stödjer',contradicts:'Motsäger',inspired_by:'Inspirerad av'};
export function validateConnections(data){if(data?.schemaVersion!==1||!Array.isArray(data.relations)||data.relations.some(r=>!r||typeof r!=='object'||!['id','from','to','note'].every(k=>typeof r[k]==='string')||!relationTypes[r.type]||!['active','revoked'].includes(r.status)))throw Error('Kopplingsregistret innehåller en ogiltig post. Originalet har inte ändrats.');return data;}
export function contentCandidate(path){return !excluded.test(path)&&!/(^|\/)\./.test(path)&&(/\.(md|txt|pdf|docx)$/i.test(path)||/^(Ideer\/(?:Genomforda\/)?[^/]+\.json|(?:Kunskap\/Kunskapsbanken|Nyhetsradarn)\/records\/(?:topic|chunk|event)-[^/]+\.json|(?:Filmer|Serier)\/register\.json|Cortex\/Data\/Dagsloggar\/)/.test(path));}
export function connectionNodes(documents){
 const map=new Map();for(const d of documents){if(!d.path||d.asset||!contentCandidate(d.path)||d.technical&&!/^(Ideer\/|Nyhetsradarn\/records\/event-|Filmer\/|Serier\/|Cortex\/Data\/Dagsloggar\/)/.test(d.path))continue;
 const key=d.entityId||d.path.replace(/\.(md|txt|pdf|docx)$/i,''),id='databas:'+key;
 const paths=[...new Set([d.path,...(d.formats||[]).map(f=>f.path)])];
 const n=map.get(id);if(n){const allPaths=[...new Set([...n.paths,...paths])];if(/\.md$/i.test(d.path)&&!d.technical)Object.assign(n,d);n.id=id;n.repoKey='databas';n.paths=allPaths;continue;}
 map.set(id,{...d,id,paths,kind:d.connectionKind||rootKinds[d.path.split('/')[0]]||'Dokument',title:d.title||d.path.split('/').pop(),category:d.category||'',tags:Array.isArray(d.tags)?d.tags:[],repoKey:'databas'});
 }return [...map.values()];
}
function resolvePath(target,from){try{let s=decodeURIComponent(target.split('#')[0].split('?')[0]);if(!s)return null;if(s.startsWith('/'))s=s.slice(1);else if(!/^(Kunskap|Research|Berattelser|Nyhetsradarn|Ideer|Fardiga-ideer|Filmer|Serier|Cortex|Gemensamt|Verktyg|Mallar)\//.test(s))s=from.slice(0,from.lastIndexOf('/')+1)+s;const parts=[];for(const p of s.split('/')){if(p==='..'){if(!parts.length)return null;parts.pop();}else if(p&&p!=='.')parts.push(p);}return parts.join('/');}catch{return null;}}
export function extractReferences(body,path){
 const paths=new Set(),urls=new Set();
 for(const m of String(body).matchAll(/https?:\/\/[^\s<>"\]\)]+/g)){try{const u=new URL(m[0].replace(/[.,;]+$/,''));if(u.hostname==='github.com'&&u.pathname.startsWith('/lobbamannen/Databas/blob/')){const p=decodeURIComponent(u.pathname.split('/').slice(5).join('/'));if(p)paths.add(p);}else{u.hash='';urls.add(u.href);}}catch{}}
 for(const m of String(body).matchAll(/\[[^\]]*\]\(<?([^\s>]+)>?(?:\s+"[^"]*")?\)/g)){if(/^(https?:|mailto:|#)/i.test(m[1]))continue;const p=resolvePath(m[1],path);if(p)paths.add(p);}
 // Explicit JSON path fields only; free prose mentioning a filename is not a reference.
 for(const m of String(body).matchAll(/"(?:path|source_path|topic_path)"\s*:\s*"([^"\n]+)"/g)){const p=resolvePath(m[1],path);if(p)paths.add(p);}
 return {paths:[...paths],urls:[...urls]};
}
export function connectionEdges(nodes,manual=[],references={}){
 const byPath=new Map(nodes.flatMap(n=>n.paths.map(p=>[p,n.id]))),ids=new Set(nodes.map(n=>n.id)),out=new Map();
 const add=e=>{if(e.from===e.to||!ids.has(e.from)||!ids.has(e.to))return;const key=e.recordId?'user:'+e.recordId:e.from+'|'+e.to+'|'+e.type+'|'+(e.evidence||'');out.set(key,{...e,id:key});};
 for(const e of manual){if(e&&typeof e==='object'&&typeof e.id==='string'&&e.status!=='revoked'&&relationTypes[e.type])add({...e,recordId:e.id,label:relationTypes[e.type],origin:'user',evidence:typeof e.note==='string'?e.note:'Godkänd av dig'});}
 for(const n of nodes){for(const p of references[n.id]?.paths||[]){const to=byPath.get(p);if(to)add({from:n.id,to,type:'references',label:'Hänvisar till',origin:'document',evidence:p});}
 if(n.topicPath&&byPath.has(n.topicPath))add({from:n.id,to:byPath.get(n.topicPath),type:'section',label:'Ingår i ämne',origin:'document',evidence:n.topicPath});}
 // Source hubs avoid quadratic all-pairs edges between hundreds of citing documents.
 return [...out.values()];
}
export function connectionsFor(id,nodes,edges,references={}){
 const byId=new Map(nodes.map(n=>[n.id,n])),out=edges.filter(e=>e.from===id||e.to===id).map(edge=>({node:byId.get(edge.from===id?edge.to:edge.from),edge})).filter(x=>x.node);
 const current=byId.get(id);if(!current)return [];
 const known=new Set(out.map(x=>x.node.id)),words=new Set((current.title+' '+current.tags.join(' ')).toLowerCase().match(/[\p{L}\d]{4,}/gu)||[]),urls=new Set(references[id]?.urls||[]);
 for(const n of nodes){if(n.id===id||known.has(n.id))continue;const shared=(references[n.id]?.urls||[]).find(u=>urls.has(u));if(shared){out.push({node:n,edge:{from:id,to:n.id,type:'shared_source',label:'Använder samma källa',origin:'document',evidence:shared}});known.add(n.id);}}
 const suggested=nodes.filter(n=>n.id!==id&&!known.has(n.id)).map(n=>{const overlap=[...new Set((n.title+' '+n.tags.join(' ')).toLowerCase().match(/[\p{L}\d]{4,}/gu)||[])].filter(w=>words.has(w));return {node:n,score:overlap.length,edge:{from:id,to:n.id,type:'suggestion',label:'Möjlig koppling',origin:'suggestion',evidence:'Gemensamma ord: '+overlap.slice(0,4).join(', ')}};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
 return [...out,...suggested];
}
export function applyConnectionChange(data,change,at){
 if(data?.schemaVersion!==1||!Array.isArray(data.relations))throw Error('Kopplingsregistret har ett okänt format.');const relations=data.relations.map(r=>({...r}));
 if(change.action==='revoke'){const r=relations.find(r=>r.id===change.id);if(!r)throw Error('Kopplingen saknas.');r.status='revoked';r.revokedAt=at;}
 else if(change.action==='add'){const r=change.relation;if(!r||!relationTypes[r.type]||!['id','from','to'].every(k=>typeof r[k]==='string'&&r[k].length>0&&r[k].length<1200)||r.from===r.to||typeof r.note!=='string'||r.note.length>2000)throw Error('Ogiltig koppling.');if(relations.some(x=>x.id===r.id)){const old=relations.find(x=>x.id===r.id);if(old.from!==r.from||old.to!==r.to||old.type!==r.type||old.note!==r.note||old.status==='revoked')throw Error('Kopplings-ID har redan använts.');return data;}relations.push({...r,createdAt:at,status:'active'});}
 else throw Error('Okänd kopplingsändring.');return {...data,relations};
}
