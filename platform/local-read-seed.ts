import { db } from '@/lib/store';
import { replicaView } from '@/lib/replica-projections.mjs';
import { replicaReader } from './mirror-access';
import { durableGet } from './local-store';

/** GET projections originate exclusively from completed, SHA-checked mirror snapshots. */
const projections = new Map<string, Promise<any>>();
export async function localReadSeed(path: string, search = '') {
  const current=await replicaReader.current('databas');
  if(!current)return null;
  const plugins=path==='/api/portal/overview'?await replicaReader.current('plugins'):null;
  const key=[path,search,current.commit,plugins?.commit||''].join('|');
  if(!projections.has(key)){
    const work=(async()=>{
      let metadata:any[]=[];
      if(path==='/api/portal/overview')metadata=(await db().prepare("SELECT id,title,summary,module,category,kind,tags,source_path FROM entries WHERE deleted=0 AND origin='github'").all()).results;
      const recent=path==='/api/portal/overview'?Object.fromEntries(await Promise.all(['databas','plugins'].map(async repo=>[repo,await durableGet<{commit:string;recent:any[]}>('replica-recent:v1:'+repo)]))):{};
      return replicaView(path,new URLSearchParams(search),replicaReader,metadata,recent);
    })();
    projections.set(key,work);
    if(projections.size>60){const oldest=projections.keys().next().value;if(oldest)projections.delete(oldest);}
    void work.catch(()=>projections.delete(key));
  }
  return projections.get(key);
}
