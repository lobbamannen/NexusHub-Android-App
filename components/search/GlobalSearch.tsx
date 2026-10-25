'use client';
import { mediaFetch } from '@/lib/media-client';
import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Clapperboard, Tv, Puzzle, FileText, ChevronRight, Loader2 } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import RepositoryPoster, { usePosterRevision } from '@/components/repository-poster';
import { storyList } from '@/lib/stories.mjs';
import { filterCatalog } from '@/lib/catalog.mjs';
type Props = {
    query: string;
    documents: any[];
    pluginRepo: any;
    revision?: string;
    loading: boolean;
    onOpen: (item: any, repo?: string) => void;
    onOpenMedia: (view: 'filmer' | 'serier', id: string) => void;
    onOpenStory: (path: string) => void;
};
export default function GlobalSearch({ query, documents, pluginRepo, revision, loading, onOpen, onOpenMedia, onOpenStory }: Props) {
    const [films, setFilms] = useState<any[]>([]), [series, setSeries] = useState<any[]>([]), [fetching, setFetching] = useState(true), [errors, setErrors] = useState<string[]>([]), [retry, setRetry] = useState(0), [limits, setLimits] = useState<Record<string, number>>({});
    const [posterRevision, refreshPosters] = usePosterRevision();
    useEffect(() => {
        const abort = new AbortController();
        setFetching(true);
        setErrors([]);
        void refreshPosters();
        Promise.allSettled((['films', 'series'] as const).map(async (kind) => { try {
            const r = await mediaFetch('/api/' + kind, { cache: 'no-store', signal: abort.signal });
            const data: any = await r.json();
            if (!r.ok || !Array.isArray(data.register?.[kind]))
                throw Error();
            if (!abort.signal.aborted)
                (kind === 'films' ? setFilms : setSeries)(data.register[kind]);
        }
        catch {
            if (!abort.signal.aborted) {
                (kind === 'films' ? setFilms : setSeries)([]);
                setErrors(prev => [...prev, kind === 'films' ? 'Filmer' : 'Serier']);
            }
        } })).finally(() => { if (!abort.signal.aborted)
            setFetching(false); });
        return () => abort.abort();
    }, [revision, retry]);
    useEffect(() => setLimits({}), [query]);
    const groups = useMemo(() => {
        const words = query.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
        const matches = (text: string) => words.every(w => text.toLocaleLowerCase('sv').includes(w));
        const media = (items: any[], kind: 'filmer' | 'serier') => items.filter(i => matches([i.title, i.displayTitle, i.imdbId, i.year || i.startYear, ...(i.genres || [])].join(' '))).map(i => ({ key: i.imdbId || `${i.title}|${i.startYear ?? ''}`, title: i.displayTitle || i.title, note: [i.year || i.startYear, i.status].filter(Boolean).join(' · '), kind, original: i }));
        const stories = storyList(documents).filter((s: any) => matches(s.title + ' ' + s.category)).map((s: any) => ({ key: s.path, title: s.title, note: s.category, kind: 'berattelser', original: s }));
        const docs = filterCatalog(documents, { query }).filter((d: any) => d.module !== 'mysterier' && d.module !== 'inkorg').map((d: any) => ({ key: d.path, title: d.title, note: d.category, kind: 'kunskap', original: d }));
        const plugins = (pluginRepo?.packages || []).filter((p: any) => !p.archived && !p.legacy && matches([p.title, p.name, p.description].join(' '))).map((p: any) => ({ key: p.path, title: p.title, note: p.version ? 'Version ' + p.version : 'Version kunde inte verifieras', kind: 'plugins', original: p }));
        return [{ id: 'filmer', label: 'Filmer', Icon: Clapperboard, tone: 'ruby', items: media(films, 'filmer') }, { id: 'serier', label: 'Serier', Icon: Tv, tone: 'blue', items: media(series, 'serier') }, { id: 'berattelser', label: 'Berättelser', Icon: BookOpen, tone: 'blue', items: stories }, { id: 'kunskap', label: 'Kunskap & dokument', Icon: FileText, tone: 'violet', items: docs }, { id: 'plugins', label: 'Plugins', Icon: Puzzle, tone: 'pink', items: plugins }];
    }, [query, documents, pluginRepo, films, series]);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    return <section className="nh-global-results" aria-label="Sökresultat i Nexus Hub">
  <div className="section-heading"><h2>{query ? total.toLocaleString('sv-SE') + ' träffar' : 'Bläddra i hela Nexus Hub'}</h2>{(loading || fetching) && <span className="nh-search-loading" role="status"><Loader2 size={16} className="spin"/>Hämtar innehåll…</span>}</div>
  {!!errors.length && <div className="error-banner" role="alert"><span>{errors.join(' och ')} kunde inte hämtas. Övriga resultat visas.</span><button className="secondary" onClick={() => setRetry(n => n + 1)}>Försök igen</button></div>}
  {groups.filter(g => g.items.length).map(({ id, label, Icon, tone, items }) => <section className="portal-section" key={id} aria-label={'Sökresultat: ' + label}><div className="section-heading"><h3>{label} <span className="muted">· {items.length.toLocaleString('sv-SE')}</span></h3></div><div className="panel">{items.slice(0, limits[id] || 6).map((item: any) => <button type="button" className="entry-row" key={item.key} onClick={() => id === 'filmer' || id === 'serier' ? onOpenMedia(id, item.key) : id === 'berattelser' ? onOpenStory(item.key) : onOpen(item.original, id === 'plugins' ? 'plugins' : 'databas')}>
   {id === 'filmer' || id === 'serier' || id === 'berattelser' ? <span className="nh-search-poster"><RepositoryPoster kind={id === 'filmer' ? 'films' : id === 'serier' ? 'series' : 'stories'} posterKey={item.key} revision={posterRevision} alt={(id === 'berattelser' ? 'Omslag: ' : 'Affisch: ') + item.title}><Icon size={23}/></RepositoryPoster></span> : <MaterialIcon tone={tone as any} size={34}><Icon size={22}/></MaterialIcon>}<span className="entry-text"><strong>{item.title}</strong><small>{item.note}</small></span><ChevronRight size={17}/></button>)}</div>{items.length > (limits[id] || 6) && <button className="secondary nh-search-more" onClick={() => setLimits(prev => ({ ...prev, [id]: (prev[id] || 6) + 24 }))}>Visa fler {label.toLocaleLowerCase('sv')}</button>}</section>)}
  {!loading && !fetching && !total && <div className="hub-empty"><FileText size={28}/><strong>Inga träffar</strong><p>Prova en titel, ett ämne, ett årtal eller ett IMDb-ID.</p></div>}
 </section>;
}
