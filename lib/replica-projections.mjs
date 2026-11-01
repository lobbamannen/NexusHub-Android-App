import { makeCatalog } from './catalog.mjs';
import {existingIdeaNumbers} from './widget-activity.mjs';
import { validateIdea, IDEA_ID, IDEA_STATUSES, ideaPath } from './ideas.mjs';
import { validatePlanMetadata } from './idea-plans.mjs';
import { combineEconomyCatalogRead } from './economy-catalog.mjs';

const budgets=['Ekonomi/Robin/budget.json','Ekonomi/Rebecca/budget.json'];
const period=/^Ekonomi\/Gemensamt\/20\d{2}\/20\d{2}-\d{2}-\d{2}\.json$/;
const simple={
 '/api/films':['Filmer/register.json','register'],
 '/api/series':['Serier/register.json','register'],
 '/api/story-register':['Berattelser/register.json','register'],
 '/api/story-status':['Berattelser/lasstatus.json','register'],
 '/api/document-bookmarks':['System/nexus-bookmarks.json','register'],
 '/api/calendar':['Kalender/egna-handelser.json','data'],
 '/api/series-watch-settings':['Serier/bevakning-installningar.json','data'],
 '/api/watch-history':['Serier/Bevakning/handelser.json','data'],
 '/api/media-additions':['System/NexusHub/tillaggsdatum.json','data'],
 '/api/todos':['Att-gora/register.json','data'],
};
const defaults={
 '/api/todos':{schemaVersion:1,items:[]},
 '/api/calendar':{schemaVersion:1,events:[]},
 '/api/watch-history':{schemaVersion:1,events:[]},
 '/api/media-additions':{schemaVersion:1,films:{},series:{},stories:{}},
};

