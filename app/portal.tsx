import IncomingInbox from '@/components/personal/IncomingInbox';
import TodoList from '@/components/personal/TodoList';
'use client';
import { cancelQueuedEdits } from '@/platform/outbox';
import IdeasInbox, { IdeaEditor } from '@/components/ideas/IdeasInbox';
import { useIdeas } from '@/components/ideas/use-ideas';
import AndroidSettings from '@/src/AndroidSettings';
import {replicaStatus} from '@/platform/replica-sync';
import {LocalImage} from '@/platform/resources';
import { invalidateMedia } from '@/lib/media-client';
import { useDocumentBookmarks } from './use-document-bookmarks';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Home, Search, Plus, Inbox, Menu, X, ArrowLeft, ArrowRight, ChevronRight, Layers, Puzzle, Eye, Clapperboard, Tv, Network, Wrench, Settings, FileText, Folder, FolderOpen, Bookmark, Upload, Download, RefreshCw, Clock, ShieldCheck, ExternalLink, BookOpen, LibraryBig, Loader2, Archive, Database, AlertCircle, ChevronDown, Dumbbell, Coins, Lightbulb } from 'lucide-react';
import NativeBackBridge, { useBackHandler } from '@/components/NativeBackBridge';
import LegacyNexus, { Markdown } from './nexus';
import Films from './films';
import Series from './series';
import MediaRegister from '@/components/media/MediaRegister';
import Stories from './stories';
import Economy from './economy';
import GlobalSearch from '@/components/search/GlobalSearch';
import { restoreListScroll } from '@/lib/client-navigation';
import MirrorInspector from './mirror-inspector';
import MirrorAudit from './mirror-audit';
import './portal-polish.css';
import './hub-design-system.css';
import HomeDashboard from '@/components/home/HomeDashboard';
import NexusBrandMark from '@/components/NexusBrandMark';
import WatchlistOverview from '@/components/home/WatchlistOverview';
import DatabaseOverview from '@/components/dashboard/DatabaseOverview';
import DiscoveryToolbar from '@/components/dashboard/DiscoveryToolbar';
import SettingsOverview from '@/components/dashboard/SettingsOverview';
import './module-dashboards.css';
import './discovery-polish.css';
import '@/components/home/locked-home.css';
import './chroma-materials.css';
import './chroma-theme.css';
import './media-register.css';
import MaterialIcon from '@/components/MaterialIcon';
import MaterialDefinitions from '@/components/home/MaterialDefinitions';
import { storyList, storyFromDocument } from '@/lib/stories.mjs';
import RepositoryPoster, { usePosterRevision } from '@/components/repository-poster';
import { filterCatalog, relatedSuggestions, documentKey } from '@/lib/catalog.mjs';
const NAV = [['hem', 'Hem', Home], ['ideer', 'Idéinkorg', Lightbulb], ['mottaget','Mottagningsinkorg',Inbox], ['attgora','Att göra',LibraryBig], ['databas', 'Databas', Layers], ['berattelser', 'Berättelser', BookOpen], ['filmer', 'Filmer', Clapperboard], ['serier', 'Serier', Tv], ['register', 'Register', LibraryBig], ['ekonomi', 'Ekonomi', Coins], ['plugins', 'Plugins', Puzzle], ['upptack', 'Upptäck', Network], ['filer', 'Utforska filer', FolderOpen], ['verktyg', 'Verktyg', Wrench], ['nyheter', 'Nyhetsarkiv', FileText], ['favoriter', 'Sparade', Bookmark], ['arkiv', 'Tekniskt arkiv', Archive]] as const;
const MENU_SECTIONS: {
    title: string;
    ids: string[];
}[] = [
    { title: 'Bibliotek', ids: ['hem', 'databas', 'berattelser', 'filmer', 'serier', 'register'] },
    { title: 'Utforska', ids: ['plugins', 'upptack', 'filer', 'verktyg', 'nyheter'] },
    { title: 'Personligt & arkiv', ids: ['ideer','mottaget','attgora', 'ekonomi', 'favoriter', 'arkiv'] }
];
const labels: Record<string, string> = { hem: 'Hem', mottaget:'Mottagningsinkorg', attgora:'Att göra', ideer: 'Idéinkorg', villse: 'Vill se', traning: 'Träning', filer: 'Utforska filer', databas: 'Databas', sok: 'Sök', mysterier: 'Mysterier', berattelser: 'Berättelser', filmer: 'Filmer', serier: 'Serier', register: 'Register', ekonomi: 'Ekonomi', plugins: 'Plugins', upptack: 'Upptäck', verktyg: 'Verktyg', nyheter: 'Nyhetsarkiv', inkorg: 'Inkorg', favoriter: 'Sparade', arkiv: 'Tekniskt arkiv', installningar: 'Inställningar & system' };
async function api(path: string, opts: RequestInit = {}): Promise<any> { const r = await fetch('/api/' + path, { ...opts, headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }, cache: 'no-store' }); const data: any = await r.json(); if (!r.ok)
    throw Error(data.error || 'Kunde inte hämta data.'); return data; }
