import {replicaReader} from './mirror-access';
import {derivedGet as durableGet,derivedSet as durableSet} from './derived-cache';
import {monthPath,normalizeTrainingMonth} from '@/lib/training-archive.mjs';

export async function trainingArchive(month?:string){
 const snapshot=await replicaReader.current('databas');
 if(!snapshot)return {state:'unavailable',months:[],entries:[],warnings:[],message:'Träningshistoriken blir tillgänglig när Databas har synkroniserats klart.'};
 const months=snapshot.files.filter((f:any)=>/^Cortex\/Data\/Dagsloggar\/(\d{4})\/\1-(0[1-9]|1[0-2])\.json$/.test(f.path)).map((f:any)=>f.path.split('/').pop().slice(0,7)).sort();
 if(!month)return {state:'ready',months,commit:snapshot.commit,verifiedAt:snapshot.fetchedAt};
 const path=monthPath(month),file=snapshot.files.find((f:any)=>f.path===path);
 if(!file)return {state:'empty',months,entries:[],warnings:[],commit:snapshot.commit,path};
 const cacheKey='training:projection:v2:'+file.sha+':'+month;
 let result=await durableGet<any>(cacheKey);
 if(!result){const bytes=await replicaReader.file('databas',path);if(!bytes||bytes.sha!==file.sha||bytes.commit!==snapshot.commit)return {state:'unavailable',months,entries:[],warnings:[],message:'Månadens kopia kunde inte verifieras. Försök igen efter synk.'};
 result=normalizeTrainingMonth(JSON.parse(new TextDecoder().decode(bytes.bytes)),month,{path,blobSha:file.sha});await durableSet(cacheKey,result);}
 if((await replicaReader.current('databas'))?.commit!==snapshot.commit)throw Error('Databasen uppdaterades. Läs månaden igen.');
 return {...result,entries:result.entries.map((e:any)=>({...e,source:{...e.source,commit:snapshot.commit}})),state:'ready',months,commit:snapshot.commit,path,sha:file.sha,verifiedAt:snapshot.fetchedAt};
}
