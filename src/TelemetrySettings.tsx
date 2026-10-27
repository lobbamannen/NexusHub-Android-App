import React,{useEffect,useState} from 'react';
import {Activity} from 'lucide-react';
import {refreshTelemetry,setTelemetryEnabled,telemetryStatus} from '@/platform/telemetry';
export default function TelemetrySettings(){
 const [state,setState]=useState(telemetryStatus()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const update=()=>setState(telemetryStatus());window.addEventListener('nexus-telemetry-status',update);void refreshTelemetry();return()=>window.removeEventListener('nexus-telemetry-status',update);},[]);
 return <div className="panel settings-panel"><h2><Activity size={18}/> Diagnostik och användningsstatistik</h2>
 <p>Tekniska händelser hjälper oss att förstå synk, laddning, sparningar och seriebevakning. NexusHub har en egen rapportsida i PostHog EU, separat från Cortex.</p>
 <p className="small muted">Inga texter, titlar, sökningar, belopp, filnamn, kalenderinnehåll eller nycklar skickas. Ingen skärminspelning. En anonym installationsidentitet används. Valet sparas mellan appuppdateringar.</p>
 <p role="status">{!state.supported?'Tillgängligt i Android-appen.':!state.sdkReady?'Diagnostiken är inte ansluten.':state.enabled?'På · godkända händelser köas för PostHog.':'Av · inga nya händelser samlas in.'}</p>
 <button type="button" className={state.enabled?'secondary':'primary'} role="switch" aria-checked={state.enabled} disabled={busy||!state.supported||(!state.sdkReady&&!state.enabled)} onClick={async()=>{setBusy(true);setError('');try{await setTelemetryEnabled(!state.enabled);}catch{setError('Valet kunde inte sparas. Försök igen.');}finally{setBusy(false);}}}>{busy?'Sparar…':state.enabled?'Stäng av diagnostik':'Aktivera diagnostik'}</button>
 <p className="small muted">Avstängning rensar oskickade händelser. Redan skickade händelser finns kvar i PostHog. Köad betyder inte bekräftat levererad.</p>
 {(error||state.error)&&<p className="error-banner" role="alert">{error||state.error}</p>}
 </div>;
}
