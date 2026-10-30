import React,{useEffect,useState} from 'react';
import {AlertCircle,CheckCircle2,ChevronRight,HelpCircle,RefreshCw,ShieldCheck} from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import {guardianFindings} from '@/lib/guardian.mjs';
import {guardianAssets} from '@/platform/guardian-assets';
import type {ConnectionModel} from '@/components/connections/use-connections';
import '../connected-modules.css';
export function GuardianSurface({findings,loading,onRefresh,onAction,details=[]}:{findings:any[];loading:boolean;onRefresh:()=>void;onAction:(v:string)=>void;details?:string[]}){
 const issues=findings.filter(x=>x.state==='issue').length,unknown=findings.filter(x=>x.state==='unknown'||x.state==='pending').length;
 return <section className="nh-connected nh-guardian" aria-label="Nexus Guardian"><header className="nh-connected-heading"><MaterialIcon tone="blue" size={50}><ShieldCheck size={30}/></MaterialIcon><div><p className="eyebrow">NEXUS HUB · GUARDIAN</p><h2>Systemhälsa</h2><p>{issues?issues+' områden behöver ses över':unknown?'Kontroller återstår':'Inga avvikelser i de utförda kontrollerna'}</p></div></header><div className="nh-connected-actions"><button className="secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={17} className={loading?'spin':''}/>{loading?'Kontrollerar…':'Kontrollera igen'}</button><small className="nh-source-caption">Kontrollen ändrar inga originalfiler.</small></div><div className="nh-guardian-findings">{findings.map(x=>{const Icon=x.state==='ok'?CheckCircle2:x.state==='issue'?AlertCircle:HelpCircle;return <article key={x.id} className={'nh-health-item '+x.state}><Icon size={21}/><div><h3>{x.title}</h3><p>{x.detail}</p><small>{({ok:'Kontrollerat',issue:'Avvikelse hittad',unknown:'Ej verifierat',pending:'Pågår / återstår'}as any)[x.state]}</small></div>{x.action&&<button className="text-button" onClick={()=>onAction(x.action)}>Visa<ChevronRight size={16}/></button>}</article>;})}</div>{details.length>0&&<details className="nh-diagnostic"><summary>Visa detaljer ({details.length})</summary>{details.map((s,i)=><p key={i}>{s}</p>)}</details>}<p className="nh-source-caption">En grön kontroll gäller bara den visade omfattningen och versionen. Reparationer startar du uttryckligen i integritetskontrollen.</p></section>;
}
export default function Guardian({replica,model,onAction}:{replica:any;model:ConnectionModel;onAction:(v:string)=>void}){
 const [intelligence,setIntelligence]=useState<any>(null);
 const [audit,setAudit]=useState<any>(null),[checkError,setCheckError]=useState(''),[loading,setLoading]=useState(false),[posters,setPosters]=useState<string[]>([]),[posterChecked,setPosterChecked]=useState(false),[metadata,setMetadata]=useState<string[]>([]),[retry,setRetry]=useState(0),[checkedAt,setCheckedAt]=useState(''),[assetError,setAssetError]=useState('');
 useEffect(()=>{const controller=new AbortController();setLoading(true);setAssetError('');setPosterChecked(false);setCheckError('');setMetadata([]);setPosters([]);
 void(async()=>{const a=await Promise.allSettled([(async()=>{const r=await fetch('/api/portal/audit',{signal:controller.signal});const d=await r.json();if(!r.ok)throw Error(d.error||'Filkontrollen kunde inte läsas.');return d;})(),guardianAssets()]);if(controller.signal.aborted)return;
 if(a[0].status==='fulfilled')setAudit(a[0].value);else{setAudit(null);setCheckError(a[0].reason.message);}
 if(a[1].status==='fulfilled'){setPosters(a[1].value.missing);setPosterChecked(true);setMetadata(a[1].value.incomplete);}else setAssetError(a[1].reason.message);
 setCheckedAt(new Date().toLocaleString('sv-SE'));})().catch(e=>{if(!controller.signal.aborted)setCheckError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[retry,replica.running,replica.repositories?.databas?.commit]);
 useEffect(()=>{
  const bridge=()=>typeof window==='undefined'?null:(window as any).Android;
  const refresh=()=>{
   const native=bridge();
   if(!native?.intelligenceIndexStatus){setIntelligence(null);return;}
   try{
    const index=JSON.parse(native.intelligenceIndexStatus()||'{}');
    const counts=JSON.parse(native.intelligenceRunCounts?.()||'{}');
    setIntelligence({index,counts});
   }catch{setIntelligence({error:'Nexus Intelligence kunde inte avläsas.'});}
  };
  refresh();
  const tick=window.setInterval(refresh,15000);
  return()=>window.clearInterval(tick);
 },[retry,replica.repositories?.databas?.commit]);
 const findings:any[]=guardianFindings({replica,audit,links:{broken:model.index?.broken||[],complete:!!model.index?.complete&&!model.loading&&!model.error&&model.index.commit===replica.repositories?.databas?.commit},posterMissing:posters,posterChecked,checkError,expectedCommit:replica.repositories?.databas?.commit});
 if(intelligence){
  const source=intelligence.index||{};
  const runs=intelligence.counts||{};
  const current=replica.repositories?.databas?.commit;
  const stale=source.ready && current && source.commit!==current;
  const queued=Number(source.pendingAnalysis||0);
  const failed=Number(runs.failed||0);
  const state=intelligence.error?'unknown':source.automaticSuspended?'issue':stale?'pending':
    failed>0?'issue':!source.ready?'pending':queued>0?'pending':'ok';
  const detail=intelligence.error||
    (source.ready?(source.indexedFiles||0)+' indexerade textfiler · '+queued+
      ' väntande forskningsanalyser · '+failed+' felaktiga körningar':
      'Det verifierade lokala sökindexet är inte färdigt.')+
    (stale?' · Nyare GitHub-version väntar på indexering.':'')+
    (source.automaticSuspended?' · Automatisk analys stoppad efter backendfel.':'');
  findings.push({id:'intelligence',state,title:'Nexus Intelligence',detail,action:'intelligence'});
 }
 if(posterChecked)findings.push({id:'metadata',state:metadata.length?'issue':'ok',title:'Film- och seriemetadata',detail:metadata.length?metadata.length+' titlar saknar namn eller årtal.':'Kontrollerade titlar har namn och årtal.'});
 return <><GuardianSurface findings={findings} loading={loading} onRefresh={()=>{setRetry(n=>n+1);model.reload();}} onAction={onAction} details={[...(assetError?[assetError]:[]),...posters.map(x=>'Affisch saknas: '+x),...metadata.map(x=>'Ofullständig metadata: '+x),...(model.index?.broken||[]).map((x:any)=>x.from+' → '+x.path)]}/>{checkedAt&&<p className="nh-source-caption">Status hämtad {checkedAt}. Filkontrollens datum finns i integritetskontrollen.</p>}</>;
}
