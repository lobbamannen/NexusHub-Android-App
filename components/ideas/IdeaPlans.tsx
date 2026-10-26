import React, {useEffect,useState} from 'react';
import {ArrowRight,ClipboardList,FileText,RefreshCw} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
type Plan={path:string;sha:string;title:string;summary:string;status:string;files:{path:string;size:number}[]};
export default function IdeaPlans({onOpen}:{onOpen:(path:string)=>void}) {
    const [plans,setPlans]=useState<Plan[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[stale,setStale]=useState(false),[revision,setRevision]=useState(0);
    useEffect(()=>{let active=true;
        const reload=async()=>{setLoading(true);try{
            const response=await fetch('/api/idea-plans',{cache:'no-store'}),data=await response.json();
            if(!response.ok)throw Error(data.error||'Planerna kunde inte hämtas.');
            if(active){setPlans(data.plans);setStale(response.headers.get('X-Nexus-Offline')==='true');setError((data.warnings||[]).join(' '));}
        }catch(e:any){if(active)setError(e.message);}finally{if(active)setLoading(false);}};
        void reload();
        const changed=()=>setRevision(value=>value+1);
        window.addEventListener('nexus-github-changed',changed);
        return()=>{active=false;window.removeEventListener('nexus-github-changed',changed);};
    },[revision]);
    return <div className="nh-ideas">
        <div className="nh-module-category-head"><div><span className="nh-module-eyebrow">REDO NÄR DU ÄR</span><h2>Färdiga planer</h2><p>Undersökta idéer med implementationsplan och underlag. Du väljer när de ska byggas.</p></div></div>
        <div className="nh-ideas-actions"><button type="button" className="secondary" disabled={loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={17} className={loading?'spin':''}/>Uppdatera</button></div>
        {error&&<p className="error-banner" role="alert">{error}</p>}{stale&&<p className="nh-ideas-note">Visar den senast hämtade lokala kopian.</p>}
        {plans.map(plan=><section key={plan.path}>
            <button type="button" className="nh-register-shortcut" onClick={()=>onOpen(plan.path)}><MaterialIcon tone="violet" size={38}><ClipboardList size={25}/></MaterialIcon><span className="nh-register-shortcut-copy"><strong>{plan.title}</strong><small>{plan.summary}</small><small>{plan.files.length} filer · {plan.status}</small></span><ArrowRight size={18}/></button>
            {plan.files.length>1&&<details className="panel settings-panel"><summary>Visa underlag</summary>{plan.files.filter(file=>file.path!==plan.path).map(file=><button key={file.path} type="button" className="entry-row" onClick={()=>onOpen(file.path)}><FileText size={18}/><span className="entry-text break">{file.path.split('/').pop()}</span><ArrowRight size={16}/></button>)}</details>}
        </section>)}
        {!plans.length&&!error&&<div className="hub-empty"><ClipboardList size={32}/><strong>{loading?'Hämtar planer…':'Här väntar nästa färdigutvecklade idé'}</strong><p>Be ChatGPT utveckla en idé med research, beslut och en komplett implementationsplan och spara planpaketet i Fardiga-ideer/. Ursprungliga idén behålls.</p></div>}
    </div>;
}
