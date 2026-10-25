'use client';
import React, { useMemo, useState } from 'react';
import { LibraryBig, ChevronLeft, Search, RefreshCw, Heart, Pencil, Save, RotateCcw, BookOpen, Eye, EyeOff } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import RepositoryPoster from '@/components/repository-poster';
import { StoryRatingEditor } from './StoryRating';
import type { StoryChanges } from '@/app/use-story-register';
export default function StoryRegister({ stories, pending, revision, loading, saving, error, message, readPaths, readLoading, readBusy, readError, onToggleRead, onRetryRead, onChange, onEdit, onRead, onBack, onSave, onDiscard, onRefresh }: {
    stories: any[];
    pending: Record<string, StoryChanges>;
    revision: string;
    loading: boolean;
    saving: boolean;
    error: string;
    message: string;
    readPaths: string[];
    readLoading: boolean;
    readBusy: string;
    readError: string;
    onToggleRead: (path: string) => void;
    onRetryRead: () => void;
    onChange: (path: string, patch: StoryChanges) => void;
    onEdit: (path: string) => void;
    onRead: (path: string) => void;
    onBack: () => void;
    onSave: () => void;
    onDiscard: () => void;
    onRefresh: () => void;
}) {
    const [query, setQuery] = useState(''), [category, setCategory] = useState('alla'), [favoritesOnly, setFavoritesOnly] = useState(false);
    const categories = useMemo(() => [...new Set(stories.map(s => s.category))].sort((a, b) => a.localeCompare(b, 'sv')), [stories]);
    const visible = stories.filter(s => (!favoritesOnly || s.favorite) && (category === 'alla' || s.category === category) && [s.title, s.category, s.review || ''].join(' ').toLocaleLowerCase('sv').includes(query.trim().toLocaleLowerCase('sv'))).sort((a, b) => a.title.localeCompare(b.title, 'sv'));
    const count = Object.keys(pending).length;
    return <section className="nh-register-page story-register" aria-labelledby="story-register-heading">
  <button type="button" className="stories-text-button" onClick={onBack} disabled={saving}><ChevronLeft size={17}/>Tillbaka</button>
  <header className="nh-register-heading"><MaterialIcon tone="blue" size={53}><LibraryBig size={32}/></MaterialIcon><div><span className="nh-register-eyebrow">NEXUS HUB · BERÄTTELSER</span><h1 id="story-register-heading">Register</h1><p>Alla berättelser, betyg och omdömen. Hjärtat markerar favoriter; Sparad är en separat läsgenväg. Öga, betyg och favoriter sparas när du väljer Spara ändringar.</p></div></header>
  <div className="nh-register-tools"><label className="nh-register-search"><Search size={18}/><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Sök berättelser…" aria-label="Sök i berättelseregistret"/></label><label className="nh-register-filter"><span>Kategori</span><select value={category} onChange={e => setCategory(e.target.value)}><option value="alla">Alla kategorier</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label><button type="button" className="secondary" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(v => !v)}><Heart size={16} fill={favoritesOnly ? 'currentColor' : 'none'}/>{favoritesOnly ? 'Visar favoriter' : 'Favoriter'}</button></div>
  <div className="nh-register-summary"><span>{loading ? 'Läser GitHub…' : visible.length + ' av ' + stories.length + ' berättelser'}</span><button type="button" onClick={onRefresh} disabled={saving || loading}><RefreshCw size={15}/>Läs om GitHub</button></div>
  {error && <p role="alert" className="nh-register-alert">{error}</p>}{readError && <p role="alert" className="nh-register-alert">{readError} <button type="button" onClick={onRetryRead}>Försök igen</button></p>}{message && <p role="status" className="nh-register-success">{message}</p>}
  <div className="nh-register-list" aria-label="Berättelseregister">{visible.map(s => <div key={s.path} className={'nh-register-row' + (pending[s.path] ? ' modified' : '')}>
   <span className="nh-register-poster"><RepositoryPoster kind="stories" posterKey={s.path} revision={revision} alt={'Omslag: ' + s.title}><BookOpen size={20}/></RepositoryPoster></span>
   <div className="nh-register-main"><div className="nh-register-name">{s.title}{pending[s.path] && <span className="nh-register-modified">Ändrad</span>}</div><div className="nh-register-meta">{s.category}{readPaths.includes(s.path) ? ' · Läst' : ''}</div><StoryRatingEditor value={s.numericRating} disabled={loading || saving} onChange={rating => onChange(s.path, { rating })}/>{s.numericRating === null && s.ratingLabel !== 'Inget registrerat betyg' && <small className="nh-register-meta">{s.ratingLabel}</small>}{s.review && <p className="story-register-review">{s.review}</p>}</div>
   <div className="nh-register-row-actions"><button type="button" className={'nh-register-viewed' + (readPaths.includes(s.path) ? ' selected' : '')} disabled={loading || saving || readLoading || !!readBusy || !!readError} aria-pressed={readPaths.includes(s.path)} aria-label={(readPaths.includes(s.path) ? 'Markera som oläst: ' : 'Markera som läst: ') + s.title} title={readPaths.includes(s.path) ? 'Markera som oläst' : 'Markera som läst'} onClick={() => onToggleRead(s.path)}>{readPaths.includes(s.path) ? <Eye size={18} aria-hidden="true"/> : <EyeOff size={18} aria-hidden="true"/>}</button><button type="button" className={'nh-register-favorite' + (s.favorite ? ' selected' : '')} disabled={loading || saving} aria-pressed={!!s.favorite} aria-label={(s.favorite ? 'Ta bort favorit: ' : 'Lägg till favorit: ') + s.title} onClick={() => onChange(s.path, { favorite: !s.favorite })}><Heart size={18} fill={s.favorite ? 'currentColor' : 'none'}/></button><button type="button" className="nh-register-edit" disabled={loading || saving} aria-label={'Redigera ' + s.title} onClick={() => onEdit(s.path)}><Pencil size={15}/><span>Redigera</span></button><button type="button" className="nh-register-edit" disabled={saving} aria-label={'Läs ' + s.title} onClick={() => onRead(s.path)}><BookOpen size={15}/><span>Läs</span></button></div>
  </div>)}</div>
  {!loading && !visible.length && <p className="nh-register-empty">Inga berättelser matchar din sökning.</p>}
  {count > 0 && <div className="nh-register-savebar" role="region" aria-label="Osparade berättelseändringar"><div><strong>{count} {count === 1 ? 'ändrad berättelse' : 'ändrade berättelser'}</strong><small>Inget är sparat ännu</small></div><button type="button" className="nh-register-discard" disabled={saving} onClick={onDiscard}><RotateCcw size={16}/>Ångra</button><button type="button" className="primary nh-register-save" disabled={saving || loading} onClick={onSave}><Save size={16}/>{saving ? 'Sparar…' : 'Spara ändringar'}</button></div>}
 </section>;
}
