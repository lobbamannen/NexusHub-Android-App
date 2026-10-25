'use client';
import {cancelDraftWrites} from '@/platform/draft-writes';
import { mediaFetch } from '@/lib/media-client';
import MaterialIcon from '@/components/MaterialIcon';
import { useBackHandler } from '@/components/NativeBackBridge';
import { restoreListScroll } from '@/lib/client-navigation';
import { useLibraryState } from '@/lib/library-state';
import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Clapperboard, Search, Plus, ChevronLeft, ExternalLink, Star, Heart, CalendarDays, Play, RefreshCw, Save, X, Popcorn, Loader2, AlertCircle, Trash2, Edit3 } from 'lucide-react';
import './films.css';
import './media-details.css';
import ChromaRating from '@/components/media/ChromaRating';
import MediaDetailHero from '@/components/media/MediaDetailHero';
import MediaStatistics from '@/components/media/MediaStatistics';
import MediaOverview from '@/components/dashboard/MediaOverview';
import { recentGenrePosters } from '@/lib/recent-genre-posters.mjs';
import DiscoveryToolbar from '@/components/dashboard/DiscoveryToolbar';
import { filmDiscovery } from '@/lib/media-discovery.mjs';
import { matchesGenreGroup } from '@/lib/genre-taxonomy.mjs';
import { GenreSubfilters } from '@/components/dashboard/MediaOverview';
import RepositoryPoster, { usePosterRevision } from '@/components/repository-poster';
type Status = 'Inte sett' | 'Sedd' | 'Pågående' | 'Vill se' | 'Avbruten';
type Access = 'okänt' | 'abonnemang' | 'gratis' | 'hyrd' | 'köpt' | 'annat';
type Viewing = {
    date: string | null;
    provider: string | null;
    accessType: Access;
    priceSek: number | null;
};
type FilmEntry = {
    imdbId: string;
    title: string;
    year: number;
    displayTitle: string;
    genres: string[];
    status: Status;
    favorite?: boolean;
    ourRating: number | null;
    ourReview: string | null;
    synopsis: string | null;
    series: {
        name: string;
        number: number;
    } | null;
    viewings: Viewing[];
    startedViewingDate: string | null;
    plannedViewingDate: string | null;
    statusEvidence: {
        type: 'direkt' | 'serieuppgift';
        note: string;
    };
    metadataSource: string;
    runtimeMetadata?: {
        minutes: number;
        status: 'verified' | 'estimated';
        source?: string;
        checkedAt?: string;
    };
};
type FilmRegistry = {
    schemaVersion: string;
    lastUpdated: string;
    description: string;
    films: FilmEntry[];
};
type FilmResponse = {
    sha: string;
    register: FilmRegistry;
};
const STATUSES: Status[] = ['Inte sett', 'Sedd', 'Pågående', 'Vill se', 'Avbruten'];
const ACCESS: Access[] = ['okänt', 'abonnemang', 'gratis', 'hyrd', 'köpt', 'annat'];
const statusClass = (value: Status) => value === 'Sedd' ? 'seen' : value === 'Pågående' ? 'watching' : value === 'Vill se' ? 'planned' : 'stopped';
const dateLabel = (v: string | null) => v ? new Date(v + 'T12:00:00').toLocaleDateString('sv-SE') : 'Okänt datum';
const money = (v: number | null) => v === null ? 'Okänt belopp' : v.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 });
const blankViewing = (): Viewing => ({ date: null, provider: null, accessType: 'okänt', priceSek: null });
const trimOrNull = (s: string) => s.trim() || null;
const providerLabel = (v: Viewing) => v.provider || 'Okänd tjänst/plats';
const handleResponse = async (r: Response) => { let payload: any; try {
    payload = await r.json();
}
catch {
    throw Error('Servern returnerade inget giltigt svar. Kontrollera GitHub innan ett nytt sparförsök.');
} if (!r.ok)
    throw Object.assign(Error(payload.error || 'Något gick fel.'), { status: r.status }); return payload; };