/** A projection is valid only for one completed, SHA-verified GitHub snapshot. */
export async function replicaView(path,params,reader,metadata=[],recent={}){
 if(!simple[path]&&!['/api/ideas','/api/idea-plans','/api/idea-files','/api/economy','/api/portal/overview'].includes(path))return null;
 const snapshot=await reader.current('databas');
 if(!snapshot)return null;
 const entries=new Map(snapshot.files.map(file=>[file.path,file]));
 // Resolve each repository once per projection, including concurrent publications.
 const snapshots=new Map([['databas',Promise.resolve(snapshot)]]);
 const pinned=repo=>{if(!snapshots.has(repo))snapshots.set(repo,Promise.resolve(reader.current(repo)));return snapshots.get(repo);};
 const json=async(repo,file,required=false)=>{
   const current=await pinned(repo);
   if(!current)return null;
   if(!current.files.some(item=>item.path===file)){
     if(required)throw Error('Fil saknas i den synkroniserade spegeln: '+file);
     return null;
   }
   const result=await reader.json(repo,file,current);
   if(result===null||result===undefined)throw Error('Spegelns fil är ofullständig eller skadad: '+file);
   return result;
 };
 const version=async(file)=>{
   if(!entries.has(file))return null;
   const result=await reader.file('databas',file,snapshot);
   if(!result)throw Error('Spegelns fil kunde inte verifieras: '+file);
   return result.sha;
 };
 if(simple[path]){
   const [file,key]=simple[path],sha=await version(file);
   if(!sha&&!(path in defaults))return null;
   const value=sha?await json('databas',file,true):defaults[path];
   return {sha,[key]:value};
 }
 if(path==='/api/ideas'){
   const id=params.get('id');
   if(id){const file=ideaPath(id),sha=await version(file);if(!sha)return null;const idea=validateIdea(await json('databas',file,true));if(idea.id!==id)throw Error('Idéfilens UUID avviker.');return {idea,sha};}
   const prefix=params.get('archive')==='true'?'Ideer/Genomforda/':'Ideer/';
   const ideaFiles=snapshot.files.filter(file=>file.path.startsWith(prefix)&&!file.path.slice(prefix.length).includes('/')&&/^[a-f0-9-]{36}\.json$/.test(file.path.slice(prefix.length)));
   const items=await Promise.all(ideaFiles.map(async file=>{const id=file.path.slice(prefix.length,-5);ideaPath(id);const idea=validateIdea(await json('databas',file.path,true));if(idea.id!==id)throw Error('Idéfilens UUID avviker.');return {idea,sha:await version(file.path)};}));
   const numbering=await json('databas','Ideer/System/nummer.json')||{schemaVersion:1,nextNumber:1,entries:[],dailyCounts:{}};
   if(numbering.schemaVersion!==1||!Array.isArray(numbering.entries)||!Number.isSafeInteger(numbering.nextNumber))throw Error('Ogiltigt idéindex i spegeln.');
   return {numbering:existingIdeaNumbers(numbering,snapshot.files),items:items.sort((a,b)=>b.idea.updatedAt.localeCompare(a.idea.updatedAt)),source:'github-mirror',fetchedAt:snapshot.fetchedAt};
 }
 if(path==='/api/idea-files'){
   const id=params.get('id');ideaPath(id);
   return {files:snapshot.files.filter(f=>f.path.startsWith('Ideer/Bilagor/'+id+'/')).map(f=>({...f,type:'blob',commit:snapshot.commit,name:f.path.split('/').pop().replace(/^[a-f0-9-]{36}-[a-f0-9-]{36}-/,'')}))};
 }
 if(path==='/api/idea-plans'){
   const plans=[],warnings=[];
   for(const file of snapshot.files.filter(f=>/^Fardiga-ideer\/[^/]+\/implementation-plan\.md$/.test(f.path))){
     try{
       const folder=file.path.slice(0,-'implementation-plan.md'.length),id=folder.split('/')[1];
       if(!IDEA_ID.test(id))throw Error('Planmappen måste använda originalidéns UUID.');
       const md=await reader.text('databas',file.path,snapshot);
       if(md===null)throw Error('Planfilen är inte verifierad.');
       const meta=await json('databas',folder+'metadata.json',true);validatePlanMetadata(meta,id);
       if(!await version(folder+'research.md'))throw Error('Planpaketet saknar research.');
       const original=await json('databas','Ideer/'+id+'.json');
       const status=original?.status?IDEA_STATUSES[original.status]||'Okänd idéstatus':'Originalidén saknas';
       const title=md.match(/^#\s+(.+)$/m)?.[1]?.trim()||id;
       const summary=md.split(/\n\s*\n/).find(part=>part.trim()&&!/^[#>|*-]/.test(part.trim()))?.trim().slice(0,240)||'Implementationsplan med underlag.';
       plans.push({path:file.path,sha:await version(file.path),title:meta.title||title,summary:meta.summary||summary,ideaId:id,status,files:snapshot.files.filter(f=>f.path.startsWith(folder)).map(f=>({path:f.path,size:f.size}))});
     }catch(error){warnings.push(error.message||'Planpaketet kunde inte läsas.');}
   }
   return {warnings,plans:plans.sort((a,b)=>String(a.title).localeCompare(String(b.title),'sv')),source:'github-mirror',commit:snapshot.commit};
 }
 if(path==='/api/economy'){
   const periods=snapshot.files.map(f=>f.path).filter(file=>period.test(file)).sort();
   if(periods.length>60)throw Error('För många ekonomiperioder för denna vy.');
   const files=await Promise.all([...budgets,...periods].map(async file=>{const sha=await version(file);if(!sha)throw Error('Ekonomifil saknas: '+file);const data=await json('databas',file,true);if(data?.schema_version!==1||!Array.isArray(data[period.test(file)?'purchases':'entries']))throw Error('Ogiltig ekonomifil: '+file);return {path:file,sha,data};}));
   const catalog=async file=>{const sha=await version(file);return sha?{path:file,sha,data:await json('databas',file,true)}:null;};
   const [categories,products]=await Promise.all([catalog('Ekonomi/Katalog/kategorier.json'),catalog('Ekonomi/Katalog/produkter.json')]);
   return {files,...combineEconomyCatalogRead(categories,products),commit:snapshot.commit,retrievedAt:snapshot.fetchedAt};
 }
 if(path==='/api/portal/overview'){
   const topicFiles=snapshot.files.filter(f=>/^Kunskap\/Kunskapsbanken\/records\/topic-[^/]+\.json$/.test(f.path));
   const enriched=new Map(metadata.map(entry=>[entry.source_path,entry]));
   const active=new Set(),knowledgeTopics=[],warnings=[];
   for(const file of topicFiles){
     try{
       const topic=(await json('databas',file.path,true)).record;
       if(!topic?.active_revision)throw Error('Aktiv revision saknas.');
       const prefix=file.path.slice(0,file.path.lastIndexOf('/')+1);
       const revision=(await json('databas',prefix+'revision-'+topic.active_revision+'.json',true)).record;
       enriched.set(file.path,{...(enriched.get(file.path)||{}),source_path:file.path,title:topic.title,category:topic.category,summary:topic.description,tags:JSON.stringify(topic.tags||[]),kind:'Ämne',topic_id:topic.topic_id,topic_path:file.path});
       let chunkCount=0;
       for(const section of revision.sections||[])for(const [index,id] of (section.chunk_ids||[]).entries()){
         const chunk=prefix+'chunk-'+id+'.json';if(!entries.has(chunk))continue;
         active.add(chunk);chunkCount++;
         const previous=enriched.get(chunk)||{};
         enriched.set(chunk,{...previous,source_path:chunk,title:previous.title||section.title+((section.chunk_ids||[]).length>1?' · del '+(index+1):''),category:topic.category,summary:previous.summary||section.description||topic.description,tags:JSON.stringify(topic.tags||[]),kind:previous.kind||'Kunskap',topic_id:topic.topic_id,topic_path:file.path,section_title:section.title});
       }
       knowledgeTopics.push({path:file.path,topicId:topic.topic_id,title:topic.title,category:topic.category,description:topic.description,knowledgeGaps:topic.knowledge_gaps||[],relatedTopicIds:topic.related_topic_ids||[],chunkCount});
     }catch(error){warnings.push('Ämnesmetadata kunde inte läsas för '+file.path+': '+error.message);}
   }
   const catalog={...makeCatalog({tree:snapshot.files.map(f=>({...f,type:'blob'})),commit:snapshot.commit,fetchedAt:snapshot.fetchedAt,recent:recent.databas?.commit===snapshot.commit?recent.databas.recent:[]},[...enriched.values()],active),knowledgeTopics,warnings};
   const register=await json('databas','Berattelser/register.json');
   if(register?.entries)for(const doc of catalog.documents){const story=register.entries[doc.path];if(story){doc.storyMetadata=story;if(story.title)doc.title=story.title;if(story.category)doc.category=story.category;}}
   const plugins=await pinned('plugins');
   const repositories={databas:catalog};
   const errors=[];
   if(plugins){
     const registry=await json('plugins','catalog.json')||{plugins:[]};
     const packages=await Promise.all(plugins.files.filter(f=>f.path.endsWith('/.codex-plugin/plugin.json')).map(async f=>{
       const sourcePath=f.path.replace('/.codex-plugin/plugin.json',''),entry=registry.plugins?.find(p=>p.source_path===sourcePath),manifest=await json('plugins',f.path);
       return {path:f.path,sourcePath,title:manifest?.interface?.displayName||manifest?.display_name||entry?.name||sourcePath.split('/').pop(),name:entry?.name||sourcePath.split('/').pop(),version:manifest?.version||null,versionSource:manifest?'manifest':'unavailable',description:manifest?.description||'',archived:sourcePath.startsWith('Avinstallerade/'),legacy:!!entry?.replaced_by_plugin_id,publicationState:entry?.publication_state||'Ej registrerad i repoindex',pluginUrl:entry?.plugin_url||null,files:plugins.files.filter(x=>x.path.startsWith(sourcePath+'/')).map(x=>({path:x.path,size:x.size,sha:x.sha})),skills:plugins.files.filter(x=>x.path.startsWith(sourcePath+'/skills/')&&x.path.endsWith('/SKILL.md')).map(x=>x.path)};
     }));
     repositories.plugins={commit:plugins.commit,fetchedAt:plugins.fetchedAt,complete:true,files:plugins.files.map(f=>({path:f.path,size:f.size})),fileCount:plugins.files.length,packages,recent:recent.plugins?.commit===plugins.commit?recent.plugins.recent:[]};
   }else errors.push({repo:'plugins',error:'Pluginspegeln har inte synkroniserats färdigt.'});
   return {generatedAt:snapshot.fetchedAt,repositories,errors,localSeed:true};
 }
 return null;
}
