'use client';
import {cancelDraftWrites} from '@/platform/draft-writes';
import { mediaFetch } from '@/lib/media-client';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { LibraryBig, Clapperboard, Tv, Search, Heart, Star, Pencil, Save, RotateCcw, RefreshCw, X, AlertCircle, CheckCircle2, ChevronRight, Eye, EyeOff } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import { useBackHandler } from '@/components/NativeBackBridge';
import RepositoryPoster, { usePosterRevision } from '@/components/repository-poster';
import { GENRE_GROUPS, categoryForGenre } from '@/lib/genre-taxonomy.mjs';
type Kind = 'films' | 'series';
type MediaItem = {
    title: string;
    year?: number;
    startYear?: number | null;
    imdbId?: string | null;
    genres: string[];
    ourRating: number | null;
    favorite?: boolean | null;
    ourReview?: string | null;
    synopsis?: string | null;
    status?: string;
    allSeasonsAvailableInSwedenWatched?: boolean;
    watchedSeasons?: number[];
    wantToWatch?: boolean;
    displayTitle?: string;
};
type Payload = {
    sha: string;
    register: {
        films?: MediaItem[];
        series?: MediaItem[];
    };
};
type SaveResult = Payload & {
    saved?: boolean;
    error?: string;
    warning?: string;
};
type Changes = Partial<Pick<MediaItem, 'title' | 'year' | 'startYear' | 'genres' | 'ourRating' | 'favorite' | 'ourReview' | 'synopsis' | 'status' | 'allSeasonsAvailableInSwedenWatched' | 'wantToWatch'>>;
type Pending = {
    films: Record<string, Changes>;
    series: Record<string, Changes>;
};
const blank = (): Pending => ({ films: {}, series: {} });
const groupKey = (item: MediaItem) => categoryForGenre(item.genres?.[0] || '');
const identity = (kind: Kind, item: MediaItem) => kind === 'films'
    ? String(item.imdbId)
    : JSON.stringify([item.title, item.startYear ?? null, item.imdbId || null]);
