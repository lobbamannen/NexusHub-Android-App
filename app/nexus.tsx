'use client';
import { useBackHandler } from '@/components/NativeBackBridge';
import React, { useState, useEffect, useRef } from 'react';
import { Home, Search, Plus, Inbox, Menu, X, ArrowLeft, ArrowRight, ChevronRight, Layers, Puzzle, Eye, Wrench, Network, Settings, FileText, Folder, Bookmark, Upload, Download, RefreshCw, Check, Trash2, Edit3, Link2, List, SlidersHorizontal, Clock, ShieldCheck, ExternalLink, BookOpen, ChevronDown, CheckCircle2, AlertCircle, Loader2, Copy, Archive, Database, Sun, Moon } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import { readNavigation } from '@/lib/domain.mjs';
import { inline } from '@/lib/inline.mjs';
type Entry = any;
const modules = [{ id: 'databas', name: 'Databas', subtitle: 'Metoder, dokument & forskning', icon: Layers, color: 'purple' }, { id: 'plugins', name: 'Plugins', subtitle: 'Dina assistenter & arbetsflöden', icon: Puzzle, color: 'blue' }, { id: 'mysterier', name: 'Mysterier', subtitle: 'Berättelser & outforskade spår', icon: Eye, color: 'orange' }, { id: 'verktyg', name: 'Verktyg', subtitle: 'Resurser, mallar & hjälpmedel', icon: Wrench, color: 'green' }];
const names: Record<string, string> = { hem: 'Hem', sok: 'Sök i hela hubben', inkorg: 'Inkorg', graf: 'Kunskapsgraf', installningar: 'Inställningar', favoriter: 'Sparade', papperskorg: 'Papperskorg', arkiv: 'Originalarkiv', github: 'GitHub live' };
async function api(path: string, options: RequestInit = {}): Promise<any> { const r = await fetch('/api/' + path, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers }, cache: 'no-store' }); const data: any = await r.json(); if (!r.ok)
    throw Error(data.error || 'Kunde inte hämta information.'); return data; }
function formatBytes(n: number) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
function date(s: string) { return new Date(s).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }); }
function saveBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
export function Markdown({ text }: {
    text: string;
}) { let code = false, buffer: string[] = []; const out: React.ReactNode[] = []; const lines = text.split('\n'); for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
        if (code) {
            out.push(<pre key={i}><code>{buffer.join('\n')}</code></pre>);
            buffer = [];
        }
        code = !code;
        continue;
    }
    if (code) {
        buffer.push(line);
        continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) {
        const Tag = ('h' + Math.min(h[1].length + 1, 6)) as React.ElementType;
        out.push(<Tag id={'heading-' + i} key={i}>{inline(h[2])}</Tag>);
    }
    else if (/^\s*[-*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line))
        out.push(<div className="md-list" key={i}>{inline(line)}</div>);
    else if (line.startsWith('|'))
        out.push(<div className="md-tableline" key={i}>{inline(line)}</div>);
    else if (line.trim() === '---')
        out.push(<hr key={i}/>);
    else if (line.trim())
        out.push(<p key={i}>{inline(line)}</p>);
} if (buffer.length)
    out.push(<pre key="last">{buffer.join('\n')}</pre>); return <>{out}</>; }