function bytes(n: number) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
function readSaved(key: string) { try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
}
catch {
    return [];
} }
export default function Portal() {
    const ideas = useIdeas();
    const [addMenu, setAddMenu] = useState(false);
    useBackHandler(155, () => { if (!addMenu) return false; setAddMenu(false); return true; });
    const documentBookmarks = useDocumentBookmarks(), favorites = documentBookmarks.entries;
    const [dbBrowsing, setDbBrowsing] = useState(false), [dbJump, setDbJump] = useState(0);
    useEffect(() => { if (dbJump > 0)
        requestAnimationFrame(() => document.getElementById('nh-database-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }, [dbJump]);
    const routeHistory = useRef<string[]>([]), internalHash = useRef('');
    const registerDirtyRef = useRef(false), navigationBusyRef = useRef(false), moduleScroll = useRef(new Map<string, number>()), activeViewRef = useRef('hem');
    const registerDiscardRef = useRef<(() => Promise<void>) | null>(null);
    const setRegisterDirty = useCallback((dirty: boolean, busy = false, discard?: () => Promise<void>) => { registerDirtyRef.current = dirty; navigationBusyRef.current = busy; registerDiscardRef.current = dirty ? discard || null : null; }, []);
    const discardRegisterDrafts = async () => {
        navigationBusyRef.current = true;
        try {
            if (registerDiscardRef.current) await registerDiscardRef.current();
            else await cancelQueuedEdits('all-drafts');
            registerDirtyRef.current = false;
            return true;
        } catch (error: any) {
            window.alert('Kunde inte kasta väntande sparförsök. Redigeringen är kvar. ' + error.message);
            return false;
        } finally { navigationBusyRef.current = false; }
    };
    const [mediaItem, setMediaItem] = useState<string | null>(null);
    const [registerKind, setRegisterKind] = useState<'films' | 'series' | 'stories'>('films');
    const detailOrigin = useRef<any>(null), readerScroll = useRef(0), readerStack = useRef<any[]>([]);
    const rememberOrigin = () => { detailOrigin.current = { view, query, topic, page, dbBrowsing, scroll: window.scrollY, registerKind, historyDepth: routeHistory.current.length }; };
    const returnFromDetail = () => { const origin = detailOrigin.current; if (!origin)
        return; detailOrigin.current = null; go(origin.view, false); routeHistory.current.length = origin.historyDepth; setQuery(origin.query); setTopic(origin.topic); setPage(origin.page); setDbBrowsing(origin.dbBrowsing); setRegisterKind(origin.registerKind); restoreListScroll(origin.scroll); };
    const closeReader = () => { readRequest.current++; setReading(false); const previous = readerStack.current.pop(); setReader(previous?.reader || null); restoreListScroll(previous?.scroll ?? readerScroll.current); };
    const [view, setView] = useState('hem'), [menu, setMenu] = useState(false), [overview, setOverview] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [query, setQuery] = useState(''), [topic, setTopic] = useState(''), [page, setPage] = useState(0), [reader, setReader] = useState<any>(null), [reading, setReading] = useState(false), [font, setFont] = useState(17), [recent, setRecent] = useState<any[]>([]), [legacy, setLegacy] = useState(false), [fulltext, setFulltext] = useState(false), [copyResults, setCopyResults] = useState<any[]>([]), [copyTotal, setCopyTotal] = useState(0), [copyLoading, setCopyLoading] = useState(false), [inbox, setInbox] = useState<any[]>([]), [inboxOffset, setInboxOffset] = useState(0), [inboxTotal, setInboxTotal] = useState(0), [upload, setUpload] = useState(false), [files, setFiles] = useState<File[]>([]), [sending, setSending] = useState(false), [uploadResults, setUploadResults] = useState<any[]>([]), [uploadProgress, setUploadProgress] = useState(''), [shuffle, setShuffle] = useState(0), [showArchived, setShowArchived] = useState(false), [notice, setNotice] = useState('');
    useEffect(() => { activeViewRef.current = view; }, [view]);
    const [replica,setReplica]=useState(replicaStatus());
    const [mirror, setMirror] = useState<any>(null), [mirrorChecks, setMirrorChecks] = useState<Record<string, any>>({}), [differencePage, setDifferencePage] = useState(0), [differences, setDifferences] = useState<any>(null), [mirrorSearch, setMirrorSearch] = useState(false);
    const [inspect, setInspect] = useState<{
        path: string;
        title?: string;
    } | null>(null);
    useEffect(() => { if (!menu && !upload && !inspect && !addMenu)
        return; const before = document.body.style.overflow; document.body.style.overflow = 'hidden'; const onKey = (event: KeyboardEvent) => { if (event.key !== 'Escape')
        return; if (addMenu) { setAddMenu(false); return; } if (inspect) {
        setInspect(null);
        return;
    } if (upload) {
        if (!sending)
            setUpload(false);
        return;
    } if (menu)
        setMenu(false); }; document.addEventListener('keydown', onKey); return () => { document.body.style.overflow = before; document.removeEventListener('keydown', onKey); }; }, [menu, upload, inspect, sending, addMenu]);
    useEffect(() => { if (menu)
        document.querySelector<HTMLButtonElement>('.menu-sheet [aria-label="Stäng menyn"]')?.focus(); }, [menu]);
    const [noticeKind, setNoticeKind] = useState<'error' | 'success'>('error');
    const [storyInitialPath, setStoryInitialPath] = useState(''), [gitSavedEntries, setGitSavedEntries] = useState<Record<string, {
        saved: boolean;
        read: boolean;
    }>>({}), [gitSavedLoading, setGitSavedLoading] = useState(false), [gitSavedError, setGitSavedError] = useState('');
    const loadDifferences = async (offset = 0) => { try {
        const d = await api('portal/differences?offset=' + offset);
        setDifferences(d);
        setDifferencePage(offset);
    }
    catch (e: any) {
        setNoticeKind('error');
        setNotice(e.message);
    } };
    useEffect(() => { const update=()=>{setReplica(replicaStatus());if(!replicaStatus().running)void api('portal/mirror').then(setMirror).catch(()=>{});}; update();window.addEventListener('nexus-replica-status',update);return()=>window.removeEventListener('nexus-replica-status',update); }, []);
    const uploadIds = useRef(new WeakMap<File, string>());
    const input = useRef<HTMLInputElement>(null), overviewRequest = useRef(0), readRequest = useRef(0);
    const load = async (force = false) => { if (force)
        invalidateMedia(); const request = ++overviewRequest.current; setLoading(true); setError(''); try {
        const d = await api('portal/overview' + (force ? '?refresh=1' : ''));
        if (!d.repositories?.databas)
            throw Error(d.errors?.find((e: any) => e.repo === 'databas')?.error || 'GitHub-katalogen kunde inte läsas.');
        if (request === overviewRequest.current)
            setOverview(d);
    }
    catch (e: any) {
        if (request === overviewRequest.current)
            setError(e.message);
    }
    finally {
        if (request === overviewRequest.current)
            setLoading(false);
    } };
    useEffect(() => {
        let pending = false;
        const refresh = () => { pending = true; apply(); };
        const apply = () => {
            if (!pending || registerDirtyRef.current || navigationBusyRef.current) return;
            pending = false; void load(true); void ideas.reload();
            window.dispatchEvent(new CustomEvent('nexus-refresh-module', {detail:{view:activeViewRef.current}}));
        };
        const timer = window.setInterval(apply,1000);
        window.addEventListener('nexus-github-changed',refresh);
        return () => {clearInterval(timer);window.removeEventListener('nexus-github-changed',refresh);};
    }, [ideas.reload]);
    useEffect(()=>{const incoming=()=>{if(!registerDirtyRef.current&&!navigationBusyRef.current){(window as any).NexusHubIncomingOpen=false;void go('mottaget');}};window.addEventListener('nexus-native-share',incoming);if((window as any).NexusHubIncomingOpen)incoming();return()=>window.removeEventListener('nexus-native-share',incoming);},[]);
    const openMedia = async (next: 'filmer' | 'serier', item: string) => { if (navigationBusyRef.current)
        return; if (registerDirtyRef.current && !window.confirm('Du har osparade ändringar. Lämna sidan och kasta dem?'))
        return; if(registerDirtyRef.current && !await discardRegisterDrafts()) return; rememberOrigin(); readRequest.current++; setReading(false); readerStack.current = []; if (next !== view)
        routeHistory.current.push(view); setMediaItem(item); setView(next); setReader(null); setMenu(false); const hash = next + '?item=' + encodeURIComponent(item); if (location.hash.slice(1) !== hash) {
        internalHash.current = hash;
        location.hash = hash;
    } window.scrollTo(0, 0); };
    const go = async (next: string, remember = true) => { if (navigationBusyRef.current)
        return; moduleScroll.current.set(view, window.scrollY); if (next === 'mysterier')
        next = 'berattelser'; if (next !== view && registerDirtyRef.current) {
        if (!window.confirm('Du har osparade registerändringar. Lämna sidan och kasta dem?'))
            return;
        if (!await discardRegisterDrafts()) return;
    } if (remember && next !== view)
        routeHistory.current.push(view); readerStack.current = []; if (remember)
        detailOrigin.current = null; setMediaItem(null); setDbBrowsing(false); setStoryInitialPath(''); readRequest.current++; setReading(false); setReader(null); setView(next); setMenu(false); setQuery(''); setTopic(''); setPage(0); setFulltext(false); setCopyResults([]); if (location.hash.slice(1) !== next) {
        internalHash.current = next;
        location.hash = next;
    } if (remember)
        window.scrollTo(0, 0);
    else
        restoreListScroll(moduleScroll.current.get(next) || 0); };
    const backToPrevious = (fallback = 'hem') => { let previous = routeHistory.current.pop(); while (previous === view)
        previous = routeHistory.current.pop(); go(previous || fallback, false); };
    useEffect(() => { const hash = location.hash.slice(1) || 'hem'; const [initialView, initialQuery] = hash.split('?'); const initialParams = new URLSearchParams(initialQuery || ''); if ((initialView === 'filmer' || initialView === 'serier') && initialParams.has('item')) {
        setView(initialView);
        setMediaItem(initialParams.get('item'));
    }
    else if (labels[hash])
        setView(hash === 'mysterier' ? 'berattelser' : hash);
    else if (hash === 'github')
        setView('databas'); setRecent(readSaved('nexus-portal-recent')); load(); const onHash = async () => { if (navigationBusyRef.current) {
        internalHash.current = activeViewRef.current;
        location.hash = activeViewRef.current;
        return;
    } const h = location.hash.slice(1) || 'hem'; if (h.split('?')[0] !== activeViewRef.current && registerDirtyRef.current) {
        if (!window.confirm('Du har osparade registerändringar. Lämna sidan och kasta dem?')) {
            internalHash.current = activeViewRef.current;
            location.hash = activeViewRef.current;
            return;
        }
        if (!await discardRegisterDrafts()) return;
    } if (internalHash.current === h) {
        internalHash.current = '';
        return;
    } if (labels[h] || h.startsWith('filmer?') || h.startsWith('serier?'))
        routeHistory.current = []; const [target, query] = h.split('?'); const params = new URLSearchParams(query || ''); if ((target === 'filmer' || target === 'serier') && params.has('item')) {
        readRequest.current++;
        setReading(false);
        setView(target);
        setMediaItem(params.get('item'));
        setReader(null);
    }
    else if (labels[h]) {
        setMenu(false);
        setStoryInitialPath('');
        setDbBrowsing(false);
        readRequest.current++;
        setReading(false);
        setMediaItem(null);
        setView(h === 'mysterier' ? 'berattelser' : h);
        setReader(null);
    } }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
    useEffect(() => { if (view !== 'inkorg')
        return; let active = true; api('portal/inbox?offset=' + inboxOffset).then(d => { if (active) {
        setInbox(d.entries);
        setInboxTotal(d.total);
    } }).catch((e: any) => { if (active)
        setError(e.message); }); return () => { active = false; }; }, [view, overview, inboxOffset]);
    useEffect(() => { if (!fulltext || !query.trim()) {
        setCopyResults([]);
        setCopyTotal(0);
        setCopyLoading(false);
        return;
    } let cancelled = false; setCopyLoading(true); const t = setTimeout(() => api((mirrorSearch ? 'portal/mirror-search?q=' : 'entries?q=') + encodeURIComponent(query) + '&offset=' + page * 30 + '&limit=30').then(d => { if (!cancelled) {
        setCopyResults(d.entries);
        setCopyTotal(d.total);
    } }).catch((e: any) => { if (!cancelled)
        setError(e.message); }).finally(() => { if (!cancelled)
        setCopyLoading(false); }), 300); return () => { cancelled = true; clearTimeout(t); }; }, [fulltext, mirrorSearch, query, page]);
    const catalog = overview?.repositories?.databas, pluginRepo = overview?.repositories?.plugins, documents: any[] = catalog?.documents || [];
    useEffect(() => { if (view !== 'favoriter')
        return; void documentBookmarks.reload(); let active = true; setGitSavedLoading(true); setGitSavedError(''); fetch('/api/story-status', { cache: 'no-store' }).then(async (r) => { const d: any = await r.json(); if (!r.ok)
        throw Error(d.error || 'GitHub-registret kunde inte hämtas.'); return d; }).then(d => { if (active)
        setGitSavedEntries(d.register?.entries || {}); }).catch(e => { if (active) {
        setGitSavedEntries({});
        setGitSavedError(e.message);
    } }).finally(() => { if (active)
        setGitSavedLoading(false); }); return () => { active = false; }; }, [view]);
    const [storyPosterRevision, refreshStoryPosters] = usePosterRevision();
    useEffect(() => { if (['favoriter', 'upptack', 'databas', 'sok', 'mysterier'].includes(view))
        void refreshStoryPosters(); }, [view]);
    const storyCards = storyList(documents);
    const savedStories = storyCards.filter((story: any) => gitSavedEntries[story.path]?.saved);
    const openStory = async (path: string) => { if (navigationBusyRef.current)
        return; if (registerDirtyRef.current && !window.confirm('Du har osparade ändringar. Lämna sidan och kasta dem?'))
        return; if(registerDirtyRef.current && !await discardRegisterDrafts()) return; rememberOrigin(); const origin = detailOrigin.current; go('berattelser'); detailOrigin.current = origin; setStoryInitialPath(path); };
    const remember = (d: any) => { const value = { path: d.path, repoKey: d.repoKey || 'databas', title: d.title || d.name, copyId: d.copyId }; setRecent(previous => { const next = [value, ...previous.filter(p => documentKey(p) !== documentKey(value))].slice(0, 8); try {
        localStorage.setItem('nexus-portal-recent', JSON.stringify(next));
    }
    catch { } return next; }); };
    const open = async (doc: any, repoKey = 'databas') => { const previousReader = reader ? { reader, scroll: window.scrollY } : null; if (!reader)
        readerScroll.current = window.scrollY; const request = ++readRequest.current; setReading(true); setNotice(''); try {
        const data = doc.copyId ? { ...await api('entries/' + doc.copyId), copyId: doc.copyId, source: 'copy', repoKey: 'databas', path: doc.path || null } : await api('portal/document?repo=' + encodeURIComponent(doc.repoKey || repoKey) + '&path=' + encodeURIComponent(doc.path));
        if (request === readRequest.current) {
            const value = { ...data, catalogEntry: doc };
            if (previousReader)
                readerStack.current.push(previousReader);
            setReader(value);
            remember(value);
            window.scrollTo(0, 0);
        }
    }
    catch (e: any) {
        if (request === readRequest.current) {
            setNoticeKind('error');
            setNotice(e.message);
        }
    }
    finally {
        if (request === readRequest.current)
            setReading(false);
    } };
    // Order: top overlay, pending/visible reader, expanded options, browse state, module.
    useBackHandler(150, () => { if (!inspect)
        return false; setInspect(null); return true; });
    useBackHandler(140, () => { if (!upload)
        return false; if (!sending)
        setUpload(false); return true; });
    useBackHandler(130, () => { if (!menu)
        return false; setMenu(false); return true; });
    useBackHandler(100, () => { if (!reader && !reading)
        return false; closeReader(); return true; });
    useBackHandler(80, () => { const expanded = Array.from(document.querySelectorAll<HTMLDetailsElement>('main details[open]')).reverse().find(item => item.getClientRects().length > 0); if (!expanded)
        return false; expanded.open = false; return true; });
    useBackHandler(50, () => { if (!dbBrowsing && !query && !topic && !page && !fulltext)
        return false; setDbBrowsing(false); setQuery(''); setTopic(''); setPage(0); setFulltext(false); setCopyResults([]); return true; });
    useBackHandler(10, () => { if (legacy) {
        setLegacy(false);
        return true;
    } if (view === 'hem')
        return false; if (registerDirtyRef.current) {
        if (!window.confirm('Du har osparade registerändringar. Lämna sidan och kasta dem?'))
            return true;
        void discardRegisterDrafts().then(ok => { if (ok) backToPrevious(); }); return true;
    } backToPrevious(); return true; });
    const toggleFavorite = async () => { if (!reader)
        return; const value = { path: reader.path || null, copyId: reader.copyId || null, repoKey: reader.repoKey || 'databas', title: reader.title }; const exists = favorites.some(f => documentKey(f) === documentKey(value)); await documentBookmarks.mark(value, !exists); };
    const beginUpload = () => { if (sending)
        return; setNotice(''); setUploadResults([]); setFiles([]); setUpload(true); };
    const send = async (e: React.FormEvent) => { e.preventDefault(); if (!files.length)
        return; setSending(true); setUploadResults([]); let done = 0; try {
        for (const f of files) {
            setUploadProgress(`${done + 1}/${files.length}: ${f.name}`);
            const key = f.name + '|' + f.size + '|' + f.lastModified;
            let id = uploadIds.current.get(f) || readSaved('nexus-pending-uploads').find((p: any) => p.key === key)?.id || crypto.randomUUID();
            uploadIds.current.set(f, id);
            try {
                const pending = readSaved('nexus-pending-uploads');
                if (!pending.some((p: any) => p.id === id))
                    localStorage.setItem('nexus-pending-uploads', JSON.stringify([...pending, { key, id }].slice(-100)));
            }
            catch { }
            const form = new FormData();
            form.set('uploadId', id);
            form.set('file', f);
            form.set('title', f.name);
            const result = await api('files', { method: 'POST', body: form });
            setUploadResults(previous => [...previous, { ...result, name: f.name }]);
            try {
                localStorage.setItem('nexus-pending-uploads', JSON.stringify(readSaved('nexus-pending-uploads').filter((p: any) => p.id !== id)));
            }
            catch { }
            done++;
        }
        setFiles([]);
    }
    catch (e: any) {
        setNoticeKind('error');
        setNotice(e.message);
        setFiles(files.slice(done));
    }
    finally {
        setSending(false);
        setUploadProgress('');
        load(true);
    } };
    const row = (d: any, key?: string) => { const check = d.path && mirrorChecks[d.path]; const issue = check && check.state !== 'same'; const storyImagePath = storyFromDocument(d)?.markdown; return <div className="entry-with-check" key={key || d.path || d.id || d.copyId}><button className="entry-row" onClick={() => open(d, d.repoKey || 'databas')}>{storyImagePath ? <span className="nh-story-row-cover"><RepositoryPoster kind="stories" posterKey={storyImagePath} revision={storyPosterRevision} alt={'Omslag för ' + (d.title || 'berättelsen')}><BookOpen size={24}/></RepositoryPoster></span> : <span className={'entry-icon ' + (d.module === 'mysterier' ? 'orange' : 'purple')}><MaterialIcon tone={d.module === 'mysterier' ? 'blue' : 'violet'} size={32}>{d.module === 'mysterier' ? <Eye size={20}/> : <FileText size={20}/>}</MaterialIcon></span>}<span className="entry-text"><strong>{d.title || d.name}</strong><small>{d.copyId ? 'Sparad kopia · ' : d.mirror ? (d.mirror.state === 'archived' ? 'Arkiverad spegel · ' : 'Spegel · ') : ''}{d.category || d.repoKey || 'GitHub'}{d.formats?.length > 1 ? ' · ' + d.formats.map((f: any) => f.format.toUpperCase()).join(' / ') : ''}</small>{d.summary && <p>{d.summary.slice(0, 180)}</p>}{check && <small className={'mirror-badge ' + check.state}>{check.state === 'same' ? '✓ Kopia matchar GitHub' : check.state === 'different' ? '↻ GitHub har en nyare version' : check.state === 'divergent' ? '⚠ Avvikelse i den lokala kopian' : check.state === 'missing' ? '○ Inte kopierad än' : check.state === 'archived' ? '▣ Borttagen från GitHub · kopia sparad' : check.state === 'github-missing' ? '— Saknas i GitHub' : '? Ej verifierad'}{check.checkedAt ? ' · kontrollerad ' + new Date(check.checkedAt).toLocaleString('sv-SE') : check.lastVerifiedAt ? ' · senast verifierad ' + new Date(check.lastVerifiedAt).toLocaleString('sv-SE') : ''}</small>}</span><ChevronRight size={17}/></button>{issue && d.path && <button className="mirror-row-inspect" onClick={() => setInspect({ path: d.path, title: d.title })}><AlertCircle size={16}/>Visa avvikelse <ChevronRight size={15}/></button>}</div>; };
    const chooseTopic = (t: any) => { go(t.module === 'nyheter' ? 'nyheter' : t.module === 'mysterier' ? 'berattelser' : t.module === 'verktyg' ? 'verktyg' : 'databas'); setTopic(t.name); if (t.module === 'databas')
        setDbBrowsing(true); };
    const chooseDatabaseCategory = (next: string) => { setTopic(next); setQuery(''); setPage(0); setDbBrowsing(true); setDbJump(n => n + 1); };
    const showDatabaseAll = () => { setTopic(''); setQuery(''); setPage(0); setDbBrowsing(true); setDbJump(n => n + 1); };
    const closeDatabaseBrowse = () => { setTopic(''); setQuery(''); setPage(0); setDbBrowsing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const openSettingsPanel = (id: string) => { const panel = document.getElementById(id) as HTMLDetailsElement | null; if (panel) {
        panel.open = true;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } };
    const sourceNote = <div className="info-note"><Network size={19}/><p>Katalogen visar aktuella poster från GitHub. Öppna en post för att kontrollera dess senaste version.</p></div>;
    const allVisible = filterCatalog(documents, { query, module: ['mysterier', 'nyheter', 'inkorg', 'verktyg'].includes(view) ? view : '', category: topic, technical: view === 'arkiv' || view === 'filer' }).filter((d: any) => view === 'arkiv' ? d.technical : view === 'databas' ? d.module === 'databas' : true);
    const displayed = allVisible.slice(page * 30, (page + 1) * 30), pages = Math.ceil((fulltext ? copyTotal : allVisible.length) / 30);
    useEffect(() => { const targets = (view === 'berattelser') ? storyList(documents).map((s: any) => s.path) : displayed.filter((d: any) => d.path && !d.technical).map((d: any) => d.path); const paths = [...new Set(targets)].slice(0, 40); if (!paths.length)
        return; let cancelled = false; api('portal/compare', { method: 'POST', body: JSON.stringify({ paths }) }).then(r => { if (!cancelled)
        setMirrorChecks(previous => ({ ...previous, ...Object.fromEntries(r.items.map((item: any) => [item.path, { ...item, checkedAt: r.checkedAt, commit: r.commit }])) })); }).catch(() => { }); return () => { cancelled = true; }; }, [page, view, overview, topic, query, fulltext]);
    const mirrorIssues = Object.entries(mirrorChecks).filter(([, item]: any) => item && item.state !== 'same').map(([path, item]: any) => ({ path, ...item }));
    const current = reader?.catalogEntry?.path ? documents.find((d: any) => d.path === reader.path) || reader.catalogEntry : null;
    const suggestions = current ? relatedSuggestions(current, documents) : [];
    const discovery = documents.filter((d: any) => !d.technical && !['inkorg', 'nyheter'].includes(d.module));
    const picks = discovery.filter((_, i) => i % Math.max(1, Math.floor(discovery.length / 8)) === shuffle % Math.max(1, Math.floor(discovery.length / 8))).slice(0, 8);
    const commits = [...(catalog?.recent || []).map((c: any) => ({ ...c, repo: 'Databas' })), ...(pluginRepo?.recent || []).map((c: any) => ({ ...c, repo: 'Plugins' }))].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 10);
    const pager = pages > 1 ? <div className="pagination"><button className="secondary" disabled={!page} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }}>Föregående</button><span>Sida {page + 1} av {pages}</span><button className="secondary" disabled={page + 1 >= pages} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }}>Nästa</button></div> : null;
    const searchbar = <div className="searchbar"><Search size={19}/><input type="search" aria-label="Sök i din kunskap" placeholder={view === 'plugins' ? 'Sök plugin…' : 'Sök i katalogen…'} value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/>{query && <button aria-label="Rensa" onClick={() => { setQuery(''); setPage(0); }}><X size={18}/></button>}</div>;
    if (legacy)
        return <div className="portal-shell nh-chroma-site nh-legacy-chroma"><NativeBackBridge /><MaterialDefinitions /><button className="primary legacy-return" onClick={() => { setLegacy(false); location.hash = 'hem'; }}>Till Nexus Hub</button><LegacyNexus /></div>;
    const pageTone = view === 'register' ? (registerKind === 'stories' ? 'blue' : 'violet') : ({filmer:'ruby',serier:'blue',berattelser:'blue',mysterier:'blue',databas:'blue',plugins:'pink',inkorg:'pink',favoriter:'pink',traning:'orange',ekonomi:'green',ideer:'orange',mottaget:'pink',attgora:'violet',filer:'green',sok:'green',upptack:'green',nyheter:'green',arkiv:'ruby'} as Record<string,string>)[view] || 'violet';
    return <div data-module-tone={pageTone} className={'app-shell portal-shell nh-chroma-site' + (view === 'hem' && !reader ? ' nh-locked-home' : '')}><NativeBackBridge /><MaterialDefinitions /><aside className="sidebar"><a className="brand" href="#hem" onClick={e => { e.preventDefault(); go('hem'); }}><NexusBrandMark /><span>NEXUS <b>HUB</b></span></a><p className="side-label">DIN KUNSKAP</p>{NAV.map(([id, label, I]) => <button key={id} className={'nav-item ' + (view === id ? 'active' : '')} aria-current={view === id ? 'page' : undefined} onClick={() => go(id)}><MaterialIcon tone={id === 'ideer' ? 'orange' : id === 'filmer' ? 'ruby' : id === 'berattelser' ? 'blue' : id === 'plugins' || id === 'mottaget' ? 'pink' : id === 'databas' || id === 'serier' ? 'blue' : id === 'ekonomi' || id === 'filer' || id === 'verktyg' || id === 'upptack' ? 'green' : 'violet'} size={28}><I size={19}/></MaterialIcon>{label}</button>)}<button className="nav-item" onClick={() => go('inkorg')}><Inbox size={19}/>Inkorg<span className="nav-count">{documents.filter((d: any) => d.module === 'inkorg' && !d.path.endsWith('.gitkeep')).length}</span></button><div className="sidebar-bottom"><button className="nav-item" onClick={beginUpload}><Upload size={19}/>Bifoga dokument</button><button className="nav-item" onClick={() => go('installningar')}><Settings size={19}/>Inställningar & system</button><div className="private-note"><ShieldCheck size={18}/><span>GitHub är huvudkälla<small>ChatGPT sköter bearbetningen</small></span></div></div></aside>
 <div className="workspace"><header className="topbar"><a className="brand mobile-brand" href="#hem" onClick={e => { e.preventDefault(); go('hem'); }}><NexusBrandMark /><span>NEXUS <b>HUB</b></span></a><div className="breadcrumb desktop-only">Din kunskap <ChevronRight size={14}/>{reader ? 'Dokument' : labels[view]}</div><div className="header-actions"><span className="private-pill"><span />Privat</span><button className="icon-button hub-top-search" aria-label="Sök i Nexus Hub" onClick={() => go('sok')}><Search size={19}/></button><button className="icon-button" aria-label="Uppdatera från GitHub" disabled={loading || reading} onClick={() => { if (reader) void open(reader); else { void load(true); if (view === 'ideer' || view === 'hem') void ideas.reload(); window.dispatchEvent(new CustomEvent('nexus-refresh-module', {detail:{view}})); } }}><RefreshCw size={19} className={loading ? 'spin' : ''}/></button><button className="icon-button" aria-label="Öppna meny" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={22}/></button></div></header>
 <main>{error && <div className="error-banner"><AlertCircle size={18}/><span>{error}{overview ? ' Tidigare katalog visas tills uppdateringen fungerar.' : ''}</span><button onClick={() => load(true)}>Försök igen</button></div>}{notice && <div className={'hub-notice ' + noticeKind} role={noticeKind === 'error' ? 'alert' : 'status'}>{noticeKind === 'success' ? <ShieldCheck size={19}/> : <AlertCircle size={19}/>}<span>{notice}</span><button aria-label="Stäng meddelande" onClick={() => setNotice('')}><X size={18}/></button></div>}
 {reading ? <div className="panel loading"><Loader2 className="spin"/>Öppnar innehållet…</div> : reader ? <>
 <div className="reader-toolbar"><button className="text-button" onClick={closeReader}><ArrowLeft size={18}/>Tillbaka</button><button className="icon-button" aria-label="Spara dokumentgenväg i GitHub" disabled={documentBookmarks.busy || documentBookmarks.loading} onClick={toggleFavorite}><Bookmark size={21} fill={favorites.some(f => documentKey(f) === documentKey(reader)) ? 'currentColor' : 'none'}/></button></div>
 <article className="reader"><p className="eyebrow">{reader.source === 'copy' ? 'SPARAD KOPIA' : reader.repoKey === 'plugins' ? 'PLUGIN · FRÅN GITHUB' : 'DIREKT FRÅN GITHUB'}</p><h1>{reader.title}</h1><p className="muted break">{reader.category || reader.repo} · {reader.path || reader.source_path}</p>
 {reader.source === 'copy' && <div className="info-note"><Archive size={19}/><p>Det här är sparat innehåll i Nexus Hub. Det kan skilja sig från dagens GitHub-version.</p>{reader.source_path && <button className="text-button" onClick={() => open({ path: reader.source_path })}>Läs aktuell version</button>}</div>}
 {reader.manifest && <div className="panel settings-panel"><h2>Om pluginet</h2><p>{reader.manifest.description}</p><p>Version i manifestet: {reader.manifest.version || 'Ej angiven'}</p><p className="muted">Katalogen kör eller installerar inte pluginet.</p></div>}

 {!reader.body && reader.commit && /\.(png|jpe?g|webp|gif|avif)$/i.test(reader.name || reader.path || '') ? <LocalImage alt={reader.title || 'Originalbild'} style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '20px auto' }} src={'/api/portal/original?inline=1&repo=' + encodeURIComponent(reader.repoKey || 'databas') + '&path=' + encodeURIComponent(reader.path) + '&ref=' + reader.commit + '&blob=' + (reader.sha || '')}/> : reader.body && !reader.manifest ? <><div className="reader-controls"><details><summary>Innehåll</summary><nav>{reader.body.split('\n').map((line: string, i: number) => /^#{1,6}\s/.test(line) ? <a key={i} href={'#heading-' + i}>{line.replace(/^#+\s/, '')}</a> : null)}</nav></details><div><button aria-label="Mindre text" onClick={() => setFont(Math.max(15, font - 1))}>A−</button><button aria-label="Större text" onClick={() => setFont(Math.min(25, font + 1))}>A+</button></div></div><div className="prose" style={{ fontSize: font }}><Markdown text={reader.body}/></div></> : !reader.manifest ? <div className="panel empty"><FileText size={32}/><h3>Originalfilen är läskällan</h3><p>PDF kan öppnas direkt. Word och andra original kan laddas ned. Text över 1 MB visas som originalfil.</p></div> : null}
 {current?.formats?.length > 1 && reader.source !== 'copy' && <section className="reader-section"><h2>Välj filformat</h2><div className="portal-actions">{current.formats.map((f: any) => <button className="secondary" disabled={f.path === reader.path} key={f.path} onClick={() => open({ ...current, path: f.path })}>{f.format.toUpperCase()} · {bytes(f.size)}{f.path === reader.path ? ' · öppet' : ''}</button>)}</div></section>}
 {reader.source !== 'copy' && reader.commit && <div className="portal-actions"><a className="secondary" href={'/api/portal/original?repo=' + encodeURIComponent(reader.repoKey) + '&path=' + encodeURIComponent(reader.path) + '&ref=' + reader.commit + '&blob=' + (reader.sha || '')}><Download size={17}/>Ladda ned original</a>{/\.pdf$/i.test(reader.name) && <a className="primary" target="_blank" rel="noopener noreferrer" href={'/api/portal/original?inline=1&repo=' + encodeURIComponent(reader.repoKey) + '&path=' + encodeURIComponent(reader.path) + '&ref=' + reader.commit + '&blob=' + (reader.sha || '')}><BookOpen size={17}/>Öppna PDF</a>}<a className="text-button" href={reader.url || 'https://github.com/lobbamannen/Databas'} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Visa i GitHub</a></div>}
 {reader.files?.length > 0 && <section className="reader-section"><h2>Bevarade bilagor</h2>{reader.files.map((f: any) => <a key={f.id} className="attachment" href={'/api/files/' + f.id}><FileText size={18}/><span>{f.name}<small>{bytes(f.size)}</small></span><Download size={18}/></a>)}</section>}
 {reader.repoKey === 'plugins' && <section className="reader-section"><h2>Arbetsflöden</h2><p className="muted">Läs instruktionerna för ett arbetsflöde. Ändringar görs via ChatGPT.</p>{pluginRepo?.packages?.find((p: any) => reader.path.startsWith(p.sourcePath + '/'))?.skills?.map((path: string) => <button className="entry-row" key={path} onClick={() => open({ path, repoKey: 'plugins' })}><MaterialIcon tone="pink" size={32}><BookOpen size={21}/></MaterialIcon><span className="entry-text"><strong>{path.split('/').slice(-2, -1)[0].replace(/-/g, ' ')}</strong><small className="break">{path}</small></span><ChevronRight size={16}/></button>)}</section>}
 {reader.manifest?.raw && <details className="panel settings-panel nh-plugin-technical"><summary>Tekniska detaljer · manifest</summary><div className="prose"><Markdown text={'```json\n' + JSON.stringify(reader.manifest.raw, null, 2) + '\n```'}/></div></details>}
 {reader.repoKey === 'plugins' && <details className="panel settings-panel"><summary>Alla filer i pluginpaketet</summary>{pluginRepo?.packages?.find((p: any) => reader.path.startsWith(p.sourcePath + '/'))?.files?.map(({ path }: any) => <button className="entry-row" key={path} onClick={() => open({ path, repoKey: 'plugins' })}><FileText size={18}/><span className="entry-text break">{path}</span><ChevronRight size={16}/></button>)}</details>}
 {reader.related?.length > 0 && <section className="reader-section"><h2>Registrerade kopplingar</h2><p className="muted small">Källan framgår vid varje koppling: aktuellt ämnesregister i GitHub eller sparad lokal koppling.</p>{reader.related.map((r: any, i: number) => <button className="entry-row" key={i} onClick={() => r.path && open({ path: r.path })}><LinkLabel /><span>{r.title}<small>{r.type} · {r.note}</small></span></button>)}</section>}
 {suggestions.length > 0 && <section className="reader-section"><h2>Du kanske också vill läsa</h2><p className="muted">Förslag efter gemensamma ord och ämne. De är inte verifierade faktasamband.</p>{suggestions.map((d: any) => <div key={d.path}>{row(d)}<p className="suggestion-reason">{d.reason}</p></div>)}</section>}
 {documentBookmarks.error && <p className="error-banner" role="alert">{documentBookmarks.error}</p>}{reader.textWarning && <div className="info-note">{reader.textWarning}</div>}{reader.mirror && <div className={reader.mirror.state === 'verified' ? 'info-note' : 'error-banner'}><p>Original kontrollerat: {reader.mirror.verifiedAt ? new Date(reader.mirror.verifiedAt).toLocaleString('sv-SE') : 'inte omverifierat sedan import'}. {reader.mirror.checkedAt && 'GitHub kontrollerat: ' + new Date(reader.mirror.checkedAt).toLocaleString('sv-SE') + '.'} {reader.mirror.repaired && 'En avvikande lokal kopia reparerades från GitHub. '}{reader.mirror.error}</p></div>}<section className="source-info"><ShieldCheck size={18}/><div><strong>{reader.source === 'copy' ? 'Sparad kopia' : reader.mirror?.state === 'archived' ? 'Arkiverad lokal version' : reader.mirror?.state === 'stale' ? 'Äldre lokal reserv – GitHub kunde inte verifieras' : reader.mirror ? 'Lokal spegel – GitHub-version verifierad' : 'Aktuellt innehåll från GitHub'}</strong><small className="break">{reader.path || reader.source_path}</small><small className="break">Commit: {reader.commit || reader.source_sha || 'Ej registrerad'}</small>{reader.sha && <small className="break">Filhash: {reader.sha}</small>}<small>{reader.fetchedAt ? new Date(reader.fetchedAt).toLocaleString('sv-SE') : 'Kopian uppdateras inte automatiskt.'}</small></div></section>
 </article></> : view === 'berattelser' ? <Stories onOpenRegister={() => { setRegisterKind('stories'); go('register'); }} onExitRead={detailOrigin.current ? returnFromDetail : undefined} onDirtyChange={setRegisterDirty} documents={documents} onNavigate={go} onRefresh={() => load(true)} loading={loading} initialCategory={topic} initialPath={storyInitialPath} mirrorChecks={mirrorChecks} onInspect={(path, title) => setInspect({ path, title })}/> : view === 'villse' ? <WatchlistOverview onNavigate={go} onOpenMedia={openMedia}/> : view === 'traning' ? <section className="nh-training-placeholder" aria-labelledby="nh-training-heading"><button type="button" className="text-button" onClick={() => backToPrevious('hem')}><ArrowLeft size={18}/>Tillbaka</button><div className="page-heading"><MaterialIcon tone="orange" size={54}><Dumbbell size={32}/></MaterialIcon><div><p className="eyebrow">NEXUS HUB · CORTEX</p><h1 id="nh-training-heading">Träning</h1></div></div></section> : view === 'mottaget' ? <IncomingInbox ideas={ideas}/> : view === 'attgora' ? <TodoList/> : view === 'ideer' ? <IdeasInbox ideas={ideas} onOpenPlan={path => void open({path,repoKey:'databas'})}/> : view === 'hem' ? <HomeDashboard ideaEntries={ideas.numbering.entries} ideaCount={ideas.ready && (!ideas.loading || ideas.items.length > 0) && (!ideas.error || ideas.items.length > 0) ? ideas.items.filter(row => row.idea.status === 'new').length : null} ideasStale={ideas.stale} catalog={catalog} pluginRepo={pluginRepo} stories={storyCards} recentFiles={recent} commits={commits} onNavigate={go} onOpenMedia={openMedia} onOpenStory={openStory} onOpenFile={d => open(d, d.repoKey || 'databas')}/> : view === 'ekonomi' ? <Economy onDirtyChange={setRegisterDirty}/> : (view === 'filmer' || view === 'serier') ? <><nav className="media-switch" aria-label="Film- och seriebibliotek"><button type="button" className={view === 'filmer' ? 'selected' : ''} aria-current={view === 'filmer' ? 'page' : undefined} onClick={() => go('filmer')}><Clapperboard size={19}/>Filmer</button><button type="button" className={view === 'serier' ? 'selected' : ''} aria-current={view === 'serier' ? 'page' : undefined} onClick={() => go('serier')}><Tv size={19}/>Serier</button></nav><button type="button" className="nh-register-shortcut" onClick={() => { setRegisterKind(view === 'serier' ? 'series' : 'films'); go('register'); }}><MaterialIcon tone="violet" size={38}><LibraryBig size={25}/></MaterialIcon><span className="nh-register-shortcut-copy"><strong>Register</strong><small>Filmer, serier & berättelser · Redigera och spara</small></span><ChevronRight size={19}/></button>{view === 'filmer' ? <Films onDirtyChange={setRegisterDirty} initialItem={mediaItem} onExitDetail={detailOrigin.current ? returnFromDetail : undefined}/> : <Series initialItem={mediaItem} onExitDetail={detailOrigin.current ? returnFromDetail : undefined}/>}</> : view === 'register' ? <><div className="nh-register-switch nh-unified-register-tabs" role="group" aria-label="Välj register">{([['films', 'Filmer', Clapperboard], ['series', 'Serier', Tv], ['stories', 'Berättelser', BookOpen]] as const).map(([kind, label, Icon]) => <button type="button" key={kind} aria-pressed={registerKind === kind} className={registerKind === kind ? 'active' : ''} onClick={async () => { if (registerKind === kind)
            return; if (registerKind === 'stories' || kind === 'stories') {
            if (registerDirtyRef.current && !window.confirm('Du har osparade ändringar. Byt register och kasta dem?'))
                return;
            if (!await discardRegisterDrafts()) return;
        } setRegisterKind(kind); window.scrollTo(0, 0); }}><Icon size={18}/>{label}</button>)}</div>{registerKind === 'stories' ? <Stories initialRegister onRegisterBack={async () => { if (!await discardRegisterDrafts()) return; backToPrevious('berattelser'); }} documents={documents} onNavigate={go} onRefresh={() => load(true)} loading={loading} mirrorChecks={mirrorChecks} onInspect={(path, title) => setInspect({ path, title })} onDirtyChange={setRegisterDirty}/> : <MediaRegister selectedKind={registerKind} hideSwitcher onDirtyChange={setRegisterDirty}/>}</> : view === 'plugins' ? <>
 <Heading title="Dina plugin" text="Utforska funktioner, paket och aktuella instruktioner i plugin-repot." icon={<Puzzle />} tone="pink"/>{searchbar}<label className="portal-toggle"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Visa även arkiverade och äldre paket</label>
 {pluginRepo ? <><p className="portal-source">Källa: GitHub · ChatGPT-Plugin. Versionsnummer läses ur aktuella paketmanifest; faktiskt installerat tillstånd i ChatGPT kontrolleras inte här.</p><div className="hub-plugin-summary"><span><Puzzle size={17}/><strong>{pluginRepo.packages.filter((p: any) => !p.archived && !p.legacy).length}</strong> aktiva paket</span><span><Layers size={17}/><strong>{pluginRepo.packages.filter((p: any) => !p.archived && !p.legacy).reduce((n: number, p: any) => n + p.skills.length, 0)}</strong> arbetsflöden</span></div><div className="hub-plugin-grid">{pluginRepo.packages.filter((p: any) => (showArchived || !p.archived && !p.legacy) && [p.title, p.name, p.description].join(' ').toLowerCase().includes(query.toLowerCase())).map((p: any, index: number) => <button className="hub-plugin-card" key={p.path} onClick={() => open(p, 'plugins')}><span className="hub-plugin-card-header"><span className="hub-plugin-icon"><MaterialIcon tone="pink" size={44}><Puzzle size={27} strokeWidth={1.6}/></MaterialIcon></span><span className="hub-plugin-card-tag">{p.archived ? 'ARKIVERAT' : p.legacy ? 'ÄLDRE' : 'PLUGIN'}</span></span><span className="hub-plugin-watermark"><Puzzle size={112} strokeWidth={.8}/></span><strong>{p.title}</strong><span className="hub-plugin-subtitle">{p.skills.length} {p.skills.length === 1 ? 'arbetsflöde' : 'arbetsflöden'}{p.version ? ' · v' + p.version : ''}</span><span className="hub-plugin-card-footer">Utforska paketet <ArrowRight size={16}/></span></button>)}</div>{!pluginRepo.packages.some((p: any) => (showArchived || !p.archived && !p.legacy) && [p.title, p.name, p.description].join(' ').toLowerCase().includes(query.toLowerCase())) && <div className="hub-empty"><Puzzle size={30}/><strong>Inga plugin matchar</strong><p>Prova ett annat namn eller visa äldre paket.</p><button className="secondary" onClick={() => { setQuery(''); setShowArchived(true); }}>Visa alla paket</button></div>}<section className="hub-plugin-explorer"><div className="section-heading hub-section-heading"><div><span className="hub-section-kicker">FILSTRUKTUR</span><h2>Utforska plugin-repot</h2><p>Bläddra i den aktuella mappstrukturen utan att ändra originalfilerna.</p></div></div><PluginFiles files={pluginRepo.files || []} onOpen={(path: string) => open({ path, repoKey: 'plugins' })}/></section></> : loading && !overview ? <div className="hub-loading-state"><Loader2 className="spin" size={24}/><span>Hämtar pluginpaket från GitHub…</span></div> : <div className="error-banner"><AlertCircle size={18}/><span>Plugin-repot kunde inte läsas. {overview?.errors?.find((e: any) => e.repo === 'plugins')?.error}</span><button className="secondary" onClick={() => load(true)}>Försök igen</button></div>}
 </> : view === 'inkorg' ? <>
 <Heading title="Inkorg" text="Samla nytt material på ett ställe. GitHub är den långsiktiga källan." icon={<Inbox />} tone="pink"/><section className="hub-inbox-drop"><div className="hub-inbox-drop-icon"><Upload size={28}/></div><div><span className="hub-section-kicker">NYTT MATERIAL</span><h2>Har du något att lägga till?</h2><p>Lägg till dokument från mobilen eller Google Drive via mobilens filväljare. De sparas först i Nexus Hub och kan överföras till GitHubs inkorg.</p></div><button className="primary" onClick={beginUpload}><Plus size={17}/>Välj dokument</button></section><section className="portal-section"><h2>Väntar i GitHub</h2><p className="muted">Aktuella filer i Databas/00-Inkorg/.</p><div className="panel">{documents.filter((d: any) => d.module === 'inkorg' && !d.path.endsWith('.gitkeep')).map((d: any) => row(d))}{!documents.some((d: any) => d.module === 'inkorg' && !d.path.endsWith('.gitkeep')) && <p className="history-note">GitHub-inkorgen är tom.</p>}</div></section><section className="portal-section"><h2>Dina uppladdningar</h2><div className="panel">{inbox.flatMap(e => (e.files || []).filter((f: any) => f.origin === 'local').map((f: any) => <div className="attachment portal-upload-row" key={f.id}><FileText size={20}/><span><strong>{f.name}</strong><small>{f.github_status?.state === 'sent' ? (documents.some((d: any) => d.path === f.github_status.path) ? 'Mottagen av GitHub · väntar i inkorgen' : 'Mottagen av GitHub · finns inte längre i inkorgens aktuella lista') : 'Sparad i Nexus Hub · överföring väntar'}</small>{f.github_status?.error && <small>{f.github_status.error}</small>}{f.github_status?.state !== 'sent' && <button className="secondary" disabled={sending} onClick={async () => { setSending(true); try {
            const r = await api('files/' + f.id + '/github', { method: 'POST' });
            setNoticeKind(r.state === 'sent' ? 'success' : 'error');
            setNotice(r.state === 'sent' ? 'Filen är mottagen av GitHub.' : r.error);
            const status = await api('portal/inbox?offset=' + inboxOffset);
            setInbox(status.entries);
            setInboxTotal(status.total);
            load(true);
        }
        catch (e: any) {
            setNoticeKind('error');
            setNotice(e.message);
        }
        finally {
            setSending(false);
        } }}>Försök överföra igen</button>}</span><button className="icon-button" aria-label="Läs sparad uppladdning" onClick={() => open({ copyId: e.id })}><BookOpen size={19}/></button></div>))}{!inbox.length && <p className="history-note">Inga egna uppladdningar registrerade i den lokala inkorgen.</p>}</div></section>
 {inboxTotal > 100 && <div className="pagination"><button className="secondary" disabled={!inboxOffset} onClick={() => setInboxOffset(Math.max(0, inboxOffset - 100))}>Nyare uppladdningar</button><span>{inboxOffset + 1}–{Math.min(inboxOffset + 100, inboxTotal)} av {inboxTotal}</span><button className="secondary" disabled={inboxOffset + 100 >= inboxTotal} onClick={() => setInboxOffset(inboxOffset + 100)}>Äldre uppladdningar</button></div>}
 </> : view === 'upptack' ? <>
 <Heading title="Upptäck din kunskap" text="En ingång till sådant du kanske inte kommer ihåg att du sparat." icon={<Network />} tone="green"/><div className="hub-discovery-banner"><div className="hub-discovery-glow"/><span className="hub-section-kicker">NYA PERSPEKTIV</span><h2>Det du redan har sparat<br /><em>kan överraska dig igen.</em></h2><p>Vi visar ett urval av faktiskt registrerat material, inte påhittade rekommendationer.</p><button className="secondary" onClick={() => setShuffle(n => n + 1)}><RefreshCw size={16}/>Visa ett annat urval</button></div><div className="section-heading hub-section-heading"><div><span className="hub-section-kicker">UR ARKIVET</span><h2>Återupptäck</h2><p>Välj ett dokument för att läsa originalet.</p></div></div><div className="hub-discovery-grid">{picks.map((d: any, index: number) => <button key={d.path} className="hub-discovery-card" onClick={() => d.path?.startsWith('Berattelser/') && d.path.endsWith('.md') ? openStory(d.path) : open(d)}>{d.path?.startsWith('Berattelser/') && d.path.endsWith('.md') ? <span className="hub-discovery-story-cover"><RepositoryPoster kind="stories" posterKey={d.path} revision={storyPosterRevision} alt={'Omslag för ' + d.title}><span className="hub-discovery-cover-fallback"><BookOpen size={29}/></span></RepositoryPoster></span> : <span className={'hub-discovery-icon ' + (d.module === 'mysterier' ? 'orange' : d.module === 'verktyg' ? 'blue' : 'purple')}><MaterialIcon tone={d.module === 'mysterier' ? 'blue' : d.module === 'verktyg' ? 'blue' : 'violet'} size={38}>{d.module === 'mysterier' ? <Eye size={24}/> : d.module === 'verktyg' ? <Wrench size={24}/> : <BookOpen size={24}/>}</MaterialIcon></span>}<span className="hub-discovery-index">{String(index + 1).padStart(2, '0')}</span><small>{d.category || d.module}</small><strong>{d.title}</strong><span className="hub-discovery-link">Öppna original <ArrowRight size={15}/></span></button>)}</div>{picks.length === 0 && (loading && !catalog ? <Loading /> : <div className="hub-empty"><Network size={28}/><strong>Inga dokument att visa ännu</strong><p>Katalogen laddas från GitHub. Försök uppdatera när den är tillgänglig.</p><button className="secondary" onClick={() => load(true)}>Uppdatera katalog</button></div>)}<section className="portal-section"><div className="section-heading hub-section-heading"><div><span className="hub-section-kicker">BLÄDDRA</span><h2>Utforska ett ämne</h2></div></div><div className="category-grid hub-category-grid">{catalog?.topics?.map((t: any) => <button key={t.module + t.name} onClick={() => chooseTopic(t)}><span className="entry-icon purple"><MaterialIcon tone="violet" size={38}><Folder size={20}/></MaterialIcon></span><span><strong>{t.name}</strong><small>{t.count} poster</small></span><ChevronRight size={17}/></button>)}</div></section><p className="hub-fineprint">Likheter och tips bygger på kataloguppgifter – de innebär inte automatiskt verifierade kunskapsrelationer.</p>
 </> : view === 'favoriter' ? <>{documentBookmarks.loading && <Loading />}{documentBookmarks.error && <div className="error-banner" role="alert">{documentBookmarks.error}<button className="secondary" onClick={documentBookmarks.reload}>Försök igen</button></div>}<Heading title="Sparade" text="Berättelser och dokumentgenvägar sparas i Databas på GitHub." icon={<Bookmark />} tone="pink"/><section className="portal-section"><h2>Berättelser sparade i GitHub</h2>{gitSavedError && <p className="error-banner">{gitSavedError}</p>}<div className="panel">{gitSavedLoading ? <Loading /> : savedStories.length ? savedStories.map((story: any) => <button className="entry-row" key={story.path} onClick={() => openStory(story.path)}><span className="nh-story-row-cover"><RepositoryPoster kind="stories" posterKey={story.path} revision={storyPosterRevision} alt={'Omslag för ' + story.title}><BookOpen size={24}/></RepositoryPoster></span><span className="entry-text"><strong>{story.title}</strong><small>{story.category} · {gitSavedEntries[story.path]?.read ? "Läst" : "Inte markerad som läst"} · Synkad via GitHub</small></span><ChevronRight size={18}/></button>) : <p className="history-note">{gitSavedError ? "Sparade berättelser kan inte verifieras just nu." : "Inga berättelser sparade i GitHub ännu."}</p>}</div></section><section className="portal-section"><h2>Dokument sparade i GitHub</h2><div className="panel">{favorites.filter((d: any) => !gitSavedEntries[d.path]?.saved).length ? favorites.filter((d: any) => !gitSavedEntries[d.path]?.saved).map((d: any) => row(d, documentKey(d))) : <p className="history-note">Inga dokumentgenvägar sparade i GitHub ännu.</p>}</div></section></> : view === 'installningar' ? <>
 <SettingsOverview catalogCommit={catalog?.commit} mirrorCommit={replica.repositories.databas?.commit||mirror?.commit} mirrorTotal={replica.repositories.databas?.total??mirror?.totalFiles} fileCount={catalog?.fileCount} verifiedFiles={replica.repositories.databas?.done??mirror?.verifiedFiles} pending={replica.repositories.databas?replica.repositories.databas.total-replica.repositories.databas.done:mirror?.pending} verifiedAt={replica.repositories.databas?.checkedAt||mirror?.lastTreeVerifiedAt} onOpenAudit={() => openSettingsPanel('nh-audit-section')} onOpenSync={() => openSettingsPanel('nh-android-settings')}/>
 <AndroidSettings/>
 <details id="nh-audit-section" className="nh-settings-section"><summary><ShieldCheck size={22}/><span><strong>Fullständig integritetskontroll</strong><small>Kontrollera faktiska lokala filbytes och upptäck skadade eller saknade filer.</small></span><ChevronDown size={18} className="nh-details-chevron"/></summary><MirrorAudit /></details>
 <details id="nh-sync-section" className="nh-settings-section"><summary><Wrench size={22}/><span><strong>Avancerat & versionshistorik</strong><small>Avvikelser och äldre lokala kopior.</small></span><ChevronDown size={18} className="nh-details-chevron"/></summary><div className="panel settings-panel"><h2>Bevarade versioner</h2><p>Ändrade GitHub-filer sparas som nya lokala versioner. Äldre kopior och filer som försvunnit från GitHub behålls. Väntande egna ändringar skickas endast när du väljer att spara eller försöka igen.</p><p>{mirror ? `${mirror.versions} bevarade versioner · ${bytes(mirror.storedVersionBytes||0)} · ${mirror.archivedPaths} arkiverade sökvägar.` : 'Läser versionshistorik…'}</p><button className="secondary" onClick={() => loadDifferences(0)}>Visa filer som skiljer sig</button>{mirrorIssues.length > 0 && <section className="portal-section"><h2>Avvikelser som upptäckts vid dokumentkontroll</h2><p className="muted">Dessa kontroller är gjorda på dokument som visats i Nexus Hub. Därför kan listan även innehålla skadade lokala original som inte fångas av översikten ovan.</p><div className="mirror-alert-toolbar"><button onClick={() => setInspect({ path: mirrorIssues[0].path, title: mirrorIssues[0].path.split('/').pop() })}><AlertCircle size={16}/>Visa avvikelser ({mirrorIssues.length})</button></div><div className="panel">{mirrorIssues.map((item: any) => <button className="entry-row" key={item.path} onClick={() => setInspect({ path: item.path, title: item.path.split('/').pop() })}><AlertCircle size={17}/><span className="entry-text"><strong>{item.path.split('/').pop()}</strong><small>{item.state} · Tryck för detaljer och ny kontroll</small></span><ChevronRight size={16}/></button>)}</div></section>}{differences && <section className="portal-section"><p className="muted">GitHub-commit {differences.commit?.slice(0, 12)} · {differences.checkedAt ? 'livekontrollerad ' + new Date(differences.checkedAt).toLocaleString('sv-SE') : 'Ej verifierad' + (differences.lastVerifiedAt ? ' · senast inventerad ' + new Date(differences.lastVerifiedAt).toLocaleString('sv-SE') : '')}.</p><div className="panel">{differences.items.map((item: any) => <div className="entry-row" key={item.path}><AlertCircle size={18}/><span className="entry-text break"><strong>{item.state === 'missing' ? 'Inte kopierad' : item.state === 'different' ? 'GitHub har en nyare version' : item.state === 'divergent' ? 'Avvikelse i lokal kontrollsumma' : item.state === 'unknown' ? 'Ej verifierad' : 'Borttagen från GitHub'}</strong><small>{item.path}</small><small>GitHub: {item.githubSha || 'okänd'} · Nexus: {item.mirrorSha || 'saknas'}</small></span></div>)}{!differences.items.length && <p className="history-note">Alla aktuella GitHub-filer har en matchande spegelversion.</p>}</div>{differences.total > 30 && <div className="pagination"><button className="secondary" disabled={!differencePage} onClick={() => loadDifferences(Math.max(0, differencePage - 30))}>Föregående</button><span>{differencePage + 1}–{Math.min(differencePage + 30, differences.total)} av {differences.total}</span><button className="secondary" disabled={differencePage + 30 >= differences.total} onClick={() => loadDifferences(differencePage + 30)}>Nästa</button></div>}</section>}<details><summary>Äldre lokal administration</summary><p>Äldre importer och metadata finns kvar. Exporten här innehåller inte hela GitHub-kopian.</p><button className="secondary" onClick={() => setLegacy(true)}><Archive size={18}/>Öppna äldre administration</button></details></div></details>
 <details className="nh-settings-section"><summary><ShieldCheck size={22}/><span><strong>Om NexusHub & bildkällor</strong><small>Android-app, datalagring och bildkällor.</small></span><ChevronDown size={18} className="nh-details-chevron"/></summary><div className="panel settings-panel"><p>NexusHub lagrar hela Databas och ChatGPT-Plugin lokalt på telefonen och synkroniserar med GitHub. Ingen separat backend eller AI-API används. Token, utkast och lokala filer bevaras när en ny APK installeras över den gamla.</p><p>Automatisk hämtning körs medan appen är öppen och återupptas när du kommer tillbaka. Kunskapsdokument och plugininstruktioner läses från GitHub; appens register redigeras med versionsskydd.</p><a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer"><img src="/tmdb-logo.svg" alt="The Movie Database (TMDB)" style={{width:150,height:'auto'}}/></a><p>This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p><p>Affischer sparas i det privata GitHub-biblioteket.</p></div></details>
 </> : view === 'databas' ? <>
 <DatabaseOverview documents={documents} fileCount={catalog?.fileCount} fetchedAt={catalog?.fetchedAt} complete={catalog?.complete} loading={loading} selectedCategory={topic} onSelectCategory={chooseDatabaseCategory} toolbar={<DiscoveryToolbar query={query} onQuery={value => { setQuery(value); setPage(0); if (value.trim())
            setDbBrowsing(true); }} placeholder="Sök efter ämne, dokument eller metod…" browsing={dbBrowsing || !!topic || !!query.trim()} onShowAll={showDatabaseAll} onClose={closeDatabaseBrowse} showAllLabel={'Visa alla ' + allVisible.length + ' dokument'} secondary={<span className="nh-discovery-small-note"><Network size={15}/>Från din aktuella GitHub-katalog</span>}/>}/>
 {(dbBrowsing || !!topic || !!query.trim()) && <div className="nh-discovery-results" id="nh-database-results">
  <div className="section-heading hub-results-heading"><div><span className="hub-section-kicker">KATALOGEN</span><h2>{allVisible.length.toLocaleString('sv-SE')} {topic ? 'poster i ' + topic : 'dokument'}</h2></div>{(query || topic) && <button className="hub-inline-link" onClick={showDatabaseAll}>Rensa filter <X size={16}/></button>}</div>
  <div className="panel nh-database-results">{loading && !overview ? <Loading /> : displayed.length ? displayed.map((d: any) => row(d)) : <div className="hub-empty hub-results-empty"><Search size={31}/><strong>Inga dokument matchar</strong><p>Testa andra sökord eller välj en annan kategori.</p><button className="secondary" onClick={showDatabaseAll}>Visa alla dokument</button></div>}</div>{pager}
 </div>}
 </> : <>
 <Heading title={labels[view] || 'Databas'} text={view === 'sok' ? 'Sök bland filmer, serier, berättelser, kunskap och plugins.' : view === 'filer' ? 'Alla GitHub-filer, inklusive bilder, register och tekniska resurser. Flera dokumentformat kan visas på samma rad.' : view === 'arkiv' ? 'Tekniska filer och historiskt material, separat från ditt läsbibliotek.' : view === 'nyheter' ? 'Ditt sparade nyhetsmaterial från GitHub.' : 'Utforska vad som finns i GitHub-databasen.'} icon={view === 'filer' ? <FolderOpen /> : view === 'sok' ? <Search /> : view === 'nyheter' ? <FileText /> : view === 'arkiv' ? <Archive /> : <Layers />} tone={view === 'arkiv' ? 'orange' : view === 'filer' || view === 'sok' ? 'green' : view === 'nyheter' ? 'green' : 'purple'}/>{searchbar}
 {view === 'sok' && <div className="segmented portal-search-modes"><button className={!fulltext ? 'active' : ''} onClick={() => { setFulltext(false); setMirrorSearch(false); setPage(0); }}>Aktuell katalog</button><button className={fulltext && mirrorSearch ? 'active' : ''} onClick={() => { setFulltext(true); setMirrorSearch(true); setPage(0); }}>Text i spegeln</button><button className={fulltext && !mirrorSearch ? 'active' : ''} onClick={() => { setFulltext(true); setMirrorSearch(false); setPage(0); }}>Äldre kopior</button></div>}
 {view === 'sok' && !fulltext ? <GlobalSearch query={query} documents={documents} pluginRepo={pluginRepo} revision={catalog?.fetchedAt} loading={loading} onOpen={open} onOpenMedia={openMedia} onOpenStory={openStory}/> : fulltext ? <><div className="info-note"><Archive size={19}/><p>{mirrorSearch ? 'Söker i indexerade spegelversioner (text under 350 kB). Aktualitet gäller senaste GitHub-inventering; arkiverade träffar märks. Öppna för ny kontroll. Resultaten visas 30 åt gången.' : 'Söker i tidigare sparade kopior som kan sakna senaste ändringar. Öppna aktuell version från läsaren.'}</p></div><div className="section-heading"><h2>{copyTotal} träffar i {mirrorSearch ? 'spegeln' : 'äldre kopior'}</h2></div><div className="panel">{copyLoading ? <Loading /> : copyResults.length ? copyResults.map((d: any) => row(mirrorSearch ? d : { ...d, copyId: d.id, path: d.source_path })) : <div className="hub-empty hub-results-empty"><Search size={27}/><strong>{query ? 'Inga träffar i det valda arkivet' : 'Sök i tidigare sparat innehåll'}</strong><p>{query ? 'Försök med ett annat ord eller byt sökläge.' : 'Skriv ett sökord för att hitta innehåll i de indexerade dokumenten.'}</p></div>}</div>{pager}</> : <>
 <div className={view === 'databas' ? 'nh-module-search-panel' : ''}>{view === 'databas' && <><span className="nh-module-filter-label">SÖK I DATABASEN</span>{searchbar}</>}<label className="field portal-topic">Välj kategori<select value={topic} onChange={e => { setTopic(e.target.value); setPage(0); }}><option value="">Alla ämnen</option>{Array.from(new Set(documents.filter((d: any) => view === 'databas' ? d.module === 'databas' && !d.technical : view === 'arkiv' || view === 'filer' ? d.technical : view === 'nyheter' ? d.module === 'nyheter' : view === 'verktyg' ? d.module === 'verktyg' : view === 'inkorg' ? d.module === 'inkorg' : !d.technical).map((d: any) => d.category))).sort((a: any, b: any) => a.localeCompare(b, 'sv')).map((t: any) => <option key={t}>{t}</option>)}</select></label></div>
 <div className="section-heading hub-results-heading" id={view === 'databas' ? 'nh-database-results' : undefined}><div><span className="hub-section-kicker">AKTUELLT INNEHÅLL</span><h2>{allVisible.length.toLocaleString('sv-SE')} katalogposter</h2></div>{(query || topic) && <button className="hub-inline-link" onClick={() => { setQuery(''); setTopic(''); setPage(0); }}>Rensa filter <X size={16}/></button>}</div>{view === 'filer' ? <div className="info-note"><Folder size={19}/><p>{catalog?.fileCount?.toLocaleString('sv-SE')} filer i GitHub. Listan grupperar dokument som finns i flera format. Bilder och tekniska filer visas här men räknas inte som kunskapsdokument.</p></div> : sourceNote}<div className={'panel' + (view === 'databas' ? ' nh-database-results' : '')}>{loading && !overview ? <Loading /> : displayed.length ? displayed.map((d: any) => row(d)) : <div className="hub-empty hub-results-empty"><Search size={31}/><strong>{!query && !topic ? 'Inget innehåll i den här kategorin ännu' : 'Inga dokument matchar'}</strong><p>{!query && !topic ? 'Här visas material när det finns i GitHub.' : 'Testa andra sökord eller välj alla ämnen igen.'}</p>{(query || topic) && <button className="secondary" onClick={() => { setQuery(''); setTopic(''); setPage(0); }}>Visa alla dokument</button>}</div>}</div>{pager}</>}
 </>}
 {catalog?.warnings?.map((w: string) => <div className="error-banner" key={w}>{w}</div>)}
 {catalog && !catalog.complete && <div className="error-banner">GitHub returnerade ett begränsat filträd. Katalogen är ofullständig.</div>}<footer className="page-footer"><span className="mini-brand">NEXUS HUB</span><span>Ditt gränssnitt till kunskapen.</span></footer></main></div>
 <nav className="bottom-nav" aria-label="Huvudnavigation"><button className={view === 'hem' && !reader ? 'active' : ''} aria-current={view === 'hem' && !reader ? 'page' : undefined} onClick={() => go('hem')}><Home size={22}/><span>Hem</span></button><button className={view === 'berattelser' || view === 'mysterier' ? 'active' : ''} aria-current={view === 'berattelser' || view === 'mysterier' ? 'page' : undefined} onClick={() => go('berattelser')}><BookOpen size={22}/><span>Berättelser</span></button><button className="add-nav" aria-label="Lägg till" onClick={() => setAddMenu(true)}><span><Plus size={26}/></span><small>Lägg till</small></button><button className={view === 'filmer' || view === 'serier' ? 'active' : ''} aria-current={view === 'filmer' || view === 'serier' ? 'page' : undefined} onClick={() => go('filmer')}><Clapperboard size={22}/><span>Film & serier</span></button><button className={menu ? 'active' : ''} aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={22}/><span>Meny</span></button></nav>
 {inspect && <MirrorInspector path={inspect.path} title={inspect.title} initial={mirrorChecks[inspect.path]} onClose={() => setInspect(null)} onOpen={path => open({ path, repoKey: 'databas' })} onUpdate={check => setMirrorChecks(previous => ({ ...previous, [check.path]: check }))}/>}
 <IdeaEditor ideas={ideas}/>
 {addMenu && <div className="modal-backdrop" onClick={() => setAddMenu(false)}><div className="menu-sheet" role="dialog" aria-modal="true" aria-label="Lägg till" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setAddMenu(false); }}><div className="modal-heading"><h2>Lägg till</h2><button type="button" autoFocus className="icon-button" aria-label="Stäng lägg till" onClick={() => setAddMenu(false)}><X/></button></div><button className="nav-item" disabled={!ideas.ready} onClick={() => { setAddMenu(false); ideas.create(); }}><MaterialIcon tone="orange" size={32}><Lightbulb size={22}/></MaterialIcon>Ny idé<ChevronRight size={16}/></button><button className="nav-item" onClick={() => { setAddMenu(false); beginUpload(); }}><Upload size={22}/>Bifoga dokument<ChevronRight size={16}/></button></div></div>}
 {menu && <div className="modal-backdrop" onClick={() => setMenu(false)}><div className="menu-sheet" role="dialog" aria-modal="true" aria-label="Meny" onClick={e => e.stopPropagation()}><div className="modal-heading"><h2>Din Nexus Hub</h2><button className="icon-button" aria-label="Stäng menyn" onClick={() => setMenu(false)}><X /></button></div><button className="nav-item hub-menu-upload" onClick={() => { setMenu(false); beginUpload(); }}><Upload size={20}/>Bifoga dokument<ChevronRight size={16}/></button><button className="nav-item" onClick={() => go('inkorg')}><Inbox size={20}/>Inkorg<ChevronRight size={16}/></button>{MENU_SECTIONS.map(section => <div key={section.title} className="nh-menu-section"><p className="nh-menu-section-title">{section.title}</p>{NAV.filter(([id]) => section.ids.includes(id)).map(([id, label, I]) => <button className="nav-item" key={id} onClick={() => go(id)}><MaterialIcon tone={id === 'ideer' ? 'orange' : id === 'filmer' ? 'ruby' : id === 'berattelser' ? 'blue' : id === 'plugins' || id === 'mottaget' ? 'pink' : id === 'databas' || id === 'serier' ? 'blue' : id === 'ekonomi' || id === 'filer' || id === 'verktyg' || id === 'upptack' ? 'green' : 'violet'} size={28}><I size={20}/></MaterialIcon>{label}<ChevronRight size={16}/></button>)}</div>)}<button className="nav-item nh-menu-settings" onClick={() => go('installningar')}><Settings size={20}/>Inställningar & system<ChevronRight size={16}/></button><p className="nh-menu-private-note"><ShieldCheck size={18}/>Privat Nexus Hub · GitHub är huvudkälla.</p></div></div>}
 {upload && <div className="modal-backdrop"><form className="editor-modal upload-modal" onSubmit={send}><div className="modal-heading"><h2>Lämna dokument till inkorgen</h2><button type="button" className="icon-button" aria-label="Stäng uppladdning" disabled={sending} onClick={() => setUpload(false)}><X /></button></div><div className="modal-body">{notice && <div className="error-banner" role="alert">{notice}</div>}<p className="muted">Originalet sparas i Nexus Hub och skickas till GitHub. ChatGPT sköter bearbetningen senare.</p><button className="dropzone" type="button" disabled={sending} onClick={() => input.current?.click()}><Upload size={30}/><strong>Välj fil från mobilen</strong><small>På mobilen: välj Google Drive i filväljaren, ibland under Bläddra eller Platser.</small><small>GitHub: högst 10 MB per fil · lokal lagring: 25 MB</small></button><input ref={input} hidden type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))}/>{files.map((f, i) => <div className="attachment" key={i}><FileText size={19}/><span><strong>{f.name}</strong><small>{bytes(f.size)}</small></span><button type="button" disabled={sending} className="icon-button" aria-label="Ta bort vald fil" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={18}/></button></div>)}{uploadProgress && <p role="status">{uploadProgress}</p>}{uploadResults.map(r => <div className={'upload-receipt ' + (r.github?.state === 'sent' ? 'sent' : 'pending')} key={r.id}><strong>{r.name}</strong><p>{r.github?.state === 'sent' ? 'Mottagen av GitHub i 00-Inkorg/' : 'Sparad i Nexus Hub. GitHub-överföringen väntar.'}</p>{r.github?.error && <small>{r.github.error}</small>}</div>)}</div><div className="modal-actions"><button type="button" className="secondary" disabled={sending} onClick={() => { setUpload(false); go('inkorg'); }}>Visa inkorgen</button><button className="primary" disabled={sending || !files.length}>{sending ? <Loader2 className="spin" size={18}/> : <Upload size={18}/>}Ladda upp till inkorgen</button></div></form></div>}
 </div>;
}
function Heading({ title, text, icon, tone = 'purple' }: {
    title: string;
    text: string;
    icon: React.ReactNode;
    tone?: 'purple' | 'blue' | 'green' | 'pink' | 'orange';
}) { return <div className={'page-heading hub-heading-' + tone}><span className={'module-icon ' + tone + ' large'}><MaterialIcon tone={tone === 'blue' ? 'blue' : tone === 'pink' ? 'pink' : tone === 'orange' ? 'ruby' : tone === 'green' ? 'green' : 'violet'} size={48}>{icon as React.ReactElement<any>}</MaterialIcon></span><div><p className="eyebrow">NEXUS HUB</p><h1>{title}</h1><p>{text}</p></div></div>; }
function Loading() { return <div className="loading"><Loader2 className="spin"/>Hämtar…</div>; }
function LinkLabel() { return <Network size={19}/>; }
function PluginFiles({ files, onOpen }: {
    files: any[];
    onOpen: (path: string) => void;
}) { const [folder, setFolder] = useState(''), explorer = useRef<HTMLDetailsElement>(null); useBackHandler(85, () => { if (!folder || !explorer.current?.open)
    return false; setFolder(folder.split('/').slice(0, -2).join('/') + (folder.split('/').length > 2 ? '/' : '')); return true; }); const descendants = files.filter(f => f.path.startsWith(folder)); const folders = Array.from(new Set(descendants.map(f => f.path.slice(folder.length).split('/')).filter(parts => parts.length > 1).map(parts => parts[0]))).sort(); return <details ref={explorer} className="panel settings-panel"><summary>Bläddra bland alla filer i plugin-repot</summary><p className="break">/{folder}</p>{folder && <button className="secondary" onClick={() => setFolder(folder.split('/').slice(0, -2).join('/') + (folder.split('/').length > 2 ? '/' : ''))}>Till överordnad mapp</button>}{folders.map(name => <button className="entry-row" key={name} onClick={() => setFolder(folder + name + '/')}><MaterialIcon tone="violet" size={28}><Folder size={19}/></MaterialIcon><span>{name}</span><ChevronRight size={16}/></button>)}{descendants.filter(f => !f.path.slice(folder.length).includes('/')).map(f => <button className="entry-row" key={f.path} onClick={() => onOpen(f.path)}><MaterialIcon tone="blue" size={28}><FileText size={19}/></MaterialIcon><span className="entry-text break">{f.path.slice(folder.length)}<small>{bytes(f.size)} · endast läsning</small></span></button>)}</details>; }
