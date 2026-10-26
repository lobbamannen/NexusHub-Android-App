import { validatePlanMetadata } from '@/lib/idea-plans.mjs';
import { IDEA_ID, IDEA_STATUSES } from '@/lib/ideas.mjs';
import { github } from '@/lib/github';
const json = (data: unknown, status = 200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
/** Plan packages are prepared in ChatGPT and stored once in GitHub, not another registry. */
export async function GET() {
    try {
        const client=github(), snapshot=await client.snapshot();
        if(snapshot.truncated) throw Error('GitHub gav ett ofullständigt filträd.');
        const files=snapshot.tree.filter((file:any)=>file.type==='blob' && /^Fardiga-ideer\/[^/]+\/implementation-plan\.md$/.test(file.path));
        const plans=[]; const warnings:string[]=[];
        for(let offset=0;offset<files.length;offset+=4) {
            const batch=await Promise.allSettled(files.slice(offset,offset+4).map(async(file:any)=>{
                const text=new TextDecoder('utf-8',{fatal:true}).decode(await client.blob(file.sha));
                const folder=file.path.slice(0,-'implementation-plan.md'.length), id=folder.split('/')[1];
                if(!IDEA_ID.test(id)) throw Error('Planmappen måste använda originalidéns UUID.');
                const metadataFile=snapshot.tree.find((f:any)=>f.path===folder+'metadata.json' && f.type==='blob');
                const researchFile=snapshot.tree.find((f:any)=>f.path===folder+'research.md' && f.type==='blob');
                if(!metadataFile || !researchFile) throw Error('Planpaketet saknar metadata eller research: '+id);
                const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await client.blob(metadataFile.sha)));
                validatePlanMetadata(metadata,id);
                const ideaFile=snapshot.tree.find((f:any)=>f.path==='Ideer/'+id+'.json' && f.type==='blob');
                const original=ideaFile ? JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await client.blob(ideaFile.sha))) : null;
                const status=original?.status ? IDEA_STATUSES[original.status as keyof typeof IDEA_STATUSES] || 'Okänd idéstatus' : 'Originalidén saknas';
                const title=text.match(/^#\s+(.+)$/m)?.[1]?.trim() || folder.split('/').filter(Boolean).at(-1);
                const summary=text.split(/\n\s*\n/).find((part:string)=>part.trim() && !/^[#>|*-]/.test(part.trim()))?.trim().slice(0,240) || 'Implementationsplan med underlag.';
                return {path:file.path,sha:file.sha,title:metadata.title||title,summary:metadata.summary||summary,ideaId:id,status,files:snapshot.tree.filter((f:any)=>f.type==='blob' && f.path.startsWith(folder)).map((f:any)=>({path:f.path,size:f.size}))};
            }));
            for(const result of batch) { if(result.status==='fulfilled') plans.push(result.value); else warnings.push(result.reason?.message || 'Ett ofullständigt planpaket kunde inte läsas.'); }
        }
        return json({warnings,plans:plans.sort((a,b)=>String(a.title).localeCompare(String(b.title),'sv')),source:'github',commit:snapshot.commit});
    } catch(error:any) {return json({error:error.message||'Planerna kunde inte hämtas.'},503);}
}
