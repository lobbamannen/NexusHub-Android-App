import TelemetrySettings from './TelemetrySettings';
import React, { useEffect, useState } from 'react';
import { Database, KeyRound, RefreshCw, Save, ChevronDown, AlertCircle, Pause, CloudCheck } from 'lucide-react';
import { setGithubToken } from '@/platform/env';
import { pendingWrites, retryPendingWrites, discardPendingWrite } from '@/platform/api';
import { replicaStatus, syncReplicaNow, pauseReplicaSync, type ReplicaStatus } from '@/platform/replica-sync';
import { github } from '@/lib/github';
import './android-settings.css';
import type { PendingWrite } from '@/platform/outbox';

export function TokenForm({ onConnected, initial = false }: { onConnected?: () => void; initial?: boolean }) {
  const [token,setToken] = useState(''), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token.trim())) throw Error('Ange en giltig GitHub-token.');
      for (const path of ['Databas/contents/Filmer/register.json', 'ChatGPT-Plugin/contents/catalog.json']) {
        const response = await fetch('https://api.github.com/repos/lobbamannen/' + path, {signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
        if (!response.ok) throw Error(response.status===401?'Token är ogiltig eller har gått ut.':'Token kunde inte läsa '+path.split('/')[0]+'. Kontrollera åtkomst och Contents-behörigheten.');
        await response.arrayBuffer();
      }
      if (!setGithubToken(token)) throw Error('Telefonen kunde inte spara token.');
      setToken(''); setMessage('Ansluten till GitHub. Token är sparad.');
      window.dispatchEvent(new Event('nexus-credentials-changed')); onConnected?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="settings-panel">
    <p>{initial ? 'Anslut din privata databas för att öppna Nexus Hub.' : 'Token finns sparad. Fyll bara i fältet om du vill byta den.'}</p>
    <label>GitHub fine-grained token<input aria-label="GitHub fine-grained token" type="password" value={token} onChange={event=>setToken(event.target.value)} autoComplete="off" spellCheck={false} placeholder="github_pat_…" style={{display:'block',width:'100%',marginTop:8}} /></label>
    <p className="muted small">Ge token Contents: Read and write till Databas och läsåtkomst till ChatGPT-Plugin. I Android krypteras token och finns kvar vid vanliga appuppdateringar.</p>
    <button className="primary" disabled={busy || !token.trim()}><Save size={17}/>{busy?'Kontrollerar…':'Spara och anslut'}</button>
    {message && <p role="status" className="small">{message}</p>}
  </form>;
}

export default function AndroidSettings() {
  const [items,setItems] = useState<PendingWrite[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [replica,setReplica] = useState<ReplicaStatus>(replicaStatus());
  useEffect(()=>{const update=()=>setReplica(replicaStatus());window.addEventListener('nexus-replica-status',update);return()=>window.removeEventListener('nexus-replica-status',update);},[]);
  const reload = () => { void pendingWrites().then(setItems).catch(e=>setError(e.message)); };
  useEffect(()=>{reload();window.addEventListener('nexus-outbox-changed',reload);return()=>window.removeEventListener('nexus-outbox-changed',reload);},[]);
  const retry = async (id?:string) => {setBusy(true);setError('');try {setItems(await retryPendingWrites(id));}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const [checking,setChecking]=useState(false),[connection,setConnection]=useState('');
  const check=async()=>{setChecking(true);setConnection('');try{await Promise.all([github().status(),github('plugins').status()]);setConnection('Anslutningen fungerar till Databas och ChatGPT-Plugin.');}catch(e:any){setConnection(e.message);}finally{setChecking(false);}};
  const size=(n:number)=>n<1048576?(n/1024).toFixed(0)+' kB':(n/1048576).toFixed(1)+' MB';
  return <details id="nh-android-settings" className="nh-settings-section nh-android-settings" open>
    <summary><Database size={22}/><span><strong>GitHub & lokal lagring</strong><small>Hämtning, anslutning och väntande sparningar.</small></span><ChevronDown size={18} className="nh-details-chevron"/></summary>
    <TelemetrySettings/>
    <div className="panel settings-panel"><h2><Database size={18}/> Beständig lokal kopia</h2>
      <p>Hela Databas, inklusive Kunskap och bilder, samt ChatGPT-Plugin sparas på telefonen. Appen jämför filernas GitHub-hashar och hämtar bara nya eller ändrade filer. Första hämtningen kan ta en stund.</p>
      <p role="status" className="nh-replica-status">{replica.paused?'Hämtningen är pausad.':replica.running?replica.phase==='checking'?'Jämför GitHub med telefonens filer…':replica.phase==='refreshing'?'Uppdaterar appens register…':'Hämtar nya och ändrade filer…':replica.error?'Hämtningen behöver ett nytt försök.':replica.checkedAt?'Alla filer i senaste kontrollen finns lokalt.':'Redo att kontrollera GitHub.'}</p>
      {Object.entries(replica.repositories).map(([repo,status])=><div className="nh-replica-repo" key={repo}><div><strong>{repo==='databas'?'Databas':'ChatGPT-Plugin'}</strong><span>{status.done.toLocaleString('sv-SE')} / {status.total.toLocaleString('sv-SE')} filer</span></div><progress aria-label={'Lokalt sparat i '+repo} max={Math.max(1,status.total)} value={status.done}/><small>{size(status.doneBytes)} av {size(status.totalBytes)} · {Math.max(0,status.total-status.done).toLocaleString('sv-SE')} återstår</small></div>)}
      {replica.currentPath&&replica.running&&<p className="small break">{replica.currentPath}</p>}
      {replica.checkedAt&&<p className="small muted">Senaste fullständiga kontroll: {new Date(replica.checkedAt).toLocaleString('sv-SE')}</p>}
      {replica.error&&<p className="error-banner" role="alert">{replica.error}</p>}
      <div className="nh-android-settings-actions"><button type="button" className="primary" disabled={replica.running&&!replica.paused} onClick={()=>void syncReplicaNow()}><RefreshCw size={17}/>{replica.paused?'Fortsätt hämtningen':replica.error?'Försök igen':'Hämta allt nytt från GitHub'}</button>{replica.running&&!replica.paused&&<button type="button" className="secondary" onClick={pauseReplicaSync}><Pause size={17}/>Pausa</button>}</div>
      <p className="muted small">Automatisk kontroll var 15:e sekund medan appen är öppen och när du återvänder. Paus stoppar efter pågående filer. Hämtningen ändrar inga GitHub-filer och skickar inga väntande utkast.</p>
      <details className="nh-settings-token"><summary><KeyRound size={17}/> GitHub-anslutning & token</summary><p className="small">Token lagras krypterad i Android. Du behöver bara byta den om den går ut eller behörigheten ändras.</p><button type="button" className="secondary" disabled={checking} onClick={()=>void check()}><CloudCheck size={17}/>{checking?'Kontrollerar…':'Kontrollera anslutningen'}</button>{connection&&<p role="status" className="small">{connection}</p>}<TokenForm/></details>
      <h2>Väntande sparningar ({items.length})</h2>
      {!items.length && <p>Inga ändringar väntar på synk.</p>}
      {items.map(item=><div className="panel" key={item.id} style={{padding:16,marginBlock:12}}>
        <strong>{item.status==='conflict'?'Versionskonflikt':item.status==='failed'?'Behöver kontrolleras':'Väntar på GitHub'}</strong>
        <p className="small break">{item.path} · {new Date(item.createdAt).toLocaleString('sv-SE')}</p><p className="small">{item.error}</p>
        <button className="secondary" disabled={busy} onClick={()=>void retry(item.id)}><RefreshCw size={16}/>Kontrollera och försök igen</button>
        <button className="text-button" disabled={busy} onClick={()=>{if(window.confirm('Ta bort detta väntande försök? Inga redan sparade GitHub-uppgifter ändras.')){setBusy(true);setError('');void discardPendingWrite(item.id).then(reload).catch(e=>setError('Kunde inte ta bort sparförsöket. '+e.message)).finally(()=>setBusy(false));};}}>Ta bort väntande försök</button>
      </div>)}
      {items.some(item=>item.status==='pending') && <button className="secondary" disabled={busy} onClick={()=>void retry()}><RefreshCw size={17}/>Synka väntande ändringar</button>}
      {error && <p className="error-banner"><AlertCircle size={17}/>{error}</p>}
    </div>
  </details>;
}
