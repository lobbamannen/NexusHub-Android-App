import React,{useEffect,useState} from 'react';
import {Archive,ExternalLink,RefreshCw} from 'lucide-react';
import {IDEA_STATUSES} from '@/lib/ideas.mjs';
import type {IdeasController,IdeaRow} from './use-ideas';
export default function IdeasArchive({ideas}:{ideas:IdeasController}){
 const [rows,setRows]=useState<IdeaRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[stale,setStale]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setLoading(true);void fetch('/api/ideas?archive=true',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Arkivet kunde inte hämtas.');if(active){setRows(d.items);setError('');setStale(r.headers.get('X-Nexus-Offline')==='true');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});const changed=()=>setRevision(n=>n+1);window.addEventListener('nexus-github-changed',changed);return()=>{active=false;window.removeEventListener('nexus-github-changed',changed);};},[revision]);
 const merged=new Map(rows.map(row=>[row.idea.id,{...row,archived:true}]));
 for(const row of ideas.items)if(['completed','dismissed'].includes(row.idea.status)&&!ideas.pending[row.idea.id]&&!ideas.drafts[row.idea.id])merged.set(row.idea.id,{...row,archived:false});
 return <div className="nh-idea-history"><div className="nh-module-category-head"><div><span className="nh-module-eyebrow">BEVARADE TANKAR</span><h2>Idéarkiv</h2><p>Genomförda och avfärdade idéer. Öppna en post för att läsa originaltexten.</p></div></div><button type="button" className="secondary" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={17} className={loading?'spin':''}/>Uppdatera</button>{error&&<p className="error-banner" role="alert">{error}</p>}{stale&&<p className="nh-ideas-note">Visar den senast hämtade lokala kopian.</p>}
 {[...merged.values()].sort((a,b)=>b.idea.updatedAt.localeCompare(a.idea.updatedAt)).map(({idea,archived})=><details className="nh-idea-card nh-archived-idea" key={idea.id}><summary><span className="nh-idea-status">{IDEA_STATUSES[idea.status]}</span><strong>Idé {ideas.numbering.entries.find(e=>e.id===idea.id)?.number||'–'}</strong><span className="nh-archive-preview">{idea.text}</span></summary><p className="nh-archive-text">{idea.text}</p><a className="text-button" href={'https://github.com/lobbamannen/Databas/blob/main/Ideer/'+(archived?'Genomforda/':'')+idea.id+'.json'} target="_blank" rel="noreferrer"><ExternalLink size={16}/>Visa i GitHub</a></details>)}
 {!merged.size&&!error&&<div className="hub-empty"><Archive size={32}/><strong>{loading?'Hämtar arkivet…':'Arkivet är tomt'}</strong></div>}
 </div>;
}