const endpoint = (kind: Kind) => kind === 'films' ? '/api/films' : '/api/series';
const read = async (kind: Kind, force = false): Promise<Payload> => {
    const response = await mediaFetch(endpoint(kind), { cache: 'no-store' }, force);
    const data = await response.json() as Payload & {
        error?: string;
    };
    if (!response.ok || !data.register || typeof data.sha !== 'string')
        throw Error(data.error || 'Kunde inte läsa registret från GitHub.');
    return data;
};
const countEdits = (pending: Pending) => Object.keys(pending.films).length + Object.keys(pending.series).length;
function RatingEditor({ value, onChange, disabled }: {
    value: number | null;
    onChange: (n: number | null) => void;
    disabled: boolean;
}) {
    return <span className="nh-register-rating" role="group" aria-label={'Personligt betyg: ' + (value === null ? 'inte betygsatt' : value + ' av 10')}>
  <span className="nh-register-stars">
   {[0, 1, 2, 3, 4].map(index => {
            const percent = Math.max(0, Math.min(100, ((value ?? 0) - index * 2) * 50));
            return <span className="nh-register-star" key={index}>
     <Star className="nh-register-star-outline" size={19} strokeWidth={1.5} aria-hidden="true"/>
     <Star className="nh-register-star-filled" size={19} strokeWidth={1.5} fill="currentColor" style={{ clipPath: 'inset(0 ' + (100 - percent) + '% 0 0)' }} aria-hidden="true"/>
     {[1, 2].map(half => <button type="button" key={half} disabled={disabled} className={'nh-register-half nh-register-half-' + half} aria-label={'Sätt betyg ' + (index * 2 + half) + ' av 10'} title={(index * 2 + half) + ' / 10'} onClick={() => onChange(index * 2 + half)}/>)}
    </span>;
        })}
  </span>
  <span className="nh-register-rating-number">{value === null ? '–' : value + '/10'}</span>
  {value !== null && <button type="button" className="nh-register-clear" aria-label="Rensa betyg" title="Rensa betyg" disabled={disabled} onClick={() => onChange(null)}><X size={13}/></button>}
 </span>;
}
function Editor({ item, kind, onApply, onClose, onDirtyChange }: {
    item: MediaItem;
    kind: Kind;
    onApply: (next: Changes) => void;
    onClose: () => void;
    onDirtyChange: (dirty: boolean) => void;
}) {
    const [title, setTitle] = useState(item.title);
    const [year, setYear] = useState(String((kind === 'films' ? item.year : item.startYear) ?? ''));
    const [genres, setGenres] = useState(item.genres.join(', '));
    const [review, setReview] = useState(item.ourReview || '');
    const [synopsis, setSynopsis] = useState(item.synopsis || '');
    const [status, setStatus] = useState(item.status || 'Inte sett');
    const [error, setError] = useState('');
    const dirty = title !== item.title || year !== String((kind === 'films' ? item.year : item.startYear) ?? '') || genres !== item.genres.join(', ') || review !== (item.ourReview || '') || synopsis !== (item.synopsis || '') || status !== (item.status || 'Inte sett');
    useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
    const close = () => { if (!dirty || window.confirm('Kasta ändringarna i den öppna redigeringen?'))
        onClose(); };
    const closeRef = useRef(close);
    closeRef.current = close;
    useBackHandler(180, () => { closeRef.current(); return true; });
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; const keyboard = (e: KeyboardEvent) => { if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
    } }; document.addEventListener('keydown', keyboard); return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keyboard); previous?.focus(); }; }, []);
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = genres.split(',').map(x => x.trim()).filter(Boolean);
        if (!title.trim() || title.length > 250 || !parsed.length || parsed.length > 15 || parsed.some(g => g.length > 80) || new Set(parsed.map(x => x.toLocaleLowerCase('sv'))).size !== parsed.length) {
            setError('Kontrollera titel och genrer. Varje genre ska vara unik.');
            return;
        }
        if (kind === 'films' && (!/^\d{4}$/.test(year) || +year < 1880 || +year > 2100)) {
            setError('Ange ett giltigt filmår.');
            return;
        }
        if (kind === 'series' && year !== '' && (!/^\d{4}$/.test(year) || +year < 1880 || +year > 2100)) {
            setError('Ange ett giltigt startår eller lämna tomt.');
            return;
        }
        if (review.length > 12000 || synopsis.length > 5000) {
            setError('Omdöme eller handling är för lång.');
            return;
        }
        onApply({
            title: title.trim(), genres: parsed,
            ...(kind === 'films' ? { year: +year, status } : { startYear: year === '' ? null : +year }),
            ourReview: review.trim() || null, synopsis: synopsis.trim() || null
        });
        onClose();
    };
    return <div className="nh-register-modal-backdrop" onClick={close}>
  <div className="nh-register-modal" role="dialog" aria-modal="true" aria-label={'Redigera ' + item.title} onClick={e => e.stopPropagation()}>
   <div className="nh-register-modal-heading"><div><span>REDIGERA · {kind === 'films' ? 'FILM' : 'SERIE'}</span><h2>{item.title}</h2></div><button type="button" aria-label="Stäng redigering" onClick={close}><X size={20}/></button></div>
   <form onSubmit={submit}>
    <div className="nh-register-form-fields">
     <label>Titel<input value={title} maxLength={250} onChange={e => setTitle(e.target.value)} required/></label>
     <label>{kind === 'films' ? 'Filmår' : 'Startår'}<input type="number" min="1880" max="2100" value={year} onChange={e => setYear(e.target.value)} required={kind === 'films'}/></label>
     <label className="nh-register-wide">Genrer, kommaseparerade <small>Den första genren är huvudgenre.</small><input value={genres} onChange={e => setGenres(e.target.value)} required/></label>
     {kind === 'films' && <label className="nh-register-wide">Visningsstatus<select value={status} onChange={e => setStatus(e.target.value)}>{['Inte sett', 'Sedd', 'Pågående', 'Vill se', 'Avbruten'].map(x => <option key={x}>{x}</option>)}</select></label>}
     <label className="nh-register-wide">Personligt omdöme<textarea value={review} onChange={e => setReview(e.target.value)} maxLength={12000} rows={3}/></label>
     <label className="nh-register-wide">Handling<textarea value={synopsis} onChange={e => setSynopsis(e.target.value)} maxLength={5000} rows={3}/></label>
    </div>
    {error && <p className="nh-register-alert" role="alert"><AlertCircle size={16}/>{error}</p>}
    <p className="nh-register-editor-note">Ändringarna läggs i din osparade lista. Inget skickas till GitHub förrän du väljer Spara ändringar.</p>
    <div className="nh-register-modal-actions"><button type="button" className="secondary" onClick={close}>Avbryt</button><button type="submit" className="primary">Lägg till ändringar <ChevronRight size={16}/></button></div>
   </form>
  </div>
 </div>;
}
export default function MediaRegister({ onDirtyChange, selectedKind, hideSwitcher = false }: {
    onDirtyChange?: (dirty: boolean) => void;
    selectedKind?: Kind;
    hideSwitcher?: boolean;
}) {
    const [kind, setKind] = useState<Kind>(selectedKind || 'films');
    useEffect(() => { if (selectedKind) {
        setKind(selectedKind);
        setCategory('alla');
        setSearch('');
    } }, [selectedKind]);
    const [editorDirty, setEditorDirty] = useState(false);
    const [data, setData] = useState<{
        films: Payload | null;
        series: Payload | null;
    }>({ films: null, series: null });
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState<Pending>(blank);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('alla');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<{
        kind: Kind;
        key: string;
    } | null>(null);
    const [posterRevision, refreshPosters] = usePosterRevision();
    const pendingCount = countEdits(pending);
    useEffect(() => { onDirtyChange?.(pendingCount > 0 || editorDirty); return () => onDirtyChange?.(false); }, [pendingCount, editorDirty, onDirtyChange]);
    useEffect(() => {
        if (!pendingCount && !editorDirty)
            return;
        const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', leave);
        return () => window.removeEventListener('beforeunload', leave);
    }, [pendingCount, editorDirty]);
    useEffect(() => {
        let active = true;
        void refreshPosters();
        Promise.allSettled([read('films'), read('series')]).then(results => {
            if (!active)
                return;
            setData({ films: results[0].status === 'fulfilled' ? results[0].value : null, series: results[1].status === 'fulfilled' ? results[1].value : null });
            const failed = results.filter(x => x.status === 'rejected');
            if (failed.length)
                setError('Kunde inte läsa ' + (failed.length === 2 ? 'registren' : results[0].status === 'rejected' ? 'filmregistret' : 'serieregistret') + '. Försök uppdatera.');
            setLoading(false);
        });
        return () => { active = false; onDirtyChange?.(false); };
    }, [onDirtyChange]);
    const originals = data[kind]?.register[kind] || [];
    const projected = (item: MediaItem, which: Kind) => ({ ...item, ...pending[which][identity(which, item)] });
    const available = useMemo(() => GENRE_GROUPS.filter(group => originals.some(item => groupKey(projected(item, kind)) === group.id)), [originals, kind, pending]);
    const visible = useMemo(() => originals
        .map(item => ({ original: item, item: projected(item, kind), key: identity(kind, item) }))
        .filter(({ item }) => (category === 'alla' || groupKey(item) === category) && [item.title, item.genres?.join(' ') || '', String(item.year ?? item.startYear ?? ''), item.imdbId || ''].join(' ').toLocaleLowerCase('sv').includes(search.trim().toLocaleLowerCase('sv')))
        .sort((a, b) => a.item.title.localeCompare(b.item.title, 'sv') || String(a.item.year ?? a.item.startYear ?? '').localeCompare(String(b.item.year ?? b.item.startYear ?? ''))), [originals, kind, pending, category, search]);
    const currentEdit = editing ? ((data[editing.kind]?.register[editing.kind] || []).find(item => identity(editing.kind, item) === editing.key)) : undefined;
    const setChanges = (which: Kind, key: string, changes: Changes) => {
        const original = (data[which]?.register[which] || []).find(item => identity(which, item) === key);
        if (!original)
            return;
        setPending(prev => {
            const value: Changes = { ...prev[which][key], ...changes };
            for (const property of Object.keys(value) as (keyof Changes)[]) {
                const old = property === 'favorite' ? !!original.favorite : ((original as any)[property] ?? null);
                const next = (value as any)[property] ?? null;
                if (JSON.stringify(old) === JSON.stringify(next))
                    delete (value as any)[property];
            }
            const nextSection = { ...prev[which] };
            if (Object.keys(value).length)
                nextSection[key] = value;
            else
                delete nextSection[key];
            return { ...prev, [which]: nextSection };
        });
        setMessage('');
        setError('');
    };
    const toggleSeen = (which: Kind, key: string, item: MediaItem, original: MediaItem) => {
        const currentlySeen = which === 'films' ? item.status === 'Sedd' : item.allSeasonsAvailableInSwedenWatched === true;
        const originallySeen = which === 'films' ? original.status === 'Sedd' : original.allSeasonsAvailableInSwedenWatched === true;
        if (which === 'films') {
            setChanges(which, key, { status: currentlySeen ? (originallySeen ? 'Inte sett' : original.status || 'Inte sett') : 'Sedd' });
            return;
        }
        const nextSeen = !currentlySeen;
        setChanges(which, key, {
            allSeasonsAvailableInSwedenWatched: nextSeen,
            status: nextSeen
                ? (originallySeen ? original.status || 'Sedd – alla säsonger tillgängliga i Sverige' : 'Sedd – alla säsonger tillgängliga i Sverige')
                : (originallySeen ? ((item.watchedSeasons?.length || 0) > 0 ? 'Sedd – angivna säsonger' : 'Inte sett') : original.status || 'Inte sett'),
            wantToWatch: nextSeen && !originallySeen ? false : original.wantToWatch
        });
    };
    const refresh = async () => {
        if (pendingCount && !window.confirm('Kasta alla osparade ändringar och läsa om GitHub?'))
            return;
        cancelDraftWrites('media'); setLoading(true);
        setMessage('');
        setError('');
        setPending(blank());
        const results = await Promise.allSettled([read('films', true), read('series', true)]);
        setData({ films: results[0].status === 'fulfilled' ? results[0].value : null, series: results[1].status === 'fulfilled' ? results[1].value : null });
        if (results.some(r => r.status === 'rejected'))
            setError('Ett eller båda registren kunde inte läsas om.');
        void refreshPosters();
        setLoading(false);
    };
    const save = async () => {
        if (!pendingCount || saving)
            return;
        setSaving(true);
        setError('');
        setMessage('');
        let savedRows = 0;
        const warnings: string[] = [];
        try {
            for (const which of ['films', 'series'] as const) {
                const keys = Object.keys(pending[which]);
                if (!keys.length)
                    continue;
                const snapshot = data[which];
                if (!snapshot)
                    throw Error('Registret saknas. Inga ändringar för ' + which + ' kunde skickas.');
                const originals = snapshot.register[which] || [];
                const edits = keys.map(key => {
                    const item = originals.find(row => identity(which, row) === key);
                    if (!item)
                        throw Error('En titel kunde inte hittas igen. Inga ändringar för ' + which + ' skickades.');
                    return { target: which === 'films' ? item.imdbId : { title: item.title, startYear: item.startYear ?? null, imdbId: item.imdbId || null }, changes: pending[which][key] };
                });
                const response = await mediaFetch('/api/media-register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: which, expectedSha: snapshot.sha, edits }) });
                const result = await response.json() as SaveResult;
                if (!response.ok || !result.saved)
                    throw Error(result.error || 'GitHub avvisade ändringen.');
                savedRows += keys.length;
                if (result.warning)
                    warnings.push(result.warning);
                setData(prev => ({ ...prev, [which]: { sha: result.sha, register: result.register } }));
                setPending(prev => ({ ...prev, [which]: {} }));
            }
            setMessage(savedRows + ' ' + (savedRows === 1 ? 'titel uppdaterad' : 'titlar uppdaterade') + ' i GitHub.' + (warnings.length ? ' ' + warnings.join(' ') : ''));
        }
        catch (e: any) {
            setError((savedRows ? savedRows + ' titlar sparades, men resten är kvar som osparade. ' : '') + (e?.message || 'Kunde inte spara.'));
        }
        finally {
            setSaving(false);
        }
    };
    const discard = () => { if (window.confirm('Kasta alla ' + pendingCount + ' osparade titeländringar?')) { cancelDraftWrites('media');
        setPending(blank());
        setError('');
        setMessage('Ändringarna ångrades.');
    } };
    return <section className="nh-register-page" aria-labelledby="nh-register-heading">
  <header className="nh-register-heading">
   <MaterialIcon tone="violet" size={53}><LibraryBig size={32}/></MaterialIcon>
   <div><span className="nh-register-eyebrow">NEXUS HUB · DITT MEDIABIBLIOTEK</span><h1 id="nh-register-heading">Register</h1><p>Snabb överblick och redigering av dina filmer och serier.</p></div>
  </header>
  {!hideSwitcher && <div className="nh-register-switch" role="group" aria-label="Välj register">
   <button type="button" className={kind === 'films' ? 'active' : ''} aria-pressed={kind === 'films'} onClick={() => { setKind('films'); setCategory('alla'); setSearch(''); }}><Clapperboard size={19}/>Filmer</button>
   <button type="button" className={kind === 'series' ? 'active' : ''} aria-pressed={kind === 'series'} onClick={() => { setKind('series'); setCategory('alla'); setSearch(''); }}><Tv size={19}/>Serier</button>
  </div>}<div className="nh-register-tools">
   <label className="nh-register-search"><Search size={18}/><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={kind === 'films' ? 'Sök bland filmer…' : 'Sök bland serier…'} aria-label="Sök titlar"/></label>
   <label className="nh-register-filter"><span>Huvudgenre</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="alla">Alla huvudgenrer</option>{available.map(group => <option value={group.id} key={group.id}>{group.label}</option>)}</select></label>
  </div>
  <div className="nh-register-summary"><span>{loading ? 'Läser registren…' : visible.length + ' av ' + originals.length + ' ' + (kind === 'films' ? 'filmer' : 'serier')}</span><button type="button" onClick={refresh} disabled={saving || loading}><RefreshCw size={15}/>Läs om GitHub</button></div>
  {error && <p className="nh-register-alert" role="alert"><AlertCircle size={18}/>{error}</p>}
  {message && <p className="nh-register-success" role="status"><CheckCircle2 size={17}/>{message}</p>}
  <div className="nh-register-list" aria-label={kind === 'films' ? 'Filmregister' : 'Serieregister'}>
   {visible.map(({ original, item, key }) => {
            const changed = !!pending[kind][key];
            const seen = kind === 'films' ? item.status === 'Sedd' : item.allSeasonsAvailableInSwedenWatched === true;
            const posterKey = kind === 'films' ? original.imdbId : (original.imdbId || ((original.startYear !== null && original.startYear !== undefined) ? original.title + '|' + original.startYear : null));
            return <div className={'nh-register-row' + (changed ? ' modified' : '')} key={key}>
     <span className="nh-register-poster">{posterKey ? <RepositoryPoster kind={kind} posterKey={posterKey} revision={posterRevision} alt={'Affisch: ' + item.title}><span className="nh-register-poster-empty">{kind === 'films' ? <Clapperboard size={19}/> : <Tv size={19}/>}</span></RepositoryPoster> : <span className="nh-register-poster-empty">{kind === 'films' ? <Clapperboard size={19}/> : <Tv size={19}/>}</span>}</span>
     <div className="nh-register-main"><div className="nh-register-name">{item.title}{changed && <span className="nh-register-modified" title="Osparade ändringar">Ändrad</span>}</div><div className="nh-register-meta">{item.year ?? item.startYear ?? 'År okänt'} · {item.genres?.[0] || 'Ingen genre'}</div><RatingEditor disabled={saving} value={item.ourRating ?? null} onChange={rating => setChanges(kind, key, { ourRating: rating })}/></div>
     <div className="nh-register-row-actions">
      <button type="button" className={'nh-register-viewed' + (seen ? ' selected' : '')} disabled={saving} aria-pressed={seen} aria-label={(seen ? (kind === 'films' ? 'Markera som inte sedd: ' : 'Markera som inte helt sedd: ') : (kind === 'films' ? 'Markera som sedd: ' : 'Markera hela serien som sedd: ')) + item.title} title={seen ? (kind === 'films' ? 'Markera som inte sedd' : 'Markera serien som inte helt sedd') : (kind === 'films' ? 'Markera som sedd' : 'Markera hela serien som sedd')} onClick={() => toggleSeen(kind, key, item, original)}>{seen ? <Eye size={19} aria-hidden="true"/> : <EyeOff size={19} aria-hidden="true"/>}</button>
      <button type="button" className={'nh-register-favorite' + (item.favorite ? ' selected' : '')} disabled={saving} aria-pressed={!!item.favorite} aria-label={(item.favorite ? 'Ta bort favorit: ' : 'Lägg till favorit: ') + item.title} title={item.favorite ? 'Ta bort favorit' : 'Lägg till favorit'} onClick={() => setChanges(kind, key, { favorite: !item.favorite })}><Heart fill={item.favorite ? 'currentColor' : 'none'} size={19}/></button>
      <button type="button" className="nh-register-edit" disabled={saving} onClick={() => setEditing({ kind, key })}><Pencil size={15}/><span>Redigera</span></button>
     </div>
    </div>;
        })}
   {!loading && !visible.length && <p className="nh-register-empty">{data[kind] ? 'Inga titlar matchar din sökning eller kategori.' : 'Registret är inte tillgängligt just nu.'}</p>}
  </div>
  {pendingCount > 0 && <div className="nh-register-savebar" role="region" aria-label="Osparade ändringar">
   <div><strong>{pendingCount} {pendingCount === 1 ? 'ändrad titel' : 'ändrade titlar'}</strong><small>Inget är sparat ännu</small></div>
   <button type="button" className="nh-register-discard" disabled={saving} onClick={discard}><RotateCcw size={16}/>Ångra</button>
   <button type="button" className="primary nh-register-save" disabled={saving} onClick={save}>{saving ? <RefreshCw className="spin" size={17}/> : <Save size={17}/>} {saving ? 'Sparar…' : 'Spara ändringar'}</button>
  </div>}
  {editing && currentEdit && <Editor key={editing.key + '|' + editing.kind} onDirtyChange={setEditorDirty} kind={editing.kind} item={projected(currentEdit, editing.kind)} onApply={changes => setChanges(editing.kind, editing.key, changes)} onClose={() => setEditing(null)}/>}
 </section>;
}