function Poster({ film, large = false, revision }: {
    film: FilmEntry;
    large?: boolean;
    revision: string;
}) {
    return <div className={'film-poster ' + (large ? 'large' : '')}><RepositoryPoster kind="films" posterKey={film.imdbId} revision={revision} alt={'Filmaffisch: ' + film.title}><div className="film-poster-fallback"><Clapperboard size={large ? 58 : 38} strokeWidth={1.1}/><span>{film.title}</span></div></RepositoryPoster></div>;
}
function FilmForm({ value, save, cancel, saving, onDirtyChange }: {
    value: FilmEntry;
    onDirtyChange?: (dirty: boolean, busy?: boolean) => void;
    save: (f: FilmEntry) => void;
    cancel: () => void;
    saving: boolean;
}) {
    const [draft, setDraft] = useState<FilmEntry>(() => structuredClone(value)), [genreText, setGenreText] = useState(value.genres.join(', ')), [seriesName, setSeriesName] = useState(value.series?.name || ''), [seriesNumber, setSeriesNumber] = useState(value.series?.number?.toString() || ''), [formError, setFormError] = useState('');
    const dirty = JSON.stringify(draft) !== JSON.stringify(value) || genreText !== value.genres.join(', ') || seriesName !== (value.series?.name || '') || seriesNumber !== (value.series?.number?.toString() || '');
    useEffect(() => { onDirtyChange?.(dirty || saving, saving); return () => onDirtyChange?.(false); }, [dirty, saving, onDirtyChange]);
    useEffect(() => { if (!dirty && !saving)
        return; const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty, saving]);
    const close = () => { if (!saving && (!dirty || window.confirm('Du har osparade filmändringar. Kasta dem?')))
        { cancelDraftWrites('film'); cancel(); } };
    useBackHandler(120, () => { close(); return true; });
    const set = (patch: Partial<FilmEntry>) => setDraft((f: FilmEntry) => ({ ...f, ...patch }));
    const viewing = (index: number, patch: Partial<Viewing>) => setDraft((f: FilmEntry) => ({ ...f, viewings: f.viewings.map((v: Viewing, i: number) => i === index ? { ...v, ...patch } : v) }));
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        const id = draft.imdbId.trim();
        if (!/^tt\d{7,9}$/.test(id)) {
            setFormError('IMDb-ID ska börja med tt följt av 7–9 siffror.');
            return;
        }
        if (seriesName.trim() && (!Number.isInteger(Number(seriesNumber)) || Number(seriesNumber) < 1)) {
            setFormError('Ange filmens nummer i serien.');
            return;
        }
        if (!genreText.split(',').some(s => s.trim())) {
            setFormError('Ange minst en genre.');
            return;
        }
        save({ ...draft, imdbId: id, title: draft.title.trim(), displayTitle: draft.title.trim() + ' – (' + draft.year + ')', genres: genreText.split(',').map(s => s.trim()).filter(Boolean), viewings: draft.viewings.map(v => ({ ...v, provider: trimOrNull(v.provider || '') })), series: seriesName.trim() ? { name: seriesName.trim(), number: Number(seriesNumber) } : null, ourReview: trimOrNull(draft.ourReview || ''), synopsis: trimOrNull(draft.synopsis || ''), metadataSource: 'https://www.imdb.com/title/' + id + '/' });
    };
    return <form className="film-form" onSubmit={submit}>
  <div className="film-form-heading reader-toolbar"><h2>Redigera film</h2><button type="button" className="film-quiet text-button" disabled={saving} onClick={close}><X size={18}/>Avbryt</button></div>
  <p className="film-muted">Ändringar sparas direkt till GitHub. Okända betyg, datum, tjänster och priser lämnas tomma.</p>
  {formError && <p className="film-error" role="alert">{formError}</p>}
  <div className="film-fields">
   <label>Titel<input required maxLength={250} value={draft.title} onChange={e => set({ title: e.target.value })} placeholder="Filmens originaltitel"/></label>
   <label>IMDb-ID<input required pattern="tt[0-9]{7,9}" disabled value={draft.imdbId} onChange={e => set({ imdbId: e.target.value })} placeholder="tt1234567"/></label>
   <label>Årtal<input required type="number" min="1880" max="2100" value={draft.year || ''} onChange={e => set({ year: Number(e.target.value) })}/></label>
   <label>Genre / underkategori, kommaseparerat<input required value={genreText} onChange={e => setGenreText(e.target.value)} placeholder="Skräck, Paranormalt"/></label>
   <label>Status<select value={draft.status} onChange={e => set({ status: e.target.value as Status, statusEvidence: { type: 'direkt', note: 'Status bekräftad vid redigering i Nexus Hub.' } })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
   <label>Vårt betyg, 1–10 (valfritt)<input type="number" min="1" max="10" step="1" value={draft.ourRating ?? ''} onChange={e => set({ ourRating: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Inte betygsatt"/></label>
   <label>Påbörjad<input type="date" value={draft.startedViewingDate || ''} onChange={e => set({ startedViewingDate: e.target.value || null })}/></label>
   <label>Planerad visning<input type="date" value={draft.plannedViewingDate || ''} onChange={e => set({ plannedViewingDate: e.target.value || null })}/></label>
   <label>Filmserie<input value={seriesName} maxLength={150} onChange={e => setSeriesName(e.target.value)} placeholder="T.ex. Insidious"/></label>
   <label>Nummer i serien<input type="number" min="1" value={seriesNumber} onChange={e => setSeriesNumber(e.target.value)} placeholder="1"/></label>
   <label className="film-full">Handling utan spoilers<textarea rows={3} value={draft.synopsis || ''} onChange={e => set({ synopsis: e.target.value })} maxLength={5000}/></label>
   <label className="film-full">Vårt personliga omdöme<textarea rows={4} value={draft.ourReview || ''} onChange={e => set({ ourReview: e.target.value })} maxLength={12000} placeholder="Vad tyckte vi om filmen?"/></label>
  </div>
  <div className="film-form-heading"><h3>Visningshistorik</h3><button className="film-quiet" type="button" onClick={() => setDraft(f => ({ ...f, viewings: [...f.viewings, blankViewing()] }))}><Plus size={17}/>Lägg till visning</button></div>
  <p className="film-muted">Ändra en äldre okänd visning om du vill komplettera den. Skapa en ny vid omtittning.</p>
  {draft.viewings.map((v, i) => <div className="film-viewing-edit" key={i}>
   <div className="film-viewing-header"><strong>Visning {i + 1}</strong><button type="button" className="film-quiet" onClick={() => { if (confirm('Vill du verkligen ta bort denna visning från historiken?'))
            setDraft(f => ({ ...f, viewings: f.viewings.filter((_, j) => j !== i) })); }}><Trash2 size={15}/>Ta bort</button></div>
   <div className="film-fields">
    <label>Datum<input type="date" value={v.date || ''} onChange={e => viewing(i, { date: e.target.value || null })}/></label>
    <label>Var såg vi filmen?<input maxLength={160} value={v.provider || ''} onChange={e => viewing(i, { provider: e.target.value })} placeholder="T.ex. Netflix eller biograf"/></label>
    <label>Åtkomst<select value={v.accessType} onChange={e => viewing(i, { accessType: e.target.value as Access })}>{ACCESS.map(a => <option key={a} value={a}>{a === 'okänt' ? 'Okänt' : a.charAt(0).toUpperCase() + a.slice(1)}</option>)}</select></label>
    <label>Extra kostnad (kr)<input type="number" min="0" step=".01" value={v.priceSek ?? ''} onChange={e => viewing(i, { priceSek: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Okänt"/></label>
   </div>
  </div>)}
  <div className="film-actions"><button className="secondary" type="button" disabled={saving} onClick={close}>Avbryt</button><button className="primary" disabled={saving}>{saving ? <Loader2 size={17} className="spin"/> : <Save size={17}/>}Spara till GitHub</button></div>
 </form>;
}
export default function Films({ initialItem, onExitDetail, onDirtyChange }: {
    initialItem?: string | null;
    onExitDetail?: () => void;
    onDirtyChange?: (dirty: boolean, busy?: boolean) => void;
} = {}) {
    const [posterRevision, refreshPosters, availablePosters] = usePosterRevision();
    const returnScroll = useRef(0), openedLocally = useRef(false), editorDirty = useRef(false);
    const reportDirty = useCallback((dirty: boolean, busy = false) => { editorDirty.current = dirty; onDirtyChange?.(dirty, busy); }, [onDirtyChange]);
    const [data, setData] = useState<FilmResponse | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false), [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<string | null>(null), [draft, setDraft] = useState<FilmEntry | null>(null);
    const [query, setQuery] = useLibraryState('films:query', ''), [status, setStatus] = useLibraryState('films:status', 'alla'), [genre, setGenre] = useLibraryState('films:genre', 'alla'), [series, setSeries] = useLibraryState('films:series', 'alla'), [favorite, setFavorite] = useLibraryState('films:favorite', 'alla'), [sort, setSort] = useLibraryState('films:sort', 'titel');
    const [statistics, setStatistics] = useState(false);
    const [browsing, setBrowsing] = useLibraryState('films:browsing', false), [jump, setJump] = useState(0), [genreGroup, setGenreGroup] = useLibraryState<string | null>('films:genreGroup', null);
    useEffect(() => { if (browsing && jump > 0)
        requestAnimationFrame(() => document.getElementById('nh-film-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }, [jump, browsing]);
    const load = async (force = true) => { if (editorDirty.current) { setError("Avsluta redigeringen innan du läser om registret."); return; } setLoading(true); setError(''); void refreshPosters(); try {
        setData(await handleResponse(await mediaFetch('/api/films', { cache: 'no-store' }, force === true)));
    }
    catch (e: any) {
        setError(e.message);
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { load(false); }, []);
    useEffect(() => {
        const refresh = (event: Event) => { if ((event as CustomEvent).detail?.view === 'filmer' && !(editorDirty.current || saving)) void load(true); };
        window.addEventListener('nexus-refresh-module',refresh);
        return () => window.removeEventListener('nexus-refresh-module',refresh);
    }, [saving]);
    useEffect(() => { if (initialItem) {
        setSelected(initialItem);
        setDraft(null);
        setError('');
    } }, [initialItem]);
    const films = data?.register.films || [];
    const discovery = useMemo(() => filmDiscovery(films), [films]);
    const genrePreviews = useMemo(() => recentGenrePosters(films, 'films', 4, availablePosters.films), [films, availablePosters.films]);
    const resetFilters = () => { setStatus('alla'); setGenre('alla'); setGenreGroup(null); setSeries('alla'); setFavorite('alla'); setQuery(''); setSort('titel'); };
    const chooseCategory = (id: string | null) => { const keepGroup = !!genreGroup && !!id?.startsWith('genre:') && !!discovery.groups.find(x => x.id === 'genre')?.items.find((x: {
        id: string;
        children?: {
            id: string;
        }[];
    }) => x.id === 'genregroup:' + genreGroup)?.children?.some((x: {
        id: string;
    }) => x.id === id); const primary = keepGroup ? genreGroup : null; resetFilters(); if (primary)
        setGenreGroup(primary); if (id?.startsWith('status:'))
        setStatus(id.slice(7));
    else if (id?.startsWith('genregroup:'))
        setGenreGroup(id.slice('genregroup:'.length));
    else if (id?.startsWith('genre:'))
        setGenre(id.slice(6));
    else if (id?.startsWith('filmseries:'))
        setSeries(id.slice(11)); setBrowsing(true); setJump(n => n + 1); };
    const showAll = () => { resetFilters(); setBrowsing(true); setJump(n => n + 1); };
    const closeBrowse = () => { resetFilters(); setBrowsing(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const activeCategory = genreGroup ? 'genregroup:' + genreGroup : status !== 'alla' ? 'status:' + status : genre !== 'alla' ? 'genre:' + genre : series !== 'alla' ? 'filmseries:' + series : null;
    const showing = browsing || !!query.trim();
    const genres = useMemo(() => [...new Set(films.flatMap(f => f.genres))].sort((a, b) => a.localeCompare(b, 'sv')), [films]);
    const activeGenreGroup = genreGroup ? discovery.groups.find((x: {
        id: string;
    }) => x.id === 'genre')?.items.find((x: {
        id: string;
    }) => x.id === 'genregroup:' + genreGroup) : null;
    const seriesOptions = useMemo(() => [...new Set(films.flatMap(f => f.series ? [f.series.name] : []))].sort((a, b) => a.localeCompare(b, 'sv')), [films]);
    const visible = useMemo(() => films.filter(f => (status === 'alla' || f.status === status) && (!genreGroup || matchesGenreGroup(f, genreGroup)) && (genre === 'alla' || f.genres.includes(genre)) && (series === 'alla' || f.series?.name === series) && (favorite === 'alla' || Boolean(f.favorite) === (favorite === 'ja')) && [f.title, f.year.toString(), f.imdbId, f.genres.join(' '), f.series?.name || ''].join(' ').toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv'))).sort((a, b) => sort === 'år' ? b.year - a.year : sort === 'betyg' ? (b.ourRating ?? -1) - (a.ourRating ?? -1) : sort === 'serie' ? (a.series?.name || 'Övriga').localeCompare(b.series?.name || 'Övriga', 'sv') || (a.series?.number || 0) - (b.series?.number || 0) : a.title.localeCompare(b.title, 'sv')), [films, status, genreGroup, genre, series, favorite, query, sort]);
    const film = films.find(f => f.imdbId === selected);
    const open = (f: FilmEntry) => { returnScroll.current = window.scrollY; openedLocally.current = true; window.history.replaceState(null, '', '#filmer?item=' + encodeURIComponent(f.imdbId)); window.scrollTo(0, 0); setStatistics(false); setDraft(null); setSelected(f.imdbId); setError(''); setNotice(''); };
    const closeFilm = () => { setSelected(null); if (!openedLocally.current && onExitDetail) {
        onExitDetail();
        return;
    } if (location.hash.startsWith('#filmer?'))
        window.history.replaceState(null, '', '#filmer'); restoreListScroll(returnScroll.current); };
    useBackHandler(110, () => { if (!statistics)
        return false; setStatistics(false); restoreListScroll(returnScroll.current); return true; });
    useBackHandler(100, () => { if (!selected)
        return false; closeFilm(); return true; });
    useBackHandler(60, () => { if (!showing)
        return false; closeBrowse(); return true; });
    const startEdit = (f: FilmEntry) => { setDraft(structuredClone(f)); setConflict(false); setError(''); };
    const save = async (f: FilmEntry) => {
        if (!data)
            return;
        setSaving(true);
        setError('');
        setNotice('');
        setConflict(false);
        try {
            const result = await handleResponse(await mediaFetch('/api/films', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedSha: data.sha, action: 'update', film: f }) }));
            setData({ sha: result.sha, register: result.register });
            setSelected(f.imdbId);
            setDraft(null);
            setNotice(result.warning || 'Filmen är sparad i GitHub.');
        }
        catch (e: any) {
            setError(e.message || 'Kunde inte spara.');
            if (e.status === 409)
                setConflict(true);
        }
        finally {
            setSaving(false);
        }
    };
    return <section className="film-library">
  {draft || film || statistics ? <div className="film-intro film-compact-intro"><div><p className="eyebrow">NEXUS HUB · FILMER</p><h1><MaterialIcon tone="ruby" size={36}><Clapperboard size={27}/></MaterialIcon>Filmer</h1></div></div> : <MediaOverview mode="films" previews={genrePreviews} posterRevision={posterRevision} total={discovery.total} metrics={discovery.metrics} groups={discovery.groups} selectedId={activeCategory} onSelect={chooseCategory} onShowAll={showAll} onRefresh={load} onStatistics={() => { returnScroll.current = window.scrollY; setStatistics(true); window.scrollTo(0, 0); }} loading={loading} toolbar={<DiscoveryToolbar query={query} onQuery={value => { setQuery(value); if (value.trim())
                setBrowsing(true); }} placeholder="Sök titel, år eller IMDb-ID…" browsing={showing} onShowAll={showAll} onClose={closeBrowse} showAllLabel={loading ? 'Hämtar titlar…' : 'Visa alla ' + films.length + ' filmer'} secondary={<span className="nh-discovery-small-note">GitHub är huvudkälla · visningshistoriken bevaras</span>}>
    {showing && <details className="nh-discovery-options"><summary>Sortera och kombinera filter</summary><div className="film-filters nh-advanced-filters">
     <label><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="alla">Alla statusar</option>{STATUSES.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
     <label><span>Genre</span><select value={genre} onChange={e => { setGenreGroup(null); setGenre(e.target.value); }}><option value="alla">Alla genrer</option>{genres.map(x => <option key={x}>{x}</option>)}</select></label>
     <label><span>Filmserie</span><select value={series} onChange={e => setSeries(e.target.value)}><option value="alla">Alla filmserier</option>{seriesOptions.map(x => <option key={x}>{x}</option>)}</select></label>
     <label><span>Favorit</span><select value={favorite} onChange={e => setFavorite(e.target.value)}><option value="alla">Alla filmer</option><option value="ja">Favoriter</option><option value="nej">Ej favoriter</option></select></label>
     <label><span>Sortera</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="titel">Titel A–Ö</option><option value="år">Nyaste år</option><option value="betyg">Vårt betyg</option><option value="serie">Filmserie</option></select></label>
    </div></details>}
   </DiscoveryToolbar>}/>}
   {notice && <div className="film-success" role="status">{notice}<button className="film-quiet" onClick={() => setNotice('')} aria-label="Stäng"><X size={15}/></button></div>}
  {error && <div className="film-error" role="alert"><AlertCircle size={19}/><span>{error}</span>{conflict ? <button type="button" onClick={() => { if (confirm('Hämta den senaste GitHub-versionen? Dina osparade ändringar i formuläret försvinner.')) { cancelDraftWrites('film');
        editorDirty.current = false;
        setDraft(null);
        setConflict(false);
        load();
    } }}>Ladda senaste GitHub-version</button> : <button onClick={() => load(true)}>Uppdatera</button>}</div>}
  {statistics ? <MediaStatistics initialFilter="filmer" onBack={() => { setStatistics(false); restoreListScroll(returnScroll.current); }}/> : draft ? <FilmForm key={draft.imdbId} onDirtyChange={reportDirty} value={draft} save={save} cancel={() => { setDraft(null); setError(''); setConflict(false); }} saving={saving}/> : film ? <div className="film-detail">
   <div className="film-detail-top reader-toolbar"><button className="film-quiet text-button" onClick={closeFilm}><ChevronLeft size={19}/>Till biblioteket</button><div className="film-detail-actions"><button className="secondary film-favorite-toggle" disabled={saving} onClick={() => save({ ...film, favorite: !film.favorite })}><Heart size={17} fill={film.favorite ? 'currentColor' : 'none'}/>{film.favorite ? 'Ta bort favorit' : 'Markera som favorit'}</button><button className="primary" onClick={() => startEdit(film)}><Edit3 size={17}/>Redigera</button></div></div>
    <MediaDetailHero poster={<Poster film={film} large revision={posterRevision}/>} title={film.title} year={film.year} genres={film.genres} runtimeMinutes={film.runtimeMetadata?.minutes} status={<span className={'film-status ' + statusClass(film.status)}>{film.status}</span>} favorite={film.favorite ? <span className="film-favorite-label"><Heart size={14} fill="currentColor"/>Favorit</span> : null} rating={film.ourRating}>
     {film.series && <span className="nh-detail-description-label">Filmserie: {film.series.name}, del {film.series.number}</span>}
     <a className="film-imdb" href={'https://www.imdb.com/title/' + film.imdbId + '/'} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>IMDb</a>
    </MediaDetailHero>
    <section className="nh-detail-panel"><span className="nh-detail-caption">FILMEN</span><h3>Om filmen</h3><p>{film.synopsis || 'Ingen spoilerfri handling finns registrerad ännu.'}</p></section>
    <section className="nh-detail-panel"><span className="nh-detail-caption">PERSONLIGT</span><h3>Vårt betyg & omdöme</h3><ChromaRating rating={film.ourRating}/><p className={film.ourReview ? '' : 'nh-review-empty'}>{film.ourReview || 'Vi har inte skrivit något omdöme än.'}</p></section>
    <div className="film-detail-sections"><section><h3>Visningshistorik</h3>{film.viewings.length ? film.viewings.map((v, i) => <div className="film-viewing" key={i}><CalendarDays size={19}/><div><strong>{dateLabel(v.date)}</strong><p>{providerLabel(v)} · {v.accessType} · {money(v.priceSek)} i extra kostnad</p></div></div>) : <p>Inga visningar registrerade.</p>}{film.startedViewingDate && <p><Play size={15}/> Påbörjad: {dateLabel(film.startedViewingDate)}</p>}{film.plannedViewingDate && <p><CalendarDays size={15}/> Planerad: {dateLabel(film.plannedViewingDate)}</p>}</section></div>
  </div> : <React.Fragment>
   
   {showing && <div className="nh-discovery-results" id="nh-film-results">
   {activeGenreGroup && <GenreSubfilters category={activeGenreGroup} onSelect={chooseCategory} mode="films"/>}
   <div className="film-list-heading"><h2>{visible.length} filmer</h2><button className="film-quiet" disabled={loading} onClick={() => load(true)}><RefreshCw size={17}/>Läs om från GitHub</button></div>
   {loading && !data ? <div className="film-loading"><Loader2 size={24} className="spin"/>Läser filmregistret…</div> : <div className="film-grid">{visible.map(f => <button className="film-card" key={f.imdbId} onClick={() => open(f)}><Poster film={f} revision={posterRevision}/><span className={'film-status ' + statusClass(f.status)}>{f.status}</span>{f.favorite && <span className="film-favorite-label"><Heart size={14} fill="currentColor"/>Favorit</span>}<strong>{f.title}</strong><small>{f.year}{f.series ? ' · ' + f.series.name + ' #' + f.series.number : ''}</small><span className="film-card-rating">{f.ourRating !== null ? <><ChromaRating rating={f.ourRating} compact/></> : 'Ej betygsatt'}</span></button>)}</div>}
   {!loading && !visible.length && <div className="film-empty"><Popcorn size={34}/><p>Inga filmer matchade urvalet.</p></div>}
   <p className="film-source">Metadata, vår historik och våra betyg läses från GitHub. Affischerna hämtas från vårt GitHub-bibliotek via Nexus Hub. Externa filmbilder ändrar aldrig vårt register.</p>
   </div>}
  </React.Fragment>}
 </section>;
}
