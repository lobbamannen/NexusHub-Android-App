import {lockPageScroll} from '@/lib/page-scroll-lock.mjs';
import Lightbulb from '@/components/ideas/IdeaBulb';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Trash2, Plus, RefreshCw, ChevronRight, ArrowLeft, BrainCircuit, X, Save, Loader2, CloudCheck, CloudUpload, FilePenLine, Undo2, AlertTriangle } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import { useBackHandler } from '@/components/NativeBackBridge';
import { IDEA_STATUSES } from '@/lib/ideas.mjs';
import type { IdeasController, IdeaStatus } from './use-ideas';
import './ideas.css';
import IdeaAttachments, {type AttachmentActions,type AttachmentState} from '@/components/personal/IdeaAttachments';
import {ideaDay} from '@/lib/idea-numbers.mjs';
import IdeaPlans from './IdeaPlans';
import IdeaIntelligence, {type IdeaIntelligenceSummary} from './IdeaIntelligence';
import IdeasArchive from './IdeasArchive';
import {inboxIdeas} from '@/lib/personal-capture.mjs';
import { useLibraryState } from '@/lib/library-state';
const date = (value: string) => new Date(value).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' });
export function ideaSyncLabel(ideas: IdeasController, id: string) {
    const pending = ideas.pending[id];
    return pending ? pending.status === 'conflict' ? 'Konflikt – din text finns kvar' : 'Väntar på synk till GitHub' : ideas.drafts[id] ? 'Utkast lokalt' : ideas.stale && !ideas.confirmedIds.includes(id) ? 'Tidigare GitHub-kopia' : 'Sparad i GitHub';
}
export default function IdeasInbox({ ideas, onOpenPlan }: { ideas: IdeasController; onOpenPlan: (path:string)=>void }) {
    const [section,setSection]=useLibraryState<'inbox'|'plans'|'archive'|'intelligence'>('ideas:section','inbox');
    const [intelligence,setIntelligence]=useState<IdeaIntelligenceSummary>({counts:{},indexed:false,running:false,error:''});
    const onSummaryChange=useCallback((summary:IdeaIntelligenceSummary)=>setIntelligence(summary),[]);
    const shown = inboxIdeas(ideas.items,ideas.pending,ideas.drafts) as typeof ideas.items;
    const totalMatches=Object.values(intelligence.counts).reduce((sum,count)=>sum+count,0);
    const matchedIdeas=Object.keys(intelligence.counts).length;
    const onIntelligencePage=section==='intelligence';
    useBackHandler(55,()=>{
        if(!onIntelligencePage)return false;
        setSection('inbox');
        return true;
    });
    return <section className="nh-ideas nh-module-dashboard" aria-labelledby="ideas-title">
        {onIntelligencePage ?
          <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="violet" size={48}><BrainCircuit size={29}/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · IDÉINKORG</span><h1 id="ideas-title">Intelligenta samband</h1><p>Upptäck forskning som kan höra till dina idéer.</p></div></div></header>
          : <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="orange" size={48}><Lightbulb size={29}/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · DINA TANKAR</span><h1 id="ideas-title">Idéinkorg</h1><p>Fånga tanken nu. Utveckla den när du vill.</p></div></div></header>}
        {!onIntelligencePage && <div className="nh-idea-sections"><div className="nh-idea-filters" role="group" aria-label="Idéer och planer"><button type="button" aria-pressed={section==='inbox'} onClick={()=>setSection('inbox')}>Idéinkorg</button><button type="button" aria-pressed={section==='plans'} onClick={()=>setSection('plans')}>Färdiga planer</button></div><button className="text-button nh-idea-archive-toggle" type="button" aria-pressed={section==='archive'} onClick={()=>setSection(section==='archive'?'inbox':'archive')}><Archive size={16}/>Arkiv</button></div>}
        {section==='archive' ? <IdeasArchive ideas={ideas}/> : section==='plans' ? <IdeaPlans onOpen={onOpenPlan}/> : onIntelligencePage ?
          <button className="secondary nh-idea-intelligence-back" type="button" onClick={()=>setSection('inbox')}><ArrowLeft size={18}/> Tillbaka till idéinkorgen</button>
        : <>
        <div className="nh-ideas-actions"><button className="primary" disabled={!ideas.ready || ideas.busy} onClick={ideas.create}><Plus size={18}/>Ny idé</button><button className="secondary" disabled={ideas.loading || ideas.busy} onClick={() => void ideas.reload()}><RefreshCw size={17} className={ideas.loading ? 'spin' : ''}/>Uppdatera</button></div>
        {ideas.error && <div className="error-banner" role="alert">{ideas.error}</div>}
        {ideas.stale && <p className="nh-ideas-note"><AlertTriangle size={16}/>GitHub kunde inte uppdateras. Visar tillgängliga kopior och dina lokala utkast.</p>}
        <button className="nh-idea-intelligence-entry" type="button" onClick={()=>setSection('intelligence')} aria-label="Öppna Intelligenta samband">
          <span className="nh-idea-intelligence-entry-icon"><BrainCircuit size={22}/></span>
          <span className="nh-idea-intelligence-entry-text"><strong>Intelligenta samband</strong><small>{intelligence.error?'Sambanden behöver kontrolleras':intelligence.running?'Kontrollerar dokument och idéer…':intelligence.indexed?`${totalMatches} föreslagna matchningar för ${matchedIdeas} idéer`:'Söker relevanta forskningsunderlag…'}</small></span>
          {intelligence.indexed && totalMatches>0 && <span className="nh-idea-intelligence-total" aria-hidden="true">{totalMatches}</span>}
          <ChevronRight size={19} className="nh-idea-intelligence-chevron"/>
        </button>
        <div className="nh-ideas-list">{shown.map(({ idea }) => <button className="nh-idea-card" key={idea.id} onClick={() => ideas.open(idea.id)}>
            <span className="nh-idea-card-top"><span className={'nh-idea-status ' + idea.status}>{IDEA_STATUSES[idea.status]}</span><span className="nh-ideas-note">{ideas.numbering.entries.find(entry=>entry.id===idea.id)?.number ? 'Idé '+ideas.numbering.entries.find(entry=>entry.id===idea.id)?.number : 'Nummer tilldelas vid sparning'}</span><time dateTime={idea.updatedAt}>{date(idea.updatedAt)}</time></span>
            <span className="nh-idea-preview">{idea.text.trim() || 'Din nya tanke…'}</span>
            {!!intelligence.counts[idea.id] && <span className="nh-idea-match-count"><BrainCircuit size={14}/>{intelligence.counts[idea.id]} föreslagna {intelligence.counts[idea.id]===1?'matchning':'matchningar'}</span>}
            <span className={'nh-idea-sync' + (ideas.pending[idea.id] || ideas.drafts[idea.id] ? ' local' : '')}>{ideas.pending[idea.id] ? <CloudUpload size={15}/> : ideas.drafts[idea.id] ? <FilePenLine size={15}/> : <CloudCheck size={15}/>} {ideaSyncLabel(ideas, idea.id)}<ChevronRight size={17}/></span>
        </button>)}</div>
        {!shown.length && <div className="hub-empty"><Lightbulb size={35}/><strong>{ideas.loading ? 'Hämtar idéer…' : 'Här börjar nästa idé'}</strong><p>{'En mening räcker. Du kan alltid fortsätta senare.'}</p>{<button className="secondary" disabled={!ideas.ready} onClick={ideas.create}>Skriv en idé <Plus size={16}/></button>}</div>}
    </>}
    {(section==='inbox'||onIntelligencePage) && <div className="nh-idea-intelligence-subpage" hidden={!onIntelligencePage}>
      <IdeaIntelligence ideas={shown.map(({idea})=>({id:idea.id,text:idea.text}))} onSummaryChange={onSummaryChange}/>
    </div>}
    {!onIntelligencePage && <details className="panel settings-panel"><summary>Idéhistorik per dag</summary>{Object.entries(ideas.numbering.entries.reduce<Record<string,number>>((counts,entry)=>{const day=ideaDay(entry.createdAt);counts[day]=(counts[day]||0)+1;return counts;},{})).sort(([a],[b])=>b.localeCompare(a)).map(([day,count])=><p key={day}>{day} · {count} idéer</p>)}</details>}
    </section>;
}
export function IdeaEditor({ ideas }: { ideas: IdeasController }) {
    const draft = ideas.current, textRef = useRef<HTMLTextAreaElement>(null), closeRef = useRef(ideas.close);
    const attachmentsRef=useRef<AttachmentActions>(null),savingRef=useRef(false);
    const [attachments,setAttachments]=useState<AttachmentState>({count:0,busy:false});
    useEffect(()=>setAttachments({count:0,busy:false}),[ideas.selected]);
    closeRef.current = ()=>{if(!attachments.busy&&!savingRef.current)ideas.close();};
    useBackHandler(160, () => { if (!ideas.selected) return false; closeRef.current(); return true; });
    useEffect(() => {
        if (!ideas.selected) return;
        const previous = document.activeElement as HTMLElement | null, releaseScroll = lockPageScroll();
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
        return () => { releaseScroll(); document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
    }, [ideas.selected]);
    if (!draft) return null;
    const { idea } = draft, local = ideas.drafts[idea.id], pending = ideas.pending[idea.id];
    const working=ideas.busy||attachments.busy;
    const readonly = working || !!pending;
    const save=async()=>{
        if(savingRef.current||working)return;
        savingRef.current=true;
        try{if(local&&!await ideas.save(idea.id))return;if(attachments.count)await attachmentsRef.current?.save();}
        finally{savingRef.current=false;}
    };
    return <div className="modal-backdrop nh-idea-backdrop" onClick={() => closeRef.current()}><form className="nh-idea-editor" role="dialog" aria-modal="true" aria-labelledby="idea-editor-title" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="modal-heading"><h2 id="idea-editor-title"><Lightbulb size={23}/>{ideas.numbering.entries.find(entry=>entry.id===idea.id)?.number ? 'Idé '+ideas.numbering.entries.find(entry=>entry.id===idea.id)?.number : draft.sha ? 'Din idé' : 'Ny idé'}</h2><button type="button" className="icon-button" aria-label="Stäng idén och behåll utkast" disabled={working} onClick={()=>closeRef.current()}><X/></button></div>
        <div className="nh-idea-editor-body"><label className="field" htmlFor="idea-text">Vad har du på gång?</label><textarea ref={textRef} id="idea-text" value={idea.text} maxLength={50000} readOnly={readonly} placeholder="Skriv din tanke här…" onChange={e => ideas.edit(idea.id, { text: e.target.value })}/>
            <label className="field">Status<select aria-label="Idéstatus" value={idea.status} disabled={readonly} onChange={e => ideas.edit(idea.id, { status: e.target.value as IdeaStatus })}>{Object.entries(IDEA_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <p className={'nh-idea-sync' + (local || pending ? ' local' : '')} role="status">{ideas.busy ? <Loader2 className="spin" size={16}/> : pending ? <CloudUpload size={16}/> : local ? <FilePenLine size={16}/> : <CloudCheck size={16}/>} {ideas.busy ? 'Arbetar…' : ideaSyncLabel(ideas, idea.id)}</p>
            {local && !pending && <small className="nh-ideas-note">Stäng när du vill – utkastet behålls på telefonen. Spara skickar det till GitHub.</small>}
            {(pending?.error || local?.error) && <p className="error-banner" role="alert">{pending?.error || local?.error}</p>}
            {ideas.error && !ideas.confirmedIds.includes(idea.id) && <p className="error-banner" role="alert">{ideas.error}</p>}
            {pending && pending.status !== 'conflict' && <p className="nh-ideas-note">Texten är låst medan sparförsöket väntar. Välj Försök igen för att skicka samma text, eller Fortsätt skriva för att ersätta sparförsöket med ett nytt utkast. Ingen automatisk synk körs.</p>}
            {pending && pending.status !== 'conflict' && <button type="button" className="secondary" disabled={working} onClick={() => void ideas.continueEditing(idea.id)}>Fortsätt skriva</button>}
            {pending?.status === 'conflict'  && <button className="secondary" type="button" disabled={working} onClick={() => void ideas.fetchRemote(idea.id)}>Lös konflikten – jämför versionerna</button>}
            {pending?.status==='conflict'&&!ideas.remote&&<p className="nh-ideas-note">GitHub har en annan version. Tryck på Lös konflikten för att jämföra och välja. Din lokala text finns kvar.</p>}
            {ideas.remote && <section className="nh-idea-conflict" aria-label="Lös synkkonflikt"><h3>Två versioner av samma idé</h3><p>Båda versionerna säkerhetskopieras på telefonen innan ditt val används. Ingen sparning till GitHub sker automatiskt.</p><h4>Din lokala text</h4><p className="nh-conflict-text">{idea.text}</p><small>Status: {IDEA_STATUSES[idea.status]}</small><h4>Nuvarande GitHub-text</h4><p className="nh-conflict-text">{ideas.remote.idea.text}</p><small>Status: {IDEA_STATUSES[ideas.remote.idea.status]}</small><button type="button" className="primary" disabled={working} onClick={()=>void ideas.resolveConflict('merge')}>Sammanför båda till ett utkast</button><small>Din lokala status behålls. Läs och justera texten, tryck sedan Spara.</small><button type="button" className="secondary" disabled={working} onClick={()=>void ideas.resolveConflict('local')}>Behåll min text som utkast</button><button type="button" className="secondary" disabled={working} onClick={()=>void ideas.resolveConflict('github')}>Använd GitHub-versionen</button></section>}
            {!!ideas.backups.length&&<details className="nh-idea-conflict"><summary>Säkerhetskopior av versioner ({ideas.backups.length})</summary><small>Sparas på den här telefonen och finns kvar vid vanliga appuppdateringar. Återställning skapar ett utkast som du själv sparar.</small>{ideas.backups.map(backup=><details key={backup.id}><summary>{date(backup.at)}</summary>{(['local','remote'] as const).map(side=><section key={side}><h4>{side==='local'?'Lokal version':'GitHub-version'}</h4><p className="nh-conflict-text">{backup[side].idea.text}</p><small>Status: {IDEA_STATUSES[backup[side].idea.status]}</small><button className="secondary" type="button" disabled={working||!!pending} onClick={()=>void ideas.restoreVersion(backup,side)}>Återställ {side==='local'?'lokal text':'GitHub-text'} som utkast</button></section>)}</details>)}</details>}
            {draft.sha && <button type="button" className="secondary nh-idea-delete" disabled={working || !!pending} onClick={() => { if (confirm('Radera idén från GitHub och telefonen? Eventuellt lokalt utkast kastas också. Idén försvinner ur NexusHub; GitHubs versionshistorik finns kvar.')) void ideas.remove(idea.id); }}><Trash2 size={17}/>Radera idé</button>}
            <small className="nh-ideas-note">Skapad {date(idea.createdAt)}</small>
        </div>
        <IdeaAttachments key={idea.id} ref={attachmentsRef} id={idea.id} saved={!!draft.sha} busy={ideas.busy} onStateChange={setAttachments}/>
        <div className="nh-idea-editor-actions">{local ? <button type="button" className="secondary" disabled={working} onClick={() => { if (confirm('Kasta det lokala utkastet och dess väntande sparförsök? En eventuell GitHub-version finns kvar.')) void ideas.discard(idea.id); }}><Undo2 size={17}/>Ångra utkast</button> : <button type="button" className="secondary" onClick={()=>closeRef.current()}>Stäng</button>}<button className="primary" disabled={working || !local && !attachments.count || !idea.text.trim() || !!pending && pending.status !== 'pending'}>{working ? <Loader2 className="spin" size={17}/> : <Save size={17}/>} {pending ? 'Försök igen' : 'Spara'}</button></div>
    </form></div>;
}
