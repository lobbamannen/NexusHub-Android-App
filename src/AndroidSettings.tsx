import React, { useEffect, useState } from 'react';
import { Database, KeyRound, RefreshCw, Save, ChevronDown, AlertCircle } from 'lucide-react';
import { setGithubToken } from '@/platform/env';
import { pendingWrites, retryPendingWrites, discardPendingWrite } from '@/platform/api';
import { replicaStatus, type ReplicaStatus } from '@/platform/replica-sync';
import type { PendingWrite } from '@/platform/outbox';

export function TokenForm({ onConnected, initial = false }: { onConnected?: () => void; initial?: boolean }) {
  const [token,setToken] = useState(''), [busy,setBusy] = useState(false), [message,setMessage] = useState('');
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]+$/.test(token.trim())) throw Error('Ange en giltig GitHub-token.');
      for (const path of ['Databas/contents/Filmer/register.json', 'ChatGPT-Plugin/contents/catalog.json']) {
        const response = await fetch('https://api.github.com/repos/lobbamannen/' + path, {headers:{Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
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
  return <details className="nh-settings-section" open={items.length>0}>
    <summary><Database size={22}/><span><strong>Android-app & GitHub</strong><small>Token och väntande sparningar på den här telefonen.</small></span><ChevronDown size={18} className="nh-details-chevron"/></summary>
    <div className="panel settings-panel"><h2><KeyRound size={18}/> GitHub-anslutning</h2><TokenForm/>
      <h2>Beständig lokal kopia</h2><p>Allt innehåll utom Kunskap/ kopieras automatiskt till telefonen. GitHub kontrolleras var 15:e sekund medan appen är öppen och direkt när den återupptas. Öppna redigeringar behålls.</p><p role="status">{replica.running ? 'Kopierar: '+replica.done+' av '+replica.total+' filer i aktuellt repository.' : replica.checkedAt ? 'Senast kontrollerat: '+new Date(replica.checkedAt).toLocaleString('sv-SE') : 'Väntar på första lokala kopieringen.'}</p>{replica.error && <p className="error-banner">{replica.error}</p>}
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
