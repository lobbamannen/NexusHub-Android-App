'use client';
import React,{useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,RefreshCw,ExternalLink,BookOpen,X,Loader2,Clock,FileWarning} from 'lucide-react';
import './mirror-inspector.css';

type Check={path:string,state:string,githubSha?:string|null,mirrorSha?:string|null,verifiedAt?:string|null,lastVerifiedAt?:string|null,checkedAt?:string|null,commit?:string|null};
type Props={path:string,title?:string,initial?:Check|null,onClose:()=>void,onOpen:(path:string)=>void,onUpdate:(check:Check)=>void};
const labels:Record<string,string>={
 same:'Kopian matchar GitHub',divergent:'Avvikelse i den lokala kopian',different:'GitHub och spegeln har olika versioner',missing:'Saknas i lokal spegel',archived:'Filen finns inte längre i GitHub', 'github-missing':'Filen saknas i GitHub och Nexus Hub',unknown:'GitHub kunde inte verifieras'
};
const details:Record<string,string>={
 same:'GitHub-versionens filhash har kontrollerats mot den lokala filen, och innehållet gick att verifiera.',
 divergent:'GitHub-versionens filhash finns registrerad i spegeln, men den lokala originalfilen gick inte att verifiera. En R2-fil kan saknas eller ha en felaktig kontrollsumma. Detta betyder inte automatiskt att GitHub-originalet är felaktigt.',
 different:'GitHub har en annan version än den senast bevarade lokala spegelversionen. Den kan uppdateras vid vanlig synk eller dokumentöppning.',
 missing:'Ingen lokal spegelversion med GitHubs aktuella filhash hittades. Originalet finns fortfarande i GitHub.',
 archived:'En lokal version finns bevarad, men sökvägen saknas i GitHubs aktuella filträd. Den lokala historiken raderas inte.',
 'github-missing':'Sökvägen kunde inte hittas i GitHub och det finns ingen registrerad spegelversion.',
 unknown:'GitHub kunde inte kontaktas eller verifieras. En äldre registrerad version är inte bevis för att nuvarande GitHub-innehåll matchar.'
};
const pretty=(iso?:string|null)=>iso?new Date(iso).toLocaleString('sv-SE'):'Ingen tid registrerad';
export default function MirrorInspector({path,title,initial,onClose,onOpen,onUpdate}:Props){
 const [check,setCheck]=useState<Check|null>(initial||null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const refresh=async()=>{setLoading(true);setError('');try{
  const r=await fetch('/api/portal/compare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repo:'databas',paths:[path]}),cache:'no-store'});
  const json:any=await r.json();if(!r.ok)throw Error(json.error||'Kontrollen misslyckades.');
  const item=json.items?.[0];if(!item)throw Error('Inget jämförelseresultat returnerades.');
  const result={...item,checkedAt:json.checkedAt,commit:json.commit};setCheck(result);onUpdate(result);
 }catch(e:any){setError(e.message||'Kunde inte kontrollera dokumentet.');}finally{setLoading(false);}};
 useEffect(()=>{setCheck(initial||null);refresh();},[path]);
 const status=check?.state||'unknown';
 return <div className="mirror-inspector-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="mirror-inspector" role="dialog" aria-modal="true" aria-label="Visa avvikelse i lokal spegel">
   <div className="mirror-inspector-head"><span><FileWarning size={21}/>Kontrollera avvikelse</span><button onClick={onClose} aria-label="Stäng"><X size={20}/></button></div>
   <div className="mirror-inspector-body">
    <h2>{title||path.split('/').pop()}</h2>
    <p className="mirror-inspector-path">{path}</p>
    <div className={'mirror-inspector-status '+(status==='same'?'valid':'warning')}>{status==='same'?<CheckCircle2 size={21}/>:<AlertTriangle size={21}/>}<strong>{labels[status]||status}</strong></div>
    <p>{details[status]||'Kontrollens tillstånd är inte känt.'}</p>
    {error&&<p className="mirror-inspector-error" role="alert">{error}</p>}
    <dl className="mirror-inspector-data"><dt>GitHubs filhash</dt><dd><code>{check?.githubSha||'Ej tillgänglig'}</code></dd><dt>Lokal filhash</dt><dd><code>{check?.mirrorSha||'Ingen registrerad'}</code></dd><dt>Senast verifierad spegel</dt><dd>{pretty(check?.verifiedAt||check?.lastVerifiedAt)}</dd><dt>Senaste livekontroll</dt><dd>{pretty(check?.checkedAt)}</dd>{check?.commit&&<><dt>GitHub-commit</dt><dd><code>{check.commit.slice(0,12)}</code></dd></>}</dl>
    <p className="mirror-inspector-explain"><Clock size={16}/>En avvikelse visar bara jämförelsens tekniska status. Den ändrar inte GitHub-originalet eller raderar lokal historik.</p>
   </div>
   <div className="mirror-inspector-actions"><button className="secondary" disabled={loading} onClick={refresh}>{loading?<Loader2 className="spin" size={17}/>:<RefreshCw size={17}/>}Kontrollera igen</button><button className="primary" onClick={()=>{onClose();onOpen(path);}}><BookOpen size={17}/>Öppna och kontrollera original</button><button className="mirror-inspector-close" onClick={onClose}>Stäng</button></div>
  </section>
 </div>;
}
