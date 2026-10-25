'use client';
import MaterialIcon from '@/components/MaterialIcon';
import React, { useState } from 'react';
import RepositoryPoster from '@/components/repository-poster';
import { Clapperboard, Bookmark, Layers, Plus, Tag, Tv, ChevronRight, ChevronDown, RefreshCw, BarChart3 } from 'lucide-react';
type Category = {
    id: string;
    label: string;
    count: number;
    children?: {
        id: string;
        label: string;
        count: number;
    }[];
};
type Preview = {
    key: string;
    title: string;
};
type Group = {
    id: string;
    label: string;
    items: Category[];
};
type Metric = {
    label: string;
    value: number;
};
type Props = {
    mode: 'films' | 'series';
    total: number;
    metrics: Metric[];
    groups: Group[];
    selectedId: string | null;
    previews?: Record<string, Preview[]>;
    posterRevision?: string;
    onSelect: (id: string | null) => void;
    onShowAll: () => void;
    onStatistics?: () => void;
    onRefresh: () => void;
    loading: boolean;
    toolbar?: React.ReactNode;
};
export function GenreSubfilters({ category, onSelect, mode }: {
    category: Category;
    onSelect: (id: string | null) => void;
    mode: 'films' | 'series';
}) {
    if (!category.children?.length)
        return null;
    return <div className="nh-genre-results-filter" aria-label={'Undergenrer inom ' + category.label}>
  <div className="nh-genre-results-heading"><strong>{category.label}</strong><span>{category.count.toLocaleString('sv-SE')} {mode === 'films' ? 'filmer' : 'serier'} · välj en undergenre för ett snävare urval</span></div>
  <div className="nh-genre-results-chips">{category.children.map(child => <button key={child.id} type="button" onClick={() => onSelect(child.id)}><Tag size={14} aria-hidden="true"/>{child.label}<small>{child.count}</small></button>)}</div>
 </div>;
}
export default function MediaOverview({ mode, total, metrics, groups, selectedId, onSelect, onShowAll, onStatistics, onRefresh, loading, toolbar, previews = {}, posterRevision = '' }: Props) {
    const [activeGroup, setActiveGroup] = useState('genre');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const chosen = groups.find(g => g.id === activeGroup) || groups[0] || { id: 'genre', label: 'Huvudgenrer', items: [] };
    const title = mode === 'films' ? 'Filmer' : 'Serier';
    const MainIcon = mode === 'films' ? Clapperboard : Tv;
    const watchId = mode === 'films' ? 'status:Vill se' : 'status:villse';
    const totalMetric = metrics.find(m => m.label === 'Registrerade')?.value ?? total;
    const watchMetric = metrics.find(m => m.label === 'Vill se')?.value ?? 0;
    const visible = chosen?.items?.slice(0, chosen.id === 'genre' || expanded[chosen.id] ? undefined : 6) || [];
    const pairs = Array.from({ length: Math.ceil(visible.length / 2) }, (_, i) => visible.slice(i * 2, i * 2 + 2));
    return <section className="nh-module-dashboard nh-media-dashboard" aria-labelledby="nh-media-heading">
  <header className="nh-module-dashboard-header">
   <div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone={mode === 'films' ? 'ruby' : 'blue'} size={48}><MainIcon size={29} aria-hidden="true"/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · {mode === 'films' ? 'DITT FILMBIBLIOTEK' : 'DITT SERIEBIBLIOTEK'}</span><h1 id="nh-media-heading">{title}</h1><p>{mode === 'films' ? 'Välj en genre och hitta dina filmer.' : 'Välj en genre och hitta dina serier.'}</p></div></div>
   <div className="nh-module-heading-actions">{onStatistics && <button className="secondary nh-stat-open" type="button" onClick={onStatistics} aria-label="Statistik – tittartid och utgivningsår"><BarChart3 size={17}/>Statistik</button>}<button className="nh-dashboard-refresh" type="button" disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading ? 'spin' : ''}/>Uppdatera</button></div>
  </header>
  <div className="nh-media-quick-links" aria-label={title + ' – snabbval'}>
   <button type="button" className="nh-media-quick-link" disabled={loading} aria-label={loading ? 'Hämtar registret' : 'Visa alla ' + total + ' registrerade ' + (mode === 'films' ? 'filmer' : 'serier')} onClick={onShowAll}>
    <MaterialIcon tone="violet" size={30}><Layers size={19} aria-hidden="true"/></MaterialIcon><span><strong>{loading && total === 0 ? '–' : totalMetric.toLocaleString('sv-SE')}</strong><small>Registrerade</small></span><ChevronRight size={15} aria-hidden="true"/>
   </button>
   <button type="button" disabled={loading} className={'nh-media-quick-link nh-media-wishlist-link' + (selectedId === watchId ? ' active' : '')} onClick={() => onSelect(watchId)} aria-pressed={selectedId === watchId}>
    <MaterialIcon tone="violet" size={30}><Bookmark size={19} aria-hidden="true"/></MaterialIcon><span><strong>{loading && total === 0 ? '–' : watchMetric.toLocaleString('sv-SE')}</strong><small>Vill se</small></span><ChevronRight size={15} aria-hidden="true"/>
   </button>
  </div>
  {toolbar}
  <div className="nh-module-category-head"><div><span className="nh-module-eyebrow">UTFORSKA</span><h2>{chosen.id === 'genre' ? 'Huvudgenrer' : chosen.label}</h2><p>{chosen.id === 'genre' ? 'Välj en genre för att se dina titlar.' : 'Välj en kategori för att se dina titlar.'}</p></div></div>
  <nav className="nh-category-tabs" aria-label="Välj typ av kategori">
   {groups.map(g => <button key={g.id} type="button" aria-current={chosen?.id === g.id ? 'true' : undefined} className={chosen?.id === g.id ? 'active' : ''} onClick={() => setActiveGroup(g.id)}>{g.label}</button>)}
  </nav>
  <div className="nh-module-category-grid nh-media-category-grid" aria-label={chosen?.label || 'Kategorier'}>
   {pairs.map((pair, i) => {
            return <React.Fragment key={pair.map(x => x.id).join('|')}>
     {pair.map((x, j) => {
                    const selected = selectedId === x.id || !!x.children?.some(child => child.id === selectedId);
                    const categoryButton = <button type="button" className={'nh-module-category-card nh-category-' + (i * 2 + j) % 4 + (selected ? ' selected' : '')} aria-pressed={selectedId === x.id} onClick={() => onSelect(x.id)}>
       <span className="nh-category-icon"><MaterialIcon tone={mode === 'films' ? 'ruby' : 'blue'} size={33}>{chosen.id === 'genre' ? (mode === 'films' ? <Clapperboard size={22}/> : <Tv size={22}/>) : chosen.id === 'provider' ? <Tv size={22}/> : chosen.id === 'filmseries' ? <Clapperboard size={22}/> : <Layers size={22}/>}</MaterialIcon></span><span className="nh-category-copy"><strong>{x.label}</strong><small>{x.count.toLocaleString('sv-SE')} {mode === 'films' ? (x.count === 1 ? 'film' : 'filmer') : (x.count === 1 ? 'serie' : 'serier')}</small></span><ChevronRight size={18} className="nh-category-arrow"/>
      </button>;
                    if (chosen.id !== 'genre')
                        return <React.Fragment key={x.id}>{categoryButton}</React.Fragment>;
                    const posters = previews[x.id] || [];
                    return <div className="nh-genre-category nh-genre-category-unified" key={x.id}>
       {categoryButton}
       {posters.length > 0 && <div className="nh-genre-poster-strip" data-kind={mode} aria-label={'Senast tillagda med affisch i ' + x.label}>
        {posters.map(poster => <span className="nh-genre-poster" key={poster.key} title={poster.title}><RepositoryPoster kind={mode} posterKey={poster.key} revision={posterRevision} alt={poster.title}><span className="nh-genre-poster-fallback" aria-hidden="true">{mode === 'films' ? <Clapperboard size={15}/> : <Tv size={15}/>}</span></RepositoryPoster></span>)}
       </div>}
      </div>;
                })}
    </React.Fragment>;
        })}
  </div>
  {chosen?.id !== 'genre' && chosen?.items.length > 6 && <button type="button" className="nh-category-expand" onClick={() => setExpanded(x => ({ ...x, [chosen.id]: !x[chosen.id] }))} aria-expanded={!!expanded[chosen.id]}>{expanded[chosen.id] ? 'Visa färre' : 'Visa alla ' + chosen.items.length + ' i ' + chosen.label.toLowerCase()}<ChevronDown className={expanded[chosen.id] ? 'nh-rotated' : ''} size={17}/></button>}
 </section>;
}
