import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Lightbulb, Plus, RefreshCw, ChevronRight, X, Save, Loader2, CloudCheck, CloudUpload, FilePenLine, Undo2, AlertTriangle } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import { useBackHandler } from '@/components/NativeBackBridge';
import { IDEA_STATUSES } from '@/lib/ideas.mjs';
import type { IdeasController, IdeaStatus } from './use-ideas';
import './ideas.css';
import IdeaPlans from './IdeaPlans';
import { useLibraryState } from '@/lib/library-state';
const date = (value: string) => new Date(value).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
export function ideaSyncLabel(ideas: IdeasController, id: string) {
    const pending = ideas.pending[id];
    return pending ? pending.status === 'conflict' ? 'Konflikt – din text finns kvar' : 'Väntar på synk till GitHub' : ideas.drafts[id] ? 'Utkast lokalt' : ideas.stale && !ideas.confirmedIds.includes(id) ? 'Tidigare GitHub-kopia' : 'Sparad i GitHub';
}
export default function IdeasInbox({ ideas, onOpenPlan }: { ideas: IdeasController; onOpenPlan: (path:string)=>void }) {
    const [section,setSection]=useLibraryState<'inbox'|'plans'>('ideas:section','inbox');
    const [filter, setFilter] = useState('all');
    const shown = ideas.items.filter(row => filter === 'all' || row.idea.status === filter);
    return <section className="nh-ideas nh-module-dashboard" aria-labelledby="ideas-title">
        <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="orange" size={48}><Lightbulb size={29}/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · DINA TANKAR</span><h1 id="ideas-title">Idéinkorg</h1><p>Fånga tanken nu. Utveckla den när du vill.</p></div></div></header>
        <div className="nh-idea-filters" role="group" aria-label="Idéer och planer"><button type="button" aria-pressed={section==='inbox'} onClick={()=>setSection('inbox')}>Idéinkorg</button><button type="button" aria-pressed={section==='plans'} onClick={()=>setSection('plans')}>Färdiga planer</button></div>
        {section==='plans' ? <IdeaPlans onOpen={onOpenPlan}/> : <>
        <div className="nh-ideas-actions"><button className="primary" disabled={!ideas.ready || ideas.busy} onClick={ideas.create}><Plus size={18}/>Ny idé</button><button className="secondary" disabled={ideas.loading || ideas.busy} onClick={() => void ideas.reload()}><RefreshCw size={17} className={ideas.loading ? 'spin' : ''}/>Uppdatera</button></div>
        {ideas.error && <div className="error-banner" role="alert">{ideas.error}</div>}
        {ideas.stale && <p className="nh-ideas-note"><AlertTriangle size={16}/>GitHub kunde inte uppdateras. Visar tillgängliga kopior och dina lokala utkast.</p>}
        <div className="nh-idea-filters" role="group" aria-label="Filtrera idéstatus">{[['all', 'Alla'], ...Object.entries(IDEA_STATUSES)].map(([status, label]) => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{label}<span>{ideas.items.filter(row => status === 'all' || row.idea.status === status).length}</span></button>)}</div>
        <div className="nh-ideas-list">{shown.map(({ idea }) => <button className="nh-idea-card" key={idea.id} onClick={() => ideas.open(idea.id)}>
            <span className="nh-idea-card-top"><span className={'nh-idea-status ' + idea.status}>{IDEA_STATUSES[idea.status]}</span><time dateTime={idea.updatedAt}>{date(idea.updatedAt)}</time></span>
            <span className="nh-idea-preview">{idea.text.trim() || 'Din nya tanke…'}</span>
            <span className={'nh-idea-sync' + (ideas.pending[idea.id] || ideas.drafts[idea.id] ? ' local' : '')}>{ideas.pending[idea.id] ? <CloudUpload size={15}/> : ideas.drafts[idea.id] ? <FilePenLine size={15}/> : <CloudCheck size={15}/>} {ideaSyncLabel(ideas, idea.id)}<ChevronRight size={17}/></span>
        </button>)}</div>
        {!shown.length && <div className="hub-empty"><Lightbulb size={35}/><strong>{ideas.loading ? 'Hämtar idéer…' : filter === 'all' ? 'Här börjar nästa idé' : 'Inga idéer med den statusen'}</strong><p>{filter === 'all' ? 'En mening räcker. Du kan alltid fortsätta senare.' : 'Idéerna finns kvar när du byter filter.'}</p>{filter === 'all' && <button className="secondary" disabled={!ideas.ready} onClick={ideas.create}>Skriv en idé <Plus size={16}/></button>}</div>}
    </>}
    </section>;
}
export function IdeaEditor({ ideas }: { ideas: IdeasController }) {
    const draft = ideas.current, textRef = useRef<HTMLTextAreaElement>(null), closeRef = useRef(ideas.close);
    closeRef.current = ideas.close;
    useBackHandler(160, () => { if (!ideas.selected) return false; ideas.close(); return true; });
    useEffect(() => {
        if (!ideas.selected) return;
        const previous = document.activeElement as HTMLElement | null, before = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        textRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
            if (event.key === 'Tab') {
                const buttons = Array.from(document.querySelectorAll<HTMLElement>('.nh-idea-editor button:not(:disabled), .nh-idea-editor textarea, .nh-idea-editor select')).filter(el => !el.hasAttribute('disabled'));
                const first = buttons[0], last = buttons.at(-1);
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = before; document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
    }, [ideas.selected]);
    if (!draft) return null;
    const { idea } = draft, local = ideas.drafts[idea.id], pending = ideas.pending[idea.id];
    const readonly = ideas.busy || !!pending;
    return <div className="modal-backdrop nh-idea-backdrop" onClick={() => ideas.close()}><form className="nh-idea-editor" role="dialog" aria-modal="true" aria-labelledby="idea-editor-title" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void ideas.save(idea.id); }}>
        <div className="modal-heading"><h2 id="idea-editor-title"><Lightbulb size={23}/>{draft.sha ? 'Din idé' : 'Ny idé'}</h2><button type="button" className="icon-button" aria-label="Stäng idén och behåll utkast" disabled={ideas.busy} onClick={ideas.close}><X/></button></div>
        <div className="nh-idea-editor-body"><label className="field" htmlFor="idea-text">Vad har du på gång?</label><textarea ref={textRef} id="idea-text" value={idea.text} maxLength={50000} readOnly={readonly} placeholder="Skriv din tanke här…" onChange={e => ideas.edit(idea.id, { text: e.target.value })}/>
            <label className="field">Status<select aria-label="Idéstatus" value={idea.status} disabled={readonly} onChange={e => ideas.edit(idea.id, { status: e.target.value as IdeaStatus })}>{Object.entries(IDEA_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <p className={'nh-idea-sync' + (local || pending ? ' local' : '')} role="status">{ideas.busy ? <Loader2 className="spin" size={16}/> : pending ? <CloudUpload size={16}/> : local ? <FilePenLine size={16}/> : <CloudCheck size={16}/>} {ideas.busy ? 'Arbetar…' : ideaSyncLabel(ideas, idea.id)}</p>
            {local && !pending && <small className="nh-ideas-note">Stäng när du vill – utkastet behålls på telefonen. Spara skickar det till GitHub.</small>}
            {(pending?.error || local?.error) && <p className="error-banner" role="alert">{pending?.error || local?.error}</p>}
            {ideas.error && !ideas.confirmedIds.includes(idea.id) && <p className="error-banner" role="alert">{ideas.error}</p>}
            {pending && <p className="nh-ideas-note">Texten är låst medan sparförsöket väntar. Välj Försök igen för att skicka samma text, eller Fortsätt skriva för att ersätta sparförsöket med ett nytt utkast. Ingen automatisk synk körs.</p>}
            {pending && pending.status !== 'conflict' && <button type="button" className="secondary" disabled={ideas.busy} onClick={() => void ideas.continueEditing(idea.id)}>Fortsätt skriva</button>}
            {pending?.status === 'conflict'  && <button className="secondary" type="button" disabled={ideas.busy} onClick={() => void ideas.fetchRemote(idea.id)}>Visa GitHub-versionen</button>}
            {ideas.remote && <section className="nh-idea-conflict"><h3>Nuvarande GitHub-version</h3><p>{ideas.remote.idea.text}</p><small>Status: {IDEA_STATUSES[ideas.remote.idea.status]}</small><button type="button" className="secondary" disabled={ideas.busy} onClick={() => { if (confirm('Använd GitHub-versionen och kasta det lokala utkastet? Kopiera först din text om du vill behålla den.')) void ideas.useRemote(); }}>Använd GitHub-versionen</button></section>}
            {draft.sha && <button type="button" className="secondary nh-idea-delete" disabled={ideas.busy || !!pending} onClick={() => { if (confirm('Radera idén från GitHub och telefonen? Eventuellt lokalt utkast kastas också. Idén försvinner ur NexusHub; GitHubs versionshistorik finns kvar.')) void ideas.remove(idea.id); }}><Trash2 size={17}/>Radera idé</button>}
            <small className="nh-ideas-note">Skapad {date(idea.createdAt)}</small>
        </div>
        <div className="nh-idea-editor-actions">{local ? <button type="button" className="secondary" disabled={ideas.busy} onClick={() => { if (confirm('Kasta det lokala utkastet och dess väntande sparförsök? En eventuell GitHub-version finns kvar.')) void ideas.discard(idea.id); }}><Undo2 size={17}/>Ångra utkast</button> : <button type="button" className="secondary" onClick={ideas.close}>Stäng</button>}<button className="primary" disabled={ideas.busy || !local || !idea.text.trim() || !!pending && pending.status !== 'pending'}>{ideas.busy ? <Loader2 className="spin" size={17}/> : <Save size={17}/>} {pending ? 'Försök igen' : 'Spara'}</button></div>
    </form></div>;
}