export default function Nexus() {
    const [view, setView] = useState('hem'), [menu, setMenu] = useState(false), [query, setQuery] = useState(''), [category, setCategory] = useState(''), [kind, setKind] = useState(''), [filter, setFilter] = useState(false), [items, setItems] = useState<Entry[]>([]), [total, setTotal] = useState(0), [offset, setOffset] = useState(0), [stats, setStats] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [toast, setToast] = useState(''), [selected, setSelected] = useState<Entry>(null), [editor, setEditor] = useState<any>(null), [busy, setBusy] = useState(false), [upload, setUpload] = useState<any>(null), [files, setFiles] = useState<File[]>([]), [progress, setProgress] = useState(''), [relations, setRelations] = useState<any[]>([]), [graphList, setGraphList] = useState(false), [graphFocus, setGraphFocus] = useState(''), [font, setFont] = useState(17), [history, setHistory] = useState<any[] | null>(null), [linkOpen, setLinkOpen] = useState(false), [linkQuery, setLinkQuery] = useState(''), [linkTargets, setLinkTargets] = useState<any[]>([]), [linkType, setLinkType] = useState('relaterar'), [archive, setArchive] = useState<any>(null);
    const [githubPath, setGithubPath] = useState(''), [githubData, setGithubData] = useState<any>(null), [githubLoading, setGithubLoading] = useState(false), [githubError, setGithubError] = useState(''), [githubRefresh, setGithubRefresh] = useState(0);
    useEffect(() => { if (view !== 'github')
        return; let cancelled = false; setGithubLoading(true); setGithubError(''); api('github/browse?path=' + encodeURIComponent(githubPath)).then(data => { if (!cancelled)
        setGithubData(data); }).catch((e: any) => { if (!cancelled)
        setGithubError(e.message); }).finally(() => { if (!cancelled)
        setGithubLoading(false); }); return () => { cancelled = true; }; }, [view, githubPath, githubRefresh]);
    const [recent, setRecent] = useState<Entry[]>([]);
    useEffect(() => { try {
        const saved = JSON.parse(localStorage.getItem('nexus-recent') || '[]');
        if (Array.isArray(saved))
            setRecent(saved.filter(e => e && typeof e.id === 'string' && typeof e.title === 'string').slice(0, 6));
    }
    catch { } }, []);
    const remember = (entry: Entry) => { setRecent(previous => { const next = [{ id: entry.id, title: entry.title, module: entry.module, kind: entry.kind, category: entry.category }, ...previous.filter(e => e.id !== entry.id)].slice(0, 6); try {
        localStorage.setItem('nexus-recent', JSON.stringify(next));
    }
    catch { } return next; }); };
    const reqId = useRef(0), restoreInput = useRef<HTMLInputElement>(null), fileInput = useRef<HTMLInputElement>(null), searchInput = useRef<HTMLInputElement>(null);
    const notify = (message: string) => { setToast(message); setTimeout(() => setToast(''), 5000); };
    const refreshStats = async () => { try {
        setStats(await api('stats'));
    }
    catch (e: any) {
        setError(e.message);
    } };
    const navigate = (next: string) => { setView(next); setSelected(null); setCategory(''); setKind(''); setOffset(0); setQuery(''); setMenu(false); setHistory(null); window.scrollTo(0, 0); location.hash = next; };
    useEffect(() => { const hash = location.hash.slice(1); if (names[hash] || modules.some(m => m.id === hash))
        setView(hash); refreshStats(); const pop = () => { const h = location.hash.slice(1); if (readNavigation(h) || !h) {
        setView(h || 'hem');
        setSelected(null);
    } }; window.addEventListener('hashchange', pop); return () => window.removeEventListener('hashchange', pop); }, []);
    const loadItems = async () => { const id = ++reqId.current; if (view === 'github') {
        setLoading(false);
        return;
    } setLoading(true); setError(''); try {
        const p = new URLSearchParams({ limit: view === 'hem' ? '6' : '30', offset: String(offset) });
        if (view === 'hem')
            p.set('home', '1');
        if (query)
            p.set('q', query);
        if (category)
            p.set('category', category);
        if (kind)
            p.set('kind', kind);
        if (modules.some(m => m.id === view))
            p.set('module', view);
        if (view === 'inkorg')
            p.set('state', 'inkorg');
        if (view === 'favoriter')
            p.set('favorite', '1');
        if (view === 'papperskorg')
            p.set('trash', '1');
        const data = await api('entries?' + p);
        if (id === reqId.current) {
            setItems(data.entries);
            setTotal(data.total);
        }
    }
    catch (e: any) {
        if (id === reqId.current)
            setError(e.message);
    }
    finally {
        if (id === reqId.current)
            setLoading(false);
    } };
    useEffect(() => { const t = setTimeout(() => loadItems(), query ? 250 : 0); return () => clearTimeout(t); }, [view, query, category, kind, offset]);
    useEffect(() => { if (view === 'graf')
        api('relations').then(setRelations).catch((e: any) => setError(e.message)); }, [view, stats]);
    useEffect(() => { if (view === 'sok')
        searchInput.current?.focus(); }, [view]);
    useEffect(() => { if (view === 'arkiv') {
        setLoading(true);
        api('files?q=' + encodeURIComponent(query) + '&offset=' + offset).then(setArchive).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
    } }, [view, query, offset]);
    useEffect(() => { if (!linkOpen)
        return; const t = setTimeout(() => api('entries?q=' + encodeURIComponent(linkQuery) + '&limit=12').then(x => setLinkTargets(x.entries.filter((e: any) => e.id !== selected?.id))), 250); return () => clearTimeout(t); }, [linkOpen, linkQuery, selected]);
    const open = async (id: string) => { setLoading(true); setError(''); try {
        const entry = await api('entries/' + id);
        setSelected(entry);
        remember(entry);
        setHistory(null);
        window.scrollTo(0, 0);
    }
    catch (e: any) {
        notify(e.message);
    }
    finally {
        setLoading(false);
    } };
    const mutate = async (data: any) => { if (!selected)
        return; try {
        const e = await api('entries/' + selected.id, { method: 'PATCH', body: JSON.stringify({ version: selected.version, ...data }) });
        setSelected(e);
        refreshStats();
        loadItems();
        notify('Sparat i Nexus Hub.');
    }
    catch (e: any) {
        notify(e.message);
    } };
    const saveEntry = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try {
        const value = { ...editor, tags: typeof editor.tags === 'string' ? editor.tags.split(',') : editor.tags };
        const saved = await api(editor.id ? 'entries/' + editor.id : 'entries', { method: editor.id ? 'PATCH' : 'POST', body: JSON.stringify(value) });
        setEditor(null);
        setSelected(saved);
        refreshStats();
        loadItems();
        notify('Posten är sparad. GitHub har inte ändrats.');
    }
    catch (e: any) {
        notify(e.message);
    }
    finally {
        setBusy(false);
    } };
    const uploadFiles = async (e: React.FormEvent) => { e.preventDefault(); if (!files.length)
        return; setBusy(true); let completed = 0, sent = 0; try {
        for (const f of files) {
            setProgress(`${completed + 1} av ${files.length}: ${f.name}`);
            const form = new FormData();
            form.set('file', f);
            form.set('title', files.length === 1 ? (upload.title || f.name) : f.name);
            form.set('category', upload.category || 'Osorterat');
            form.set('module', upload.module || 'databas');
            if (upload.entryId)
                form.set('entryId', upload.entryId);
            const result = await api('files', { method: 'POST', body: form });
            if (result.github?.state === 'sent')
                sent++;
            completed++;
        }
        setUpload(null);
        setFiles([]);
        refreshStats();
        loadItems();
        notify(`${completed} filer sparade i Nexus Hub. ${sent} skickade till GitHub.${sent < completed ? ' Övriga väntar: öppna posten och försök igen.' : ''}`);
    }
    catch (e: any) {
        notify(`${completed} filer sparade. ${e.message}`);
        setFiles(files.slice(completed));
    }
    finally {
        setBusy(false);
        setProgress('');
    } };
    const backup = async () => { setBusy(true); try {
        const data = await api('export');
        saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'nexus-metadata.json');
        notify('Lokala metadata exporterade. Originalfiler och spegelarkiv ingår inte.');
    }
    catch (e: any) {
        notify(e.message);
    }
    finally {
        setBusy(false);
    } };
    const restore = async (file: File) => { if (!confirm('Återställ saknade lokala metadata från JSON? Befintliga poster skrivs inte över.'))
        return; setBusy(true); try {
        const result = await api('restore', { method: 'POST', body: await file.text() });
        notify(`${result.inserted} rader tillagda. ${result.conflicts || 0} befintliga avvikelser lämnades oförändrade. Originalfiler ingår inte.`);
        refreshStats();
        loadItems();
    }
    catch (e: any) {
        notify(e.message);
    }
    finally {
        setBusy(false);
        setProgress('');
    } };
    useBackHandler(125, () => { if (!upload && !editor && !linkOpen && !menu)
        return false; if (!busy) {
        if (menu)
            setMenu(false);
        else if (linkOpen)
            setLinkOpen(false);
        else if (editor)
            setEditor(null);
        else
            setUpload(null);
    } return true; });
    useBackHandler(100, () => { if (!selected)
        return false; if (history)
        setHistory(null);
    else
        setSelected(null); return true; });
    useBackHandler(60, () => { if (!filter && !query && !category && !kind && !offset)
        return false; setFilter(false); setQuery(''); setCategory(''); setKind(''); setOffset(0); return true; });
    useBackHandler(30, () => { if (view === 'hem')
        return false; navigate('hem'); return true; });
    const mod = modules.find(m => m.id === (selected?.module || view)), Icon = mod?.icon || Database;
    const allCount = stats?.modules?.reduce((a: number, b: any) => a + b.n, 0) || 0;
    const card = (m: any, compact = false) => { const I = m.icon; return <button className={'module-card ' + m.color + (compact ? ' compact' : '')} key={m.id} onClick={() => navigate(m.id)}><span className={'module-icon ' + m.color}><MaterialIcon tone={m.id === 'plugins' ? 'pink' : m.id === 'verktyg' ? 'green' : 'blue'} size={38}><I size={24}/></MaterialIcon></span><span><strong>{m.name}</strong><small>{compact ? m.subtitle : (stats?.modules?.find((x: any) => x.module === m.id)?.n || 0) + ' poster'}</small></span><ChevronRight size={17}/></button>; };
    const row = (e: any) => <button key={e.id} className="entry-row" onClick={() => open(e.id)}><span className={'entry-icon ' + (modules.find(m => m.id === e.module)?.color || 'purple')}><MaterialIcon tone={e.module === 'mysterier' ? 'blue' : 'violet'} size={32}>{e.kind === 'Metod' ? <Layers size={21}/> : e.module === 'mysterier' ? <Eye size={21}/> : <FileText size={21}/>}</MaterialIcon></span><span className="entry-text"><strong>{e.title}</strong><small>{e.kind} <span>·</span> {e.category}</small>{view !== 'hem' && <p>{e.summary || e.excerpt?.replace(/[#*`]/g, '').slice(0, 155) || 'Öppna för innehåll och bilagor.'}</p>}</span>{e.favorite ? <Bookmark size={17} fill="currentColor" className="accent"/> : <ChevronRight size={17}/>}</button>;
    const heading = (title: string, subtitle: string, icon: React.ReactNode) => <div className="page-heading"><span className={'module-icon large ' + (mod?.color || 'purple')}><MaterialIcon tone={mod?.id === 'plugins' ? 'pink' : mod?.id === 'verktyg' ? 'green' : mod ? 'blue' : 'violet'} size={48}>{icon as React.ReactElement<any>}</MaterialIcon></span><div><p className="eyebrow">NEXUS HUB</p><h1>{title}</h1><p>{subtitle}</p></div></div>;
    const searchbox = <div className="searchbar"><Search size={19}/><input ref={searchInput} aria-label="Sök" value={query} placeholder={view === 'hem' ? 'Sök i hela hubben…' : 'Sök efter titel, innehåll eller tagg…'} onFocus={() => { if (view === 'hem')
        navigate('sok'); }} onChange={e => { setQuery(e.target.value); setOffset(0); }}/>{query && <button aria-label="Rensa sökning" onClick={() => setQuery('')}><X size={17}/></button>}<kbd>⌕</kbd></div>;
    return <div className="app-shell">
 <aside className="sidebar"><a className="brand" href="#hem" onClick={() => navigate('hem')}><img src="/favicon.svg" alt=""/><span>NEXUS <b>HUB</b></span></a><p className="side-label">DIN ARBETSYTA</p><button className={view === 'hem' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('hem')}><Home size={19}/>Översikt</button><button className={view === 'sok' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('sok')}><Search size={19}/>Sök i hubben</button><button className={view === 'favoriter' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('favoriter')}><Bookmark size={19}/>Sparade</button><p className="side-label">UTFORSKA</p>{modules.map(m => { const I = m.icon; return <button key={m.id} className={view === m.id ? 'nav-item active' : 'nav-item'} onClick={() => navigate(m.id)}><I className={'text-' + m.color} size={20}/>{m.name}<span className="nav-count">{stats?.modules?.find((x: any) => x.module === m.id)?.n || 0}</span></button>; })}<button className={view === 'graf' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('graf')}><Network size={19}/>Kunskapsgraf</button><p className="side-label">ORGANISERA</p><button className={view === 'inkorg' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('inkorg')}><Inbox size={19}/>Inkorg{stats?.inbox > 0 && <span className="nav-count">{stats.inbox}</span>}</button><button className="nav-item" onClick={() => navigate('github')}><Database size={19}/>GitHub live</button><button className="nav-item" onClick={() => navigate('arkiv')}><Archive size={19}/>Originalarkiv</button><div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={18}/><span>Din privata experimentmiljö<small>GitHub är huvudkälla</small></span></div><button className="nav-item" onClick={() => navigate('installningar')}><Settings size={19}/>Inställningar</button><div className="profile"><div className="avatar">R</div><div><strong>Robins arbetsyta</strong><small>Nexus Hub</small></div><span className="status-dot"/></div></div></aside>
 <div className="workspace"><header className="topbar"><a className="brand mobile-brand" href="#hem" onClick={() => navigate('hem')}><img src="/favicon.svg" alt=""/><span>NEXUS <b>HUB</b></span></a><div className="breadcrumb desktop-only">Din arbetsyta <ChevronRight size={14}/> <span>{selected ? 'Dokument' : mod?.name || names[view] || 'Hem'}</span></div><div className="header-actions"><span className="private-pill"><span />Privat</span><button className="icon-button" title="Uppdatera" aria-label="Uppdatera" onClick={() => { refreshStats(); loadItems(); if (view === 'github')
        setGithubRefresh(n => n + 1); }}><RefreshCw size={18}/></button><button className="icon-button" aria-label="Öppna meny" onClick={() => setMenu(true)}><Menu size={22}/></button></div></header>
 <main>
 {error && <div className="error-banner"><AlertCircle size={18}/><span>{error}</span><button onClick={() => { refreshStats(); loadItems(); }}>Försök igen</button></div>}
 {selected ? <>
 <div className="reader-toolbar"><button className="text-button" onClick={() => setSelected(null)}><ArrowLeft size={18}/>Tillbaka</button><div><button className="icon-button" aria-label="Spara som favorit" onClick={() => mutate({ favorite: !selected.favorite })}><Bookmark size={20} fill={selected.favorite ? 'currentColor' : 'none'}/></button><button className="icon-button" aria-label="Redigera" onClick={() => setEditor({ ...selected, tags: selected.tags.join(', ') })}><Edit3 size={20}/></button><button className="icon-button" aria-label="Exportera dokument" onClick={() => saveBlob(new Blob([selected.body], { type: 'text/markdown' }), selected.title.replace(/[\\/]/g, '_') + '.md')}><Download size={20}/></button></div></div>
 <article className="reader"><p className="eyebrow">{mod?.name} <span>/</span> {selected.category}</p><h1>{selected.title}</h1><div className="chips"><span className="chip selected">{selected.kind}</span>{selected.tags.map((t: string) => <button key={t} className="chip" onClick={() => { setSelected(null); setView('sok'); setQuery(t); }}>{t}</button>)}</div><div className="document-meta"><span><Clock size={14}/> {date(selected.updated_at)}</span><span>{selected.body.split(/\s+/).filter(Boolean).length.toLocaleString('sv-SE')} ord</span><span>{selected.origin === 'github' ? (selected.version > 1 ? 'Lokalt ändrad kopia' : 'GitHub-kopia') : 'Lokalt experimentmaterial'}</span></div>
 {selected.summary && <p className="reader-intro">{selected.summary}</p>}
 <div className="reader-controls"><details><summary><List size={17}/>Innehåll<ChevronDown size={15}/></summary><nav>{selected.body.split('\n').map((s: string, i: number) => /^#{1,6}\s/.test(s) ? <a key={i} href={'#heading-' + i}>{s.replace(/^#+\s/, '')}</a> : null)}</nav></details><div><button aria-label="Mindre text" onClick={() => setFont(Math.max(15, font - 1))}>A−</button><button aria-label="Större text" onClick={() => setFont(Math.min(25, font + 1))}>A+</button></div></div>
 {selected.body ? <div className="prose" style={{ fontSize: font }}><Markdown text={selected.body}/></div> : <div className="empty inline-empty"><FileText size={28}/><h3>Originalfilen finns bland bilagorna</h3><p>Det här dokumentet har ännu ingen separat lästext. Öppna eller ladda ned originalet nedan.</p></div>}
 {selected.files?.length > 0 && <section className="reader-section"><h2>Original & bilagor <span>{selected.files.length}</span></h2>{selected.files.map((f: any) => <div className="attachment" key={f.id}><FileText size={22}/><span><strong>{f.name}</strong><small>{formatBytes(f.size)} · SHA-256: {f.hash.slice(0, 12)}…</small>{f.origin === 'local' && <><small>{f.github_status?.state === 'sent' ? 'Mottagen av GitHub · ' + f.github_status.path : 'Väntar på GitHub' + (f.github_status?.error ? ' · ' + f.github_status.error : '')}</small>{f.github_status?.state === 'sent' ? <a className="text-button" href={f.github_status.url} target="_blank" rel="noopener noreferrer">Visa i GitHub <ExternalLink size={14}/></a> : <button className="text-button" disabled={busy} onClick={async () => { setBusy(true); try {
            const result = await api('files/' + f.id + '/github', { method: 'POST' });
            await open(selected.id);
            notify(result.state === 'sent' ? 'Originalet är mottaget av GitHub.' : 'Filen finns kvar i Nexus Hub. ' + result.error);
        }
        catch (e: any) {
            notify(e.message);
        }
        finally {
            setBusy(false);
        } }}>Skicka till GitHub</button>}</>}</span><a className="icon-button" aria-label={'Ladda ned ' + f.name} href={'/api/files/' + f.id}><Download size={19}/></a>{['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(f.mime) && <a className="icon-button" aria-label="Öppna original" href={'/api/files/' + f.id + '?inline=1'} target="_blank" rel="noopener"><ExternalLink size={18}/></a>}</div>)}</section>}
 <section className="reader-section"><div className="section-heading"><h2>Relaterad kunskap</h2><button className="text-button" onClick={() => setLinkOpen(true)}><Plus size={16}/>Koppla post</button></div>{selected.relations?.length ? selected.relations.map((r: any) => <div className="relation-row" key={r.id}><button onClick={() => open(r.other_id)}><span className="entry-icon purple"><Link2 size={18}/></span><span><strong>{r.target_title}</strong><small>{r.type}{r.note ? ' · ' + r.note : ''}</small></span><ChevronRight size={17}/></button><button className="icon-button" aria-label="Ta bort relation" onClick={async () => { if (confirm('Ta bort kopplingen? Posterna finns kvar.')) {
            await api('relations/' + r.id, { method: 'DELETE' });
            open(selected.id);
            refreshStats();
        } }}><X size={16}/></button></div>) : <p className="muted">Inga registrerade relationer ännu. Koppla en post för att bygga vidare.</p>}</section>
 <section className="source-info"><ShieldCheck size={19}/><div><strong>{selected.origin === 'github' ? 'Spårbar kopia från GitHub' : 'Sparat i experimentmiljön'}</strong>{selected.source_path && <p>{selected.source_path}</p>}{selected.source_sha && <small className="break">GitHub-commit: {selected.source_sha}<br />Lokal revision: {selected.version}</small>}<p>Textändringar stannar i Nexus Hub. Nya filuppladdningar skickas till GitHubs inkorg.</p></div></section>
 <div className="reader-footer"><button className="text-button" onClick={async () => setHistory(await api('entries/' + selected.id + '/versions'))}><Clock size={16}/>Versionshistorik</button><button className="text-button danger" onClick={() => { if (selected.deleted)
            mutate({ deleted: false });
        else if (confirm('Flytta posten till papperskorgen? Den kan återställas.'))
            mutate({ deleted: true }); }}><Trash2 size={16}/>{selected.deleted ? 'Återställ post' : 'Papperskorg'}</button><button className="text-button" onClick={() => { setUpload({ entryId: selected.id }); setFiles([]); }}><Upload size={16}/>Bifoga fil</button></div>
 {history && <section className="reader-section"><h2>Versionshistorik</h2>{history.length ? history.map((h: any) => <div className="attachment" key={h.id}><Clock size={18}/><span>{date(h.created_at)} · Revision {JSON.parse(h.snapshot).version}</span><button className="text-button" onClick={() => { const v = JSON.parse(h.snapshot); setEditor({ ...v, id: selected.id, version: selected.version, tags: v.tags.join(', ') }); }}>Öppna som utkast</button></div>) : <p className="muted">Inga tidigare lokala versioner.</p>}</section>}
 </article>
 </> : view === 'hem' ? <>
 <div className="welcome"><div><p className="eyebrow">DITT PERSONLIGA KUNSKAPSNAV</p><h1>Välkommen hem, Robin<span>.</span></h1><p>En plats för allt du vet. Och allt du vill upptäcka.</p></div><button className="primary desktop-only" onClick={() => setEditor({ title: '', body: '', module: 'databas', category: 'Övrigt', kind: 'Dokument', tags: '' })}><Plus size={18}/>Lägg till nytt</button></div>
 {searchbox}
 <section className="hero"><div className="hero-content"><span className="hero-label"><span /> DIN KUNSKAP. SAMMANLÄNKAD.</span><h2>Idéer blir större<br />när de möts.</h2><p>Utforska din kunskap, hitta nya samband<br className="desktop-only"/> och fortsätt där nyfikenheten tar dig.</p><button onClick={() => navigate('databas')}>Utforska databasen <ArrowRight size={17}/></button></div><div className="hero-emblem"><Network size={110} strokeWidth={.7}/></div></section>
 <section><div className="section-heading"><h2>Din hubb</h2><span className="muted small">Fyra vägar till mer</span></div><div className="module-grid">{modules.map(m => card(m))}</div></section>
 <section className="home-history"><div className="section-heading"><h2>Nyligen öppnade</h2><span className="muted small">På den här enheten</span></div><div className="panel">{recent.length ? recent.map(row) : <p className="history-note">Dokumenten du öppnar visas här så att du lätt hittar tillbaka.</p>}</div><div className="section-heading"><h2>Senaste aktivitet</h2><button className="text-button" onClick={() => { navigate('databas'); setCategory('Nyhetsarkiv'); }}>Nyhetsarkiv <ArrowRight size={14}/></button></div><div className="panel">{stats?.activity?.length ? stats.activity.map((a: any) => <div key={a.id} className="activity-item"><Clock size={17}/><div>{a.entry_id ? <button className="text-button" onClick={() => open(a.entry_id)}>{a.title}</button> : <strong>{a.title}</strong>}<small>{a.action} · {new Date(a.created_at).toLocaleString('sv-SE')}</small></div></div>) : <p className="history-note">Här visas nya uppladdningar, skapade poster och ändringar. Importtid räknas inte som egen aktivitet.</p>}</div></section>
 <div className="home-columns"><section><div className="section-heading"><h2>Utforska biblioteket</h2><button className="text-button" onClick={() => navigate('databas')}>Visa alla <ArrowRight size={14}/></button></div><div className="panel">{loading ? <div className="loading"><Loader2 className="spin"/>Hämtar din kunskap…</div> : items.length ? items.map(row) : <Empty icon={<BookOpen />} title="Här börjar ditt bibliotek" text="Importerade dokument och dina nya poster visas här."/>}</div></section><section><div className="section-heading"><h2>Överblick</h2><span className="live-label"><span /> LIVE</span></div><div className="overview-panel"><div><span className="stat-icon purple"><MaterialIcon tone="violet" size={30}><Layers size={20}/></MaterialIcon></span><strong>{allCount.toLocaleString('sv-SE')}</strong><small>Kunskapsposter</small></div><div><span className="stat-icon blue"><MaterialIcon tone="blue" size={30}><Archive size={20}/></MaterialIcon></span><strong>{stats?.files?.n || 0}</strong><small>Originalfiler</small></div><div><span className="stat-icon green"><MaterialIcon tone="green" size={30}><Network size={20}/></MaterialIcon></span><strong>{stats?.relations || 0}</strong><small>Relationer</small></div></div><button className="inbox-callout" onClick={() => navigate('inkorg')}><span className="entry-icon pink"><MaterialIcon tone="pink" size={32}><Inbox size={22}/></MaterialIcon></span><span><strong>Ge nya idéer en plats</strong><small>{stats?.inbox ? stats.inbox + ' poster väntar i inkorgen' : 'Bifoga, samla och organisera'}</small></span><ArrowRight size={18}/></button><div className="subtle-note"><ShieldCheck size={16}/><span>Privat experimentmiljö.<br />Din GitHub-databas är huvudkälla.</span></div></section></div>
 </> : view === 'github' ? <>
 {heading('GitHub live', 'Aktuella mappar och filer i lobbamannen/Databas.', <Database size={28}/>)}
 <div className="github-live-tools"><button className="secondary" onClick={() => { setGithubPath(''); if (!githubPath)
            setGithubRefresh(n => n + 1); }}><Home size={17}/>Databas</button><button className="secondary" onClick={() => { setGithubPath('00-Inkorg'); if (githubPath === '00-Inkorg')
            setGithubRefresh(n => n + 1); }}><Inbox size={17}/>GitHub-inkorg</button><button className="secondary" disabled={githubLoading} onClick={() => setGithubRefresh(n => n + 1)}><RefreshCw size={17}/>Uppdatera</button></div>
 {githubError && <div className="error-banner"><AlertCircle size={18}/><span>{githubError}{githubData ? ' Senast hämtad vy visas nedan.' : ''}</span></div>}
 {githubLoading ? <div className="panel loading"><Loader2 className="spin"/>Läser direkt från GitHub…</div> : githubData && <>
 <div className="section-heading"><h2 className="break">{githubData.path || 'Databas'}</h2>{githubData.path && <button className="text-button" onClick={() => setGithubPath(githubData.path.split('/').slice(0, -1).join('/'))}><ArrowLeft size={16}/>Upp en nivå</button>}</div>
 <section className="source-info"><ShieldCheck size={19}/><div><strong>Direkt från GitHub · {githubError ? 'tidigare hämtning' : 'senaste hämtning'}</strong><small className="break">Commit: {githubData.commit}</small><small>{new Date(githubData.fetchedAt).toLocaleString('sv-SE')}</small><p>Den här vyn läser originalet. Textredigering sker inte i denna vy.</p></div></section>
 {githubData.type === 'directory' ? <><div className="panel">{githubData.entries.length ? githubData.entries.map((f: any) => <button className="entry-row" key={f.path} onClick={() => setGithubPath(f.path)}><span className="entry-icon purple">{f.type === 'dir' ? <Folder size={21}/> : <FileText size={21}/>}</span><span className="entry-text"><strong>{f.name}</strong><small>{f.type === 'dir' ? 'Mapp' : formatBytes(f.size)}</small></span><ChevronRight size={17}/></button>) : <Empty icon={<Folder />} title="Mappen är tom" text="GitHub har inga filer i den här mappen."/>}</div>{githubData.possiblyTruncated && <p className="muted">GitHub begränsar den här listningen till 1 000 poster. Hela mappen kan därför inte visas här.</p>}</> : <article className="reader"><h1>{githubData.name}</h1><p className="muted">{formatBytes(githubData.size)} · Original i GitHub</p>{githubData.body ? <div className="prose"><Markdown text={githubData.body}/></div> : <div className="panel"><Empty icon={<FileText />} title="Öppna originalfilen" text="PDF, Word, binära filer och textfiler över 1 MB förhandsvisas inte i denna vy."/></div>}<a className="secondary github-original" href={githubData.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17}/>Öppna originalet i GitHub</a></article>}
 </>}
 </> : view === 'installningar' ? <>
 {heading('Inställningar', 'Din arbetsyta, dina data, din kontroll.', <Settings size={28}/>)}
 <div className="settings-grid"><section className="panel settings-panel"><h2><ShieldCheck size={20}/>Din arbetsyta</h2><dl><dt>Namn</dt><dd>Nexus Hub</dd><dt>Åtkomst</dt><dd>Privat · endast ägaren</dd><dt>Huvudkälla</dt><dd>lobbamannen/Databas</dd><dt>GitHub-skrivning</dt><dd>Egna filuppladdningar → 00-Inkorg/</dd><dt>AI-API och externa betaltjänster</dt><dd>Används inte</dd></dl><p className="muted">Databasen, originalfilerna och MCP-servern körs i Sites. ChatGPT Plus-gränser gäller.</p></section><section className="panel settings-panel"><h2><Download size={20}/>Säkerhetskopiering</h2><p>JSON-exporten innehåller äldre lokala metadata, historik och relationer. GitHub-original och spegelarkiv ingår inte.</p><button className="secondary" disabled={busy} onClick={backup}><Download size={18}/>Exportera databas som JSON</button><button className="secondary" disabled={busy} onClick={() => restoreInput.current?.click()}><Upload size={18}/>Återställ metadata från JSON</button><input ref={restoreInput} hidden type="file" accept=".json" onChange={e => { const f = e.target.files?.[0]; if (f)
            restore(f); e.target.value = ''; }}/><small>Återställning lägger till saknade poster. Befintligt arbete skrivs inte över. JSON innehåller filmetadata, inga originalbytes.</small></section><section className="panel settings-panel"><h2><Database size={20}/>Import & lagring</h2><dl><dt>Originalfiler</dt><dd>{stats?.files?.n || 0}</dd><dt>Filinnehåll</dt><dd>{formatBytes(stats?.files?.bytes || 0)}</dd><dt>Importversion</dt><dd className="mono">{stats?.settings?.github_import?.commit?.slice(0, 12) || 'Ingen import registrerad'}</dd><dt>Senaste import</dt><dd>{stats?.settings?.github_import?.importedAt ? date(stats.settings.github_import.importedAt) : '–'}</dd></dl><button className="text-button" onClick={() => navigate('arkiv')}>Öppna originalarkivet <ArrowRight size={16}/></button></section><section className="panel settings-panel"><h2><CheckCircle2 size={20}/>Funktion & verifiering</h2><p>Serverns testresultat och importkontroll finns här när verifieringen är klar.</p>{stats?.settings?.verification ? <dl>{Object.entries(stats.settings.verification).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></React.Fragment>)}</dl> : <p className="muted">Ingen verifieringsrapport registrerad ännu.</p>}<button className="text-button" onClick={() => navigate('papperskorg')}><Trash2 size={16}/>Papperskorg ({stats?.trash || 0})</button><p className="muted small">Samsung Internet på din egen mobil behöver också provas i verklig användning.</p></section></div>
 </> : view === 'graf' ? <>
 {heading('Kunskapsgraf', 'Upptäck sambanden mellan dina kunskapsposter.', <Network size={28}/>)}<div className="graph-top"><div className="segmented"><button className={!graphList ? 'active' : ''} onClick={() => setGraphList(false)}><Network size={17}/>Grafvy</button><button className={graphList ? 'active' : ''} onClick={() => setGraphList(true)}><List size={17}/>Listvy</button></div><span className="muted small">{relations.length} registrerade relationer</span></div>
 {!relations.length ? <div className="panel"><Empty icon={<Network size={42}/>} title="All kunskap börjar med en koppling" text="Öppna en post och välj Koppla post. Endast registrerade samband visas här."/></div> : graphList ? <div className="panel">{relations.map(r => <div className="graph-list-row" key={r.id}><button onClick={() => open(r.source_id)}>{r.source_title}</button><span>{r.type} <ArrowRight size={14}/></span><button onClick={() => open(r.target_id)}>{r.target_title}</button></div>)}</div> : <><label className="field graph-select">Utgångspunkt<select value={graphFocus} onChange={e => setGraphFocus(e.target.value)}>{Array.from(new Map(relations.flatMap(r => [[r.source_id, r.source_title], [r.target_id, r.target_title]])).entries()).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label><Graph relations={relations} focus={graphFocus || relations[0]?.source_id} open={open} onFocus={setGraphFocus}/><p className="muted small">Tryck på en nod för att läsa posten. Välj utgångspunkt för att utforska andra samband. Upp till åtta grannar visas åt gången.</p></>}
 </> : view === 'arkiv' ? <>
 {heading('Originalarkiv', 'Bevarade original, bilagor och tekniskt arkivmaterial.', <Archive size={28}/>)}{searchbox}<div className="section-heading"><h2>{archive?.total || 0} filer</h2><span className="muted small">Originalbytes · inga omskrivningar</span></div><div className="panel">{loading ? <div className="loading"><Loader2 className="spin"/>Hämtar filer…</div> : archive?.files?.map((f: any) => <div className="attachment" key={f.id}><span className="entry-icon blue"><FileText size={20}/></span><span><strong>{f.name}</strong><small className="break">{f.source_path || 'Lokal uppladdning'}</small><small>{formatBytes(f.size)} · SHA-256 {f.hash.slice(0, 10)}…</small></span><a className="icon-button" aria-label={'Ladda ned ' + f.name} href={'/api/files/' + f.id}><Download size={19}/></a></div>)}</div><Pagination offset={offset} total={archive?.total || 0} size={50} setOffset={setOffset}/>
 </> : <>
 {heading(mod?.name || names[view] || 'Databas', view === 'inkorg' ? 'Samla nytt material. Ge det en plats när du är redo.' : view === 'sok' ? 'Hitta bland dokument, metoder och berättelser.' : view === 'favoriter' ? 'Kunskapen du vill ha nära till hands.' : view === 'papperskorg' ? 'Återställ poster som du har lagt åt sidan.' : mod?.subtitle || 'Utforska och hantera din kunskap.', view === 'inkorg' ? <Inbox size={28}/> : view === 'sok' ? <Search size={28}/> : <Icon size={28}/>)}
 {view === 'databas' && <div className="info-note"><Database size={19}/><div><p>Biblioteket visar sparade kopior. GitHub live visar aktuellt innehåll direkt från huvudkällan.</p><button className="text-button" onClick={() => navigate('github')}>Öppna GitHub live <ArrowRight size={16}/></button></div></div>}
 <div className="list-tools">{searchbox}<button className={'filter-button ' + (filter ? 'active' : '')} aria-label="Visa filter" onClick={() => setFilter(!filter)}><SlidersHorizontal size={19}/><span>Filter</span></button></div>
 {filter && <div className="filter-panel"><label className="field">Kategori<select value={category} onChange={e => { setCategory(e.target.value); setOffset(0); }}><option value="">Alla kategorier</option>{stats?.categories?.map((c: any) => <option key={c.category}>{c.category}</option>)}</select></label><label className="field">Typ<select value={kind} onChange={e => { setKind(e.target.value); setOffset(0); }}><option value="">Alla typer</option>{['Dokument', 'Metod', 'Kunskap', 'Berättelse', 'Plugin', 'Verktyg', 'Nyhet'].map(k => <option key={k}>{k}</option>)}</select></label><button className="text-button" onClick={() => { setCategory(''); setKind(''); setQuery(''); }}>Rensa filter</button></div>}
 {view === 'databas' && !query && !category && <section className="category-section"><div className="section-heading"><h2>Kategorier</h2><span className="muted small">Utforska ditt bibliotek</span></div><div className="category-grid">{stats?.categories?.filter((c: any) => c.category !== 'Osorterat').slice(0, 6).map((c: any, i: number) => <button key={c.category} onClick={() => { setCategory(c.category); setOffset(0); }}><span className={'entry-icon ' + ['purple', 'blue', 'green', 'orange'][i % 4]}><Folder size={21}/></span><span><strong>{c.category}</strong><small>{c.n} poster</small></span></button>)}</div></section>}
 <div className="section-heading"><h2>{query ? 'Sökresultat' : category || 'Alla poster'} <span className="counter">{total}</span></h2><button className="text-button" onClick={() => view === 'inkorg' ? (setUpload({ module: 'databas' }), setFiles([])) : setEditor({ title: '', body: '', module: mod?.id || 'databas', category: category || 'Övrigt', kind: view === 'plugins' ? 'Plugin' : 'Dokument', tags: '', state: view === 'inkorg' ? 'inkorg' : 'klar' })}><Plus size={16}/>{view === 'inkorg' ? 'Bifoga fil' : 'Ny post'}</button></div>
 <div className="panel">{loading ? <div className="loading"><Loader2 className="spin"/>Hämtar…</div> : items.length ? items.map(row) : <Empty icon={view === 'plugins' ? <Puzzle size={38}/> : view === 'inkorg' ? <Inbox size={38}/> : <Search size={38}/>} title={query || category || kind ? 'Inga träffar' : view === 'plugins' ? 'Dina plugins får ett eget hem' : view === 'inkorg' ? 'Inkorgen är tom' : 'Här finns plats för mer'} text={query || category || kind ? 'Prova ett annat sökord eller ta bort ett filter.' : view === 'plugins' ? 'Lägg till beskrivningar, guider och länkar till dina plugins. Katalogen installeras inte automatiskt från ChatGPT.' : 'Lägg till en post eller bifoga ett dokument för att börja.'}/>}</div><Pagination offset={offset} total={total} size={30} setOffset={setOffset}/>
 {view === 'inkorg' && <button className="primary wide" onClick={() => { setUpload({ module: 'databas' }); setFiles([]); }}><Upload size={19}/>Bifoga dokument från mobilen</button>}
 </>}
 <footer className="page-footer"><span className="mini-brand">NEXUS HUB</span><span>Kunskap växer när den hänger ihop.</span></footer>
 </main>
 </div>
 <nav className="bottom-nav" aria-label="Huvudnavigation"><button className={view === 'hem' && !selected ? 'active' : ''} onClick={() => navigate('hem')}><Home size={22}/><span>Hem</span></button><button className={view === 'sok' && !selected ? 'active' : ''} onClick={() => navigate('sok')}><Search size={22}/><span>Sök</span></button><button className="add-nav" aria-label="Lägg till" onClick={() => setMenu(true)}><span><Plus size={26}/></span><small>Lägg till</small></button><button className={view === 'inkorg' ? 'active' : ''} onClick={() => navigate('inkorg')}><Inbox size={22}/><span>Inkorg</span>{stats?.inbox > 0 && <i />}</button><button className={menu ? 'active' : ''} onClick={() => setMenu(true)}><Menu size={22}/><span>Meny</span></button></nav>
 {menu && <div className="modal-backdrop" onClick={() => setMenu(false)}><div className="menu-sheet" role="dialog" aria-modal="true" aria-label="Meny" onClick={e => e.stopPropagation()}><div className="modal-heading"><h2>Din Nexus Hub</h2><button className="icon-button" onClick={() => setMenu(false)} aria-label="Stäng meny"><X /></button></div><div className="add-options"><button onClick={() => { setMenu(false); setEditor({ title: '', body: '', module: 'databas', category: 'Övrigt', kind: 'Dokument', tags: '' }); }}><Plus size={21}/><span>Skapa en post<small>Skriv, samla och länka kunskap</small></span></button><button onClick={() => { setMenu(false); setUpload({ module: 'databas' }); setFiles([]); }}><Upload size={21}/><span>Bifoga dokument<small>Från mobilen till din inkorg</small></span></button></div><div className="menu-grid">{modules.map(m => card(m, true))}</div>{[['github', Database, 'GitHub live'], ['graf', Network, 'Kunskapsgraf'], ['favoriter', Bookmark, 'Sparade'], ['arkiv', Archive, 'Originalarkiv'], ['installningar', Settings, 'Inställningar']].map(([id, I, label]: any) => <button className="nav-item" key={id} onClick={() => navigate(id)}><I size={20}/>{label}<ChevronRight size={16}/></button>)}<div className="private-note"><ShieldCheck size={17}/>Privat · GitHub är huvudkälla</div></div></div>}
 {editor && <div className="modal-backdrop"><form className="editor-modal" onSubmit={saveEntry}><div className="modal-heading"><h2>{editor.id ? 'Redigera post' : 'Ny kunskapspost'}</h2><button type="button" className="icon-button" aria-label="Stäng" disabled={busy} onClick={() => setEditor(null)}><X /></button></div><div className="modal-body"><label className="field">Titel<input required maxLength={500} autoFocus value={editor.title} onChange={e => setEditor({ ...editor, title: e.target.value })}/></label><div className="form-two"><label className="field">Avdelning<select value={editor.module} onChange={e => setEditor({ ...editor, module: e.target.value })}>{modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="field">Typ<select value={editor.kind} onChange={e => setEditor({ ...editor, kind: e.target.value })}>{['Dokument', 'Metod', 'Kunskap', 'Berättelse', 'Plugin', 'Verktyg', 'Nyhet'].map(k => <option key={k}>{k}</option>)}</select></label></div><label className="field">Kategori<input list="categories" value={editor.category} onChange={e => setEditor({ ...editor, category: e.target.value })}/></label><datalist id="categories">{stats?.categories?.map((c: any) => <option key={c.category} value={c.category}/>)}</datalist><label className="field">Taggar <small>Separera med kommatecken</small><input value={editor.tags} onChange={e => setEditor({ ...editor, tags: e.target.value })}/></label><label className="field">Kort beskrivning<textarea rows={2} value={editor.summary || ''} onChange={e => setEditor({ ...editor, summary: e.target.value })}/></label><label className="field">Innehåll <small>Markdown stöds</small><textarea className="content-editor" rows={14} value={editor.body} onChange={e => setEditor({ ...editor, body: e.target.value })}/></label><label className="field">Placering<select value={editor.state || 'klar'} onChange={e => setEditor({ ...editor, state: e.target.value })}><option value="klar">I vald avdelning</option><option value="inkorg">Inkorg · sortera senare</option></select></label><p className="muted small">Sparas endast i Nexus Hub. GitHub ändras inte.</p></div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setEditor(null)}>Avbryt</button><button className="primary" disabled={busy}>{busy ? <Loader2 className="spin" size={18}/> : <Check size={18}/>}Spara post</button></div></form></div>}
 {upload && <div className="modal-backdrop"><form className="editor-modal upload-modal" onSubmit={uploadFiles}><div className="modal-heading"><h2>Bifoga dokument</h2><button type="button" className="icon-button" aria-label="Stäng" disabled={busy} onClick={() => setUpload(null)}><X /></button></div><div className="modal-body"><button type="button" className="dropzone" onClick={() => fileInput.current?.click()}><span className="module-icon purple"><Upload size={26}/></span><strong>Välj filer från din mobil</strong><span>PDF, Word, bilder, text och andra dokument</span><small>Högst 25 MB per fil</small></button><input ref={fileInput} hidden type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))}/>{files.map((f, i) => <div className="attachment" key={i}><FileText size={20}/><span><strong>{f.name}</strong><small>{formatBytes(f.size)}</small></span><button type="button" className="icon-button" aria-label="Ta bort från uppladdning" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={17}/></button></div>)}{!upload.entryId && <><label className="field">Avdelning<select value={upload.module} onChange={e => setUpload({ ...upload, module: e.target.value })}>{modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="field">Kategori<input placeholder="Osorterat" value={upload.category || ''} onChange={e => setUpload({ ...upload, category: e.target.value })}/></label></>}<div className="info-note"><Inbox size={19}/><p>Originalfilen sparas i Nexus Hub och skickas till GitHub: Databas/00-Inkorg/. Status visas efter uppladdningen. Misslyckad överföring kan provas igen från postens bilagor. GitHub-överföring: högst 10 MB per fil; lokal lagring: 25 MB.</p></div></div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setUpload(null)}>Avbryt</button><button className="primary" disabled={busy || !files.length}>{busy ? <Loader2 size={18} className="spin"/> : <Upload size={18}/>}Ladda upp{files.length > 1 ? ' ' + files.length + ' filer' : ''}</button></div></form></div>}
 {linkOpen && <div className="modal-backdrop"><div className="editor-modal"><div className="modal-heading"><h2>Koppla kunskap</h2><button className="icon-button" aria-label="Stäng" onClick={() => setLinkOpen(false)}><X /></button></div><div className="modal-body"><label className="field">Relation<select value={linkType} onChange={e => setLinkType(e.target.value)}>{['relaterar', 'citerar', 'bygger på', 'motsäger', 'fördjupar'].map(x => <option key={x}>{x}</option>)}</select></label><label className="field">Sök post<input value={linkQuery} onChange={e => setLinkQuery(e.target.value)} autoFocus placeholder="Titel eller sökord"/></label>{linkTargets.map(e => <button className="entry-row" key={e.id} onClick={async () => { try {
        await api('relations', { method: 'POST', body: JSON.stringify({ sourceId: selected.id, targetId: e.id, type: linkType }) });
        setLinkOpen(false);
        open(selected.id);
        refreshStats();
        notify('Relationen är sparad.');
    }
    catch (err: any) {
        notify(err.message);
    } }}><Link2 size={18}/><span>{e.title}</span><Plus size={17}/></button>)}</div></div></div>}
 {busy && progress && <div className="progress-float" role="status"><Loader2 className="spin" size={20}/>{progress}</div>}
 {toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}<button aria-label="Stäng meddelande" onClick={() => setToast('')}><X size={15}/></button></div>}
 </div>;
}
function Empty({ icon, title, text }: {
    icon: React.ReactNode;
    title: string;
    text: string;
}) { return <div className="empty"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>; }
function Pagination({ offset, total, size, setOffset }: {
    offset: number;
    total: number;
    size: number;
    setOffset: (n: number) => void;
}) { return total > size ? <div className="pagination"><button className="secondary" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - size)); window.scrollTo(0, 0); }}><ArrowLeft size={16}/>Föregående</button><span>{offset + 1}–{Math.min(offset + size, total)} av {total}</span><button className="secondary" disabled={offset + size >= total} onClick={() => { setOffset(offset + size); window.scrollTo(0, 0); }}>Nästa<ArrowRight size={16}/></button></div> : null; }
function Graph({ relations, focus, open, onFocus }: {
    relations: any[];
    focus: string;
    open: (id: string) => void;
    onFocus: (id: string) => void;
}) { const edges = relations.filter(r => r.source_id === focus || r.target_id === focus).slice(0, 8); const all = relations.flatMap(r => [{ id: r.source_id, title: r.source_title }, { id: r.target_id, title: r.target_title }]); const center = all.find(x => x.id === focus); const nodes = edges.map(r => all.find(x => x.id === (r.source_id === focus ? r.target_id : r.source_id))!); return <div className="graph-canvas"><svg viewBox="0 0 600 460" role="img" aria-label="Kunskapsgraf"><defs><radialGradient id="nodeglow"><stop stopColor="#7c63de" stopOpacity=".6"/><stop offset="1" stopColor="#7c63de" stopOpacity="0"/></radialGradient></defs><circle cx="300" cy="230" r="150" fill="url(#nodeglow)"/>{nodes.map((n, i) => { const angle = i * 2 * Math.PI / nodes.length - Math.PI / 2, x = 300 + 200 * Math.cos(angle), y = 230 + 160 * Math.sin(angle); return <g key={i}><line x1="300" y1="230" x2={x} y2={y} stroke="#65558a" strokeWidth="1.5"/><g role="button" tabIndex={0} aria-label={n.title} onClick={() => open(n.id)} onKeyDown={e => { if (e.key === 'Enter')
    open(n.id); }} style={{ cursor: 'pointer' }}><circle cx={x} cy={y} r="25" fill="#183143" stroke="#52c8d1" strokeWidth="2"/><circle cx={x} cy={y} r="8" fill="#52c8d1"/><text x={x} y={y + 46} textAnchor="middle" fill="#c8cfe1" fontSize="12">{n.title.slice(0, 26)}{n.title.length > 26 ? '…' : ''}</text></g></g>; })}<g role="button" tabIndex={0} aria-label={center?.title} onClick={() => open(focus)} onKeyDown={e => { if (e.key === 'Enter')
    open(focus); }} style={{ cursor: 'pointer' }}><circle cx="300" cy="230" r="57" fill="#292042" stroke="#b8a0ff" strokeWidth="2"/><text x="300" y="225" textAnchor="middle" fill="#ede8ff" fontSize="13">{center?.title.slice(0, 19)}</text><text x="300" y="246" textAnchor="middle" fill="#b7a7d9" fontSize="11">Öppna post ↗</text></g></svg><div className="graph-legend"><span><i className="purple-dot"/>Vald post</span><span><i />Relaterad kunskap</span></div></div>; }
