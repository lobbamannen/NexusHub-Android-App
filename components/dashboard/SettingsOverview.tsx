'use client';
import MaterialIcon from '@/components/MaterialIcon';
import React from 'react';
import { ArrowRight, Database, FolderCheck, ShieldCheck, Settings2, RefreshCw } from 'lucide-react';
type Props = {
    fileCount?: number | null;
    verifiedFiles?: number | null;
    pending?: number | null;
    verifiedAt?: string | null;
    catalogCommit?: string | null;
    mirrorCommit?: string | null;
    mirrorTotal?: number | null;
    onOpenAudit: () => void;
    onOpenSync: () => void;
};
const display = (value?: number | null) => typeof value === 'number' ? value.toLocaleString('sv-SE') : '–';
export default function SettingsOverview({ fileCount, verifiedFiles, pending, verifiedAt, catalogCommit, mirrorCommit, mirrorTotal, onOpenAudit, onOpenSync }: Props) {
    const timestamp = verifiedAt && !Number.isNaN(Date.parse(verifiedAt)) ? new Date(verifiedAt).toLocaleString('sv-SE') : null;
    return <section className="nh-settings-overview nh-module-dashboard" aria-labelledby="nh-settings-title">
  <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="violet" size={48}><Settings2 size={29} aria-hidden="true"/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · SYSTEM</span><h1 id="nh-settings-title">Inställningar & system</h1><p>Kontrollera lagring, integritet och din lokala GitHub-spegel utan att lämna appen.</p></div></div></header>
  <div className="nh-module-stat-row nh-settings-stat-row" aria-label="Systemöversikt">
   <div className="nh-module-stat nh-tone-blue"><MaterialIcon tone="violet" size={30}><Database size={22}/></MaterialIcon><strong>{display(fileCount)}</strong><span>Filer i GitHub</span></div>
   <div className="nh-module-stat nh-tone-green"><MaterialIcon tone="violet" size={30}><FolderCheck size={22}/></MaterialIcon><strong>{display(verifiedFiles)}</strong><span>Matchningar i inventeringen</span></div>
   <div className="nh-module-stat nh-tone-orange"><MaterialIcon tone="violet" size={30}><RefreshCw size={22}/></MaterialIcon><strong>{display(pending)}</strong><span>Återstår i inventeringen</span></div>
  </div>
  <p className="nh-settings-verification"><ShieldCheck size={17}/>GitHub är huvudkälla. {timestamp ? 'Senaste spegelinventering: ' + timestamp + '.' : 'Tid för senaste spegelinventering saknas.'} En versionsmatchning är inte detsamma som byteverifiering.</p><p className="nh-settings-verification">GitHub: {catalogCommit?.slice(0, 12) || 'okänd version'} · Spegel: {mirrorCommit?.slice(0, 12) || 'ingen inventering'} · {display(mirrorTotal)} inventerade filer. {catalogCommit && mirrorCommit && catalogCommit !== mirrorCommit ? 'Spegelstatusen gäller en tidigare inventering, inte den aktuella GitHub-versionen.' : ''}</p>
  <div className="nh-settings-actions"><button className="nh-settings-action" type="button" onClick={onOpenAudit}><MaterialIcon tone="blue" size={38}><ShieldCheck size={23}/></MaterialIcon><span><strong>Verifiera hela databasen</strong><small>Kontrollera verkliga lagrade filbytes och avvikelser</small></span><ArrowRight size={18}/></button>
  <button className="nh-settings-action" type="button" onClick={onOpenSync}><MaterialIcon tone="blue" size={38}><RefreshCw size={23}/></MaterialIcon><span><strong>Synkronisering & administration</strong><small>Lokal spegel, överföring, avvikelser och avancerade val</small></span><ArrowRight size={18}/></button></div>
 </section>;
}
