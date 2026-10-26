'use client';
import {cancelDraftWrites} from '@/platform/draft-writes';
import MaterialIcon from '@/components/MaterialIcon';
import { useBackHandler } from '@/components/NativeBackBridge';
import { useLibraryState } from '@/lib/library-state';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { BookOpen, Eye, House, Globe2, Scale, Fingerprint, ScrollText, Search, ChevronLeft, ChevronRight, Star, Bookmark, BookmarkCheck, CheckCircle2, ExternalLink, Download, RefreshCw, Shuffle, AlertTriangle, Loader2, Minus, Plus, Layers } from 'lucide-react';
import { Markdown } from './nexus';
import { inline } from '@/lib/inline.mjs';
import { restoreListScroll } from '@/lib/client-navigation';
import { useStoryStatus } from './use-story-status';
import { storyList, storyExcerpt, storyReadingBody } from '@/lib/stories.mjs';
import { storyCategoryOverview } from '@/lib/module-dashboard.mjs';
import './stories.css';
import StoryOverview from '@/components/dashboard/StoryOverview';
import RepositoryPoster, { usePosterRevision } from '@/components/repository-poster';
import DiscoveryToolbar from '@/components/dashboard/DiscoveryToolbar';
import StoryRegister from '@/components/stories/StoryRegister';
import StoryEditor from '@/components/stories/StoryEditor';
import { StoryRating } from '@/components/stories/StoryRating';
import { useStoryRegister, StoryChanges } from './use-story-register';
import { withStoryMetadata } from '@/lib/story-register.mjs';
import { LibraryBig, MessageSquare, Heart } from 'lucide-react';
import './media-register.css';
import './media-details.css';
type Story = {
    review: string;
    favorite: boolean;
    path: string;
    title: string;
    category: string;
    ratingLabel: string;
    numericRating: number | null;
    docx: string | null;
    markdown: string | null;
    sha: string | null;
    formats: {
        path: string;
        sha: string;
        format: string;
        size?: number;
    }[];
    rawName: string;
};
type StoryCheck = {
    state: string;
    path: string;
    checkedAt?: string;
    verifiedAt?: string;
    githubSha?: string | null;
    mirrorSha?: string | null;
    error?: string;
};
type Props = {
    documents: any[];
    onNavigate: (view: string) => void;
    mirrorChecks: Record<string, StoryCheck>;
    onInspect: (path: string, title?: string) => void;
    onRefresh: () => void;
    loading?: boolean;
    initialCategory?: string;
    initialPath?: string;
    onDirtyChange?: (dirty: boolean) => void;
    initialRegister?: boolean;
    onExitRead?: () => void;
    onOpenRegister?: () => void;
    onRegisterBack?: () => void;
};
const categoryClass = (name: string) => name === 'Hemsökta hus' ? 'haunted' : name === 'True crime' || name === 'Brott' ? 'crime' : name === 'Internetmysterier & nätfenomen' ? 'internet' : 'historical';
function CoverIcon({ category, size = 40 }: {
    category: string;
    size?: number;
}) { const Icon = category === 'Hemsökta hus' ? House : category === 'True crime' ? Scale : category === 'Brott' ? Fingerprint : category === 'Internetmysterier & nätfenomen' ? Globe2 : Eye; const tone = category === 'Hemsökta hus' ? 'blue' : category === 'True crime' || category === 'Brott' ? 'ruby' : category === 'Internetmysterier & nätfenomen' ? 'blue' : 'violet'; return <MaterialIcon tone={tone} size={size}><Icon size={size} strokeWidth={1.2}/></MaterialIcon>; }
// A new GitHub story does not need a local mirror before it can be read.
const hasWarning = (c?: StoryCheck) => !!c && !['same', 'missing'].includes(c.state);
const message = (error: any) => error?.message || 'Dokumentet kunde inte öppnas.';
function StoryCover({ story, big = false, revision }: {
    story: Story;
    big?: boolean;
    revision: string;
}) {
    return <div className={'story-cover ' + categoryClass(story.category) + (big ? ' big' : '')}>
  <RepositoryPoster kind="stories" posterKey={story.path} revision={revision} alt={'Omslag till ' + story.title}>
   <div className="story-cover-fallback">
    <div className="story-cover-top"><span>NEXUS HUB</span><span>BERÄTTELSER</span></div>
    <div className="story-cover-art" aria-hidden="true"><CoverIcon category={story.category} size={big ? 96 : 72}/><span className="story-cover-circle"/></div>
    <div className="story-cover-text"><small>{story.category}</small><strong>{story.title}</strong></div>
   </div>
  </RepositoryPoster>
 </div>;
}
export default function Stories({ documents, onNavigate, mirrorChecks, onInspect, onRefresh, loading = false, initialCategory = '', initialPath = '', onDirtyChange, initialRegister = false, onExitRead, onOpenRegister, onRegisterBack }: Props) {
    const storyReloadAllowed=useRef(true);
    const register = useStoryRegister(()=>storyReloadAllowed.current);
    const [pendingRead,setPendingRead]=useState<Record<string,boolean>>({}),[batchSaving,setBatchSaving]=useState(false),[saveMessage,setSaveMessage]=useState('');
    const returnScroll = useRef(0);
    const initialConsumed = useRef(false);
    const [registerView, setRegisterView] = useState(initialRegister), [pending, setPending] = useState<Record<string, StoryChanges>>({}), [editing, setEditing] = useState<{
        path: string;
        full: boolean;
    } | null>(null), [editorDirty, setEditorDirty] = useState(false);
    const base = useMemo(() => storyList(documents).map((s: any) => withStoryMetadata(s, register.data?.register.entries[s.path])) as Story[], [documents, register.data]);
    const all = useMemo(() => base.map(s => withStoryMetadata(s, pending[s.path])) as Story[], [base, pending]);
    const pendingCount = new Set([...Object.keys(pending),...Object.keys(pendingRead)]).size, dirty = pendingCount > 0 || editorDirty;
    useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
    useEffect(() => { if (!dirty)
        return; const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);
    const setChanges = (path: string, changes: StoryChanges) => {
        const original = base.find(s => s.path === path);
        if (!original)
            return;
        setPending(previous => {
            const patch = { ...previous[path], ...changes };
            for (const field of Object.keys(patch) as (keyof StoryChanges)[]) {
                const old = field === 'rating' ? original.numericRating : (original as any)[field];
                if (JSON.stringify(old) === JSON.stringify(patch[field]))
                    delete patch[field];
            }
            const next = { ...previous };
            if (Object.keys(patch).length)
                next[path] = patch;
            else
                delete next[path];
            return next;
        });
        register.clearMessage();
        setSaveMessage('');
    };
    const discard = () => { if (!pendingCount || window.confirm('Kasta alla osparade berättelseändringar?')) {
        cancelDraftWrites('stories'); setPending({});setPendingRead({});setSaveMessage('');
        return true;
    } return false; };
    const savePending = async () => {
        if (!pendingCount || batchSaving) return;
        setBatchSaving(true);setSaveMessage('');
        try {
            if(Object.keys(pending).length){
                if(!await register.save(pending))return;
                setPending({});
                if(Object.keys(pendingRead).length)setSaveMessage('Betyg och omdömen sparade. Läsmarkeringar återstår.');
                onRefresh();
            }
            if(Object.keys(pendingRead).length){
                if(!await saveReadEdits(pendingRead))return;
                setPendingRead({});
            }
            setSaveMessage('Sparat i GitHub.');
        } finally {setBatchSaving(false);}
    };
    const closeRegister = () => { if (register.saving || batchSaving)
        return; if (!discard())
        return; setRegisterView(false); if (initialRegister) {
        if (onRegisterBack)
            onRegisterBack();
        else
            onNavigate('berattelser');
    }
    else
        restoreListScroll(returnScroll.current); };
    const reloadRegister = async () => { if (!discard())
        return false; await register.reload(); onRefresh(); return true; };
    useBackHandler(110, () => { if (!registerView || selected)
        return false; closeRegister(); return true; });
    const editStory = editing ? all.find(s => s.path === editing.path) : null;
    const editor = editing && editStory ? <StoryEditor key={editing.path} story={editStory} full={editing.full} staged={registerView} saving={register.saving} error={register.error} onDirtyChange={setEditorDirty} onClose={() => { setEditing(null); setEditorDirty(false); }} onSubmit={async (patch) => {
            if (registerView) {
                setChanges(editing.path, patch);
                return true;
            }
            const ok = await register.save({ [editing.path]: patch });
            if (ok)
                onRefresh();
            return ok;
        }}/> : null;
    const [posterRevision, refreshPosters] = usePosterRevision();
    useEffect(() => { void refreshPosters(); }, []);
    const [query, setQuery] = useLibraryState('stories:query', ''), [category, setCategory] = useLibraryState('stories:category', 'alla'), [rating, setRating] = useLibraryState('stories:rating', 'alla'), [sort, setSort] = useLibraryState('stories:sort', 'titel');
    const [browsing, setBrowsing] = useLibraryState('stories:browsing', false), [jump, setJump] = useState(0);
    useEffect(() => { if (browsing && jump > 0)
        requestAnimationFrame(() => document.getElementById('nh-story-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }, [jump, browsing]);
    const [selected, setSelected] = useState<string | null>(null), [article, setArticle] = useState<any>(null), [reading, setReading] = useState(false), [error, setError] = useState('');
    const { savedPaths: saved, readPaths: finished, loading: marksLoading, busy: marksBusy, error: marksError, reload: reloadMarks, mark: markInGitHub, saveReadEdits } = useStoryStatus();
    const projectedRead=base.filter(s=>pendingRead[s.path]??finished.includes(s.path)).map(s=>s.path);
    const toggleReadDraft=(path:string)=>{
        setPendingRead(previous=>{const next={...previous},value=!(previous[path]??finished.includes(path));if(value===finished.includes(path))delete next[path];else next[path]=value;return next;});
        setSaveMessage('');register.clearMessage();
    };
    storyReloadAllowed.current=!dirty&&!register.saving&&!batchSaving;
    useEffect(()=>{const updated=()=>{if(storyReloadAllowed.current){void register.reload();void reloadMarks();}};window.addEventListener('nexus-github-changed',updated);return()=>window.removeEventListener('nexus-github-changed',updated);},[register.reload,reloadMarks]);
    const registerPending={...pending};
    for(const path of Object.keys(pendingRead))registerPending[path]={...registerPending[path]};
    const [font, setFont] = useState(17);
    useEffect(() => {
        if (initialConsumed.current || !initialPath?.startsWith('Berattelser/') || !initialPath.endsWith('.md') || !all.length || register.loading) return;
        const target = all.find(s => s.path === initialPath) || all.find(s => {
            const entry = register.data?.register.entries[s.path];
            return Array.isArray(entry?.previousPaths) && entry.previousPaths.includes(initialPath);
        });
        if (!target) return;
        initialConsumed.current = true;
        setSelected(target.path);
        setArticle(null);
        setReading(true);
    }, [initialPath, all, register.loading, register.data]);
    const summary = useMemo(() => storyCategoryOverview(all), [all]);
    const categories = summary.categories, counts = summary.counts;
    const chooseCategory = (next: string) => { setCategory(next); setQuery(''); setRating('alla'); setBrowsing(true); setJump(n => n + 1); };
    const showAll = () => { setCategory('alla'); setQuery(''); setRating('alla'); setSort('titel'); setBrowsing(true); setJump(n => n + 1); };
    const closeBrowse = () => { setCategory('alla'); setQuery(''); setRating('alla'); setSort('titel'); setBrowsing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const showing = browsing || !!query.trim();
    const [showIssues, setShowIssues] = useState(false);
    const issues = all.filter(x => hasWarning(mirrorChecks[x.path]));
    useEffect(() => { if (initialCategory && categories.includes(initialCategory)) {
        setCategory(initialCategory);
        setBrowsing(true);
    } }, [initialCategory, categories.join('|')]);
    const visible = useMemo(() => all.filter(x => (category === 'alla' || x.category === category) && (rating === 'alla' || (rating === 'betygsatt' ? x.numericRating !== null : rating === 'obetygsatt' ? x.numericRating === null : rating === 'sparade' ? saved.includes(x.path) : finished.includes(x.path))) && [x.title, x.rawName, x.category].join(' ').toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv'))).sort((a, b) => sort === 'betyg' ? (b.numericRating ?? -1) - (a.numericRating ?? -1) || a.title.localeCompare(b.title, 'sv') : sort === 'kategori' ? a.category.localeCompare(b.category, 'sv') || a.title.localeCompare(b.title, 'sv') : a.title.localeCompare(b.title, 'sv')), [all, query, category, rating, sort, finished, saved]);
    const story = all.find(s => s.path === selected) || null;
    const open = (path: string) => { returnScroll.current = window.scrollY; setSelected(path); setArticle(null); setReading(true); setError(''); window.scrollTo(0, 0); };
    const back = () => { if (location.hash.startsWith('#heading-'))
        window.history.replaceState(null, '', '#berattelser'); setSelected(null); setArticle(null); setError(''); if (onExitRead) {
        onExitRead();
        return;
    } restoreListScroll(returnScroll.current); };
    useBackHandler(65, () => { if (!showIssues)
        return false; setShowIssues(false); return true; });
    useBackHandler(100, () => { if (!selected)
        return false; back(); return true; });
    useBackHandler(60, () => { if (!showing)
        return false; closeBrowse(); return true; });
    useEffect(() => {
        if (!selected)
            return;
        let active = true;
        setReading(true);
        setArticle(null);
        setError('');
        fetch('/api/portal/document?repo=databas&path=' + encodeURIComponent(selected), { cache: 'no-store' })
            .then(async (r) => { const d: any = await r.json(); if (!r.ok)
            throw Error(d.error || 'GitHub-dokumentet kunde inte läsas.'); return d; })
            .then(d => { if (active)
            setArticle(d); })
            .catch(e => { if (active)
            setError(message(e)); })
            .finally(() => { if (active)
            setReading(false); });
        return () => { active = false; };
    }, [selected]);
    const mark = (path: string, kind: 'saved' | 'finished') => { if(registerView&&kind==='finished'){toggleReadDraft(path);return;} void markInGitHub(path, kind === 'saved' ? 'saved' : 'read'); };
    const surprise = () => { if (all.length)
        open(all[Math.floor(Math.random() * all.length)].path); };
    const readingBody = useMemo(() => storyReadingBody(article?.body || '', story || {}), [article, story?.path, story?.title]);
    const headings = useMemo(() => { const body = readingBody; return body.split('\n').map((line: string, index: number) => ({ line, index, match: line.match(/^#{1,3}\s+(.+)/) })).filter((x: any) => x.match).map((x: any) => ({ id: 'heading-' + x.index, text: x.match[1].replace(/\*\*/g, '') })).slice(0, 70); }, [readingBody]);
    const sourceUrl = story ? 'https://github.com/lobbamannen/Databas/blob/' + (article?.commit || 'main') + '/' + story.path.split('/').map(encodeURIComponent).join('/') : '';
    const docx = story?.formats.find(f => f.path.endsWith('.docx'));
    const download = docx && article?.commit ? '/api/portal/original?repo=databas&path=' + encodeURIComponent(docx.path) + '&ref=' + article.commit + '&blob=' + encodeURIComponent(docx.sha) : null;
    const statusBanner = (<div className={'stories-github-status ' + (marksError ? 'error' : '')} role="status">{marksError ? <><AlertTriangle size={17}/><span>{marksError} Markeringen bekräftas först när GitHub har sparat den. Eventuella äldre telefonmarkeringar behålls tills migrationen lyckas.</span><button className="stories-text-button" onClick={() => void reloadMarks()}>Försök igen</button></> : marksLoading ? <><Loader2 size={16} className="spin"/>Hämtar Sparad och Läst från GitHub…</> : marksBusy ? <><Loader2 size={16} className="spin"/>Sparar markering i GitHub…</> : <><CheckCircle2 size={16}/>Sparad och Läst hämtas från GitHub <button className="stories-text-button" onClick={() => void reloadMarks()}><RefreshCw size={14}/>Uppdatera</button></>}</div>);
    return <div className="stories-app">
  {registerView && <div hidden={!!story}><StoryRegister stories={all} pending={registerPending} revision={posterRevision} loading={register.loading || !register.data} saving={register.saving || batchSaving} error={register.error} message={saveMessage} readPaths={projectedRead} readLoading={marksLoading} readBusy={marksBusy} readError={marksError} onToggleRead={toggleReadDraft} onRetryRead={() => void reloadMarks()} onChange={setChanges} onEdit={path => setEditing({ path, full: true })} onRead={path => open(path)} onBack={closeRegister} onSave={() => void savePending()} onDiscard={discard} onRefresh={async () => { if(await reloadRegister()!==false)void reloadMarks(); }}/></div>}{story ? <>{statusBanner}<div className="stories-reader-top reader-toolbar"><button className="stories-text-button text-button" onClick={back}><ChevronLeft size={18}/>{registerView ? 'Till registret' : 'Till berättelserna'}</button><button className="stories-text-button" disabled={marksLoading || !!marksBusy || !!marksError} onClick={() => mark(story.path, 'saved')}>{saved.includes(story.path) ? <BookmarkCheck size={18}/> : <Bookmark size={18}/>} {saved.includes(story.path) ? 'Sparad i GitHub' : 'Spara i GitHub'}</button></div>
   <header className="stories-reader-header"><StoryCover story={story} big revision={posterRevision}/><div className="stories-reader-summary"><span className="stories-kicker">{story.category}</span><h1>{story.title}</h1><div className="stories-badges"><StoryRating rating={story.numericRating} label={story.ratingLabel}/>{story.favorite && <Heart className="story-favorite-mark" size={17} fill="currentColor" aria-label="Favorit"/>}{(registerView ? projectedRead : finished).includes(story.path) && <span className="stories-read-tag"><CheckCircle2 size={16}/>Läst</span>}</div><p>{inline(article?.body ? storyExcerpt(readingBody, 240) || 'Originaltexten visas oförkortad med källhänvisningar.' : 'Originaltexten visas oförkortad med källhänvisningar.')}</p><div className="stories-reader-actions"><button type="button" className="secondary" disabled={register.loading || !register.data} onClick={() => setEditing({ path: story.path, full: false })}><MessageSquare size={16}/>Omdöme</button>{download && <a href={download} className="secondary"><Download size={17}/>Hämta DOCX</a>}<a href={sourceUrl} className="secondary" target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/>GitHub-original</a></div></div></header>
   {story.review && <section className="story-personal-review"><h2>Ditt omdöme</h2><p>{story.review}</p></section>}
   {hasWarning(mirrorChecks[story.path]) && <button className="stories-warning" onClick={() => onInspect(story.path, story.title)}><AlertTriangle size={17}/>Visa avvikelse i spegeln<ChevronRight size={18}/></button>}
   {error && <div className="stories-error" role="alert"><AlertTriangle size={18}/>{error}<button className="stories-text-button" onClick={() => open(story.path)}>Försök igen</button></div>}
   {reading ? <div className="stories-loading"><Loader2 className="spin"/>Kontrollerar GitHub och öppnar berättelsen…</div> : article?.body ? <div className="stories-reader-layout"><details className="stories-contents"><summary>Innehåll</summary><nav aria-label="Berättelsens innehåll">{headings.map((h: {
            id: string;
            text: string;
        }) => <a key={h.id} href={'#' + h.id}>{h.text}</a>)}</nav><p>Rubriker hämtade ur originalberättelsen.</p></details><article className="stories-reader-article"><div className="stories-reading-tools"><span><BookOpen size={18}/> Berättelse i fulltext</span><div><button aria-label="Mindre text" disabled={font <= 15} onClick={() => setFont(n => Math.max(15, n - 1))}><Minus size={17}/></button><span>{font}px</span><button aria-label="Större text" disabled={font >= 24} onClick={() => setFont(n => Math.min(24, n + 1))}><Plus size={17}/></button></div></div><div className="prose stories-prose" style={{ fontSize: font }}><Markdown text={readingBody}/></div><div className="stories-reading-end"><p>Du har nått slutet av berättelsen.</p><button className="secondary" disabled={marksLoading || !!marksBusy || !!marksError} onClick={() => mark(story.path, 'finished')}>{(registerView ? projectedRead : finished).includes(story.path) ? <CheckCircle2 size={17}/> : <BookOpen size={17}/>} {(registerView ? projectedRead : finished).includes(story.path) ? 'Markerad som läst – ångra' : 'Markera som läst'}</button><button type="button" className="secondary" disabled={register.loading || !register.data} onClick={() => setEditing({ path: story.path, full: false })}><MessageSquare size={16}/>Lämna omdöme</button><button className="stories-text-button" onClick={back}>{registerView ? 'Till registret' : 'Till biblioteket'} <ChevronRight size={16}/></button><small>{registerView?'Läsmarkeringen är ett utkast tills du väljer Spara ändringar i registret.':'Din läsmarkering sparas i GitHub.'}</small></div></article></div> : !reading && !error ? <div className="stories-loading">Det finns ingen läsbar Markdowntext för denna post. Använd originalfilen ovan.</div> : null}
   {article?.mirror && <div className="stories-source-note"><strong>{article.mirror.state === 'verified' ? 'GitHub-kontrollerat original' : 'Lokalt dokument med begränsad GitHub-verifiering'}</strong><span>{article.mirror.state === 'verified' ? 'Lokal kopia verifierad' : article.mirror.state === 'stale' ? 'Reservkopia – GitHub kunde inte nås' : article.mirror.state === 'archived' ? 'Arkiverad version' : 'Källa: ' + article.origin} · GitHub-commit {article.commit?.slice(0, 12) || 'okänd'}</span></div>}
  </> : !registerView ? <>
   <StoryOverview onSurprise={surprise} stories={all} categories={categories} counts={counts} finishedCount={finished.filter(x => all.some(s => s.path === x)).length} selectedCategory={category} loading={loading} onSelectCategory={chooseCategory} toolbar={<DiscoveryToolbar query={query} onQuery={value => { setQuery(value); if (value.trim())
                setBrowsing(true); }} placeholder="Sök bland berättelserna…" browsing={showing} onShowAll={showAll} onClose={closeBrowse} showAllLabel={'Visa alla ' + all.length + ' berättelser'} secondary={<>
    <button className="nh-register-shortcut story-register-link" type="button" onClick={() => { if (onOpenRegister) {
                    onOpenRegister();
                    return;
                } returnScroll.current = window.scrollY; setRegisterView(true); window.scrollTo(0, 0); }}><MaterialIcon tone="blue" size={34}><LibraryBig size={23}/></MaterialIcon><span className="nh-register-shortcut-copy"><strong>Register</strong><small>Alla berättelser · Betyg och omdömen</small></span><ChevronRight size={18}/></button>
    <span className="nh-discovery-small-note"><CheckCircle2 size={15}/>Sparad och Läst via GitHub</span>
    
    <button className="nh-tool-action" type="button" onClick={() => { onRefresh(); void refreshPosters(); }}><RefreshCw size={16}/>Uppdatera</button>
    <button className="nh-tool-action" type="button" disabled={marksLoading || !!marksBusy} onClick={() => void reloadMarks()} title="Uppdatera Sparad och Läst"><CheckCircle2 size={16}/>Lässtatus</button>
   </>}>
    {showing && <details className="nh-discovery-options"><summary>Sortera och filtrera berättelser</summary><div className="stories-filterbar nh-advanced-filters">
     <label>Betyg / läsning<select value={rating} onChange={e => setRating(e.target.value)}><option value="alla">Alla</option><option value="betygsatt">Har exakt betyg</option><option value="obetygsatt">Utan exakt betyg</option><option value="lästa">Markerade som lästa</option><option value="sparade">Sparade i GitHub</option></select></label>
     <label>Sortera<select value={sort} onChange={e => setSort(e.target.value)}><option value="titel">Titel A–Ö</option><option value="kategori">Kategori</option><option value="betyg">Högsta exakta betyg</option></select></label>
    </div></details>}
   </DiscoveryToolbar>}/>
   
   {(marksError || marksLoading || marksBusy) && statusBanner}
   {showing && <div className="nh-discovery-results" id="nh-story-results">
   <div className="stories-list-header"><h2>{visible.length} berättelser</h2><span>Från lobbamannen/Databas</span></div>
   {issues.length > 0 && <div className="stories-issues"><button className="stories-issues-toggle" onClick={() => setShowIssues(v => !v)}><AlertTriangle size={17}/>{showIssues ? 'Dölj' : 'Visa'} avvikelser ({issues.length})<ChevronRight size={16}/></button>{showIssues && <div className="stories-issues-list">{issues.map(s => <button key={s.path} onClick={() => onInspect(s.path, s.title)}><AlertTriangle size={15}/><span><strong>{s.title}</strong><small>{mirrorChecks[s.path]?.state === 'divergent' ? 'Lokal kontrollsumma kunde inte verifieras' : mirrorChecks[s.path]?.state === 'different' ? 'GitHub har en annan version' : mirrorChecks[s.path]?.state === 'missing' ? 'Saknar lokal kopia' : mirrorChecks[s.path]?.state === 'unknown' ? 'GitHub kunde inte verifieras' : 'Annat avvikande tillstånd'}</small></span><ChevronRight size={15}/></button>)}</div>}</div>}
   {loading && !documents.length ? <div className="stories-loading"><Loader2 className="spin"/>Läser GitHub-katalogen…</div> : <div className="stories-grid">{visible.map(s => <article className="stories-card" key={s.path} aria-label={s.title}>
    <StoryCover story={s} revision={posterRevision}/>
    <div className="stories-card-info"><span className="stories-category-label">{s.category}</span><h3>{s.title}</h3><div className="stories-card-meta"><StoryRating rating={s.numericRating} label={s.ratingLabel}/>{finished.includes(s.path) && <span className="stories-read-tag"><CheckCircle2 size={14}/>Läst</span>}{s.favorite && <Heart size={15} className="story-favorite-mark" fill="currentColor" aria-label="Favorit"/>}</div></div>
    <div className="stories-card-actions"><button className="primary" type="button" aria-label={'Läs ' + s.title} onClick={() => open(s.path)}><BookOpen size={15}/>Läs</button><button className="secondary" type="button" aria-label={'Omdöme om ' + s.title} disabled={register.loading || !register.data} onClick={() => setEditing({ path: s.path, full: false })}><MessageSquare size={15}/>Omdöme</button></div>
    <div className="stories-card-controls"><button type="button" disabled={marksLoading || !!marksBusy || !!marksError} title={saved.includes(s.path) ? 'Ta bort från sparade i GitHub' : 'Spara berättelse i GitHub'} aria-label={saved.includes(s.path) ? 'Ta bort ' + s.title + ' från sparade' : 'Spara ' + s.title} onClick={() => mark(s.path, 'saved')}>{saved.includes(s.path) ? <BookmarkCheck size={17}/> : <Bookmark size={17}/>}</button>{hasWarning(mirrorChecks[s.path]) && <button className="stories-card-warning" onClick={() => onInspect(s.path, s.title)}><AlertTriangle size={15}/>Visa avvikelse</button>}</div>
   </article>)}</div>}

   {!loading && visible.length === 0 && <p className="stories-empty">Inga berättelser matchar filtret. Välj en annan kategori eller sökning.</p>}
   <p className="stories-disclaimer">Berättelser, betyg och omdömen hämtas från GitHub. Äldre filnamnsbetyg används när registret saknar ett nytt betyg; ord och intervall omvandlas inte till påhittade siffror. Omslagsbilderna hämtas från GitHub och visar verkliga fotografier eller ursprungliga dokument/skärmbilder när bilder finns. Vid saknat omslag visas en kategoriikon.</p>
   </div>}
  </> : null}
  {!registerView && register.error && !editing && <p className="nh-register-alert" role="alert">{register.error}<button type="button" onClick={() => void register.reload()}>Försök igen</button></p>}
  {!registerView && register.message && !editing && <p className="nh-register-success" role="status">{register.message}</p>}
  {editor}
 </div>;
}
