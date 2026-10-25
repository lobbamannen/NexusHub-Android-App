'use client';
import { mediaFetch } from '@/lib/media-client';
import MaterialIcon from '@/components/MaterialIcon';
import React, { useEffect, useState } from 'react';
import { Bookmark, Clapperboard, Tv, ChevronRight } from 'lucide-react';
import { seriesIsWatchlisted } from '@/lib/media-discovery.mjs';
type Props = {
    onNavigate: (view: string) => void;
    onOpenMedia: (view: 'filmer' | 'serier', item: string) => void;
};
export default function WatchlistOverview({ onNavigate, onOpenMedia }: Props) {
    const [films, setFilms] = useState<any[] | null>(null), [series, setSeries] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
    useEffect(() => {
        setLoading(true);
        setError('');
        const controller = new AbortController();
        const get = async (url: string) => { const response = await mediaFetch(url, { signal: controller.signal, cache: 'no-store' }); if (!response.ok)
            throw Error('Registret kunde inte läsas'); return response.json() as Promise<any>; };
        Promise.allSettled([get('/api/films').then(d => setFilms(Array.isArray(d?.register?.films) ? d.register.films.filter((f: any) => f.status === 'Vill se') : [])).catch(() => { if (!controller.signal.aborted) {
                setFilms(null);
                setError('Filmregistret kunde inte hämtas.');
            } }),
            get('/api/series').then(d => setSeries(Array.isArray(d?.register?.series) ? d.register.series.filter((s: any) => seriesIsWatchlisted(s)) : [])).catch(() => { if (!controller.signal.aborted) {
                setSeries(null);
                setError('Serieregistret kunde inte hämtas.');
            } })]).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [retry]);
    return <section className="nh-module-dashboard nh-watchlist-dashboard" aria-labelledby="nh-watchlist-heading">
  <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="violet" size={48}><Bookmark size={28}/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · FILM & SERIER</span><h1 id="nh-watchlist-heading">Vill se</h1><p>Filmer och serier markerade som Vill se i GitHub.</p></div></div></header>
  {([{ title: 'Filmer', items: films, view: 'filmer', Icon: Clapperboard }, { title: 'Serier', items: series, view: 'serier', Icon: Tv }] as const).map(({ title, items, view, Icon }) => <div key={view} className="nh-watchlist-group">
    <div className="nh-module-category-head"><div><h2>{title} · {items === null ? '–' : items.length.toLocaleString('sv-SE')}</h2></div><button className="nh-watchlist-open" type="button" onClick={() => onNavigate(view)}>Öppna {title.toLowerCase()} <ChevronRight size={17}/></button></div>
    {items === null ? <div className="nh-dashboard-note" role={loading ? 'status' : 'alert'}><p>{loading ? 'Hämtar registret från GitHub…' : error || 'Registret kunde inte hämtas.'}</p>{!loading && <button className="secondary" onClick={() => setRetry(n => n + 1)}>Försök igen</button>}</div> : items.length === 0 ? <p className="nh-dashboard-note">Inga poster markerade Vill se.</p> : <div className="nh-watchlist-items">{items.map((item: any, i: number) => <button type="button" key={String(item.imdbId || item.title) + i} onClick={() => onOpenMedia(view, item.imdbId || `${item.title}|${item.startYear ?? ''}`)}><MaterialIcon tone={view === 'filmer' ? 'ruby' : 'blue'} size={28}><Icon size={18}/></MaterialIcon><span>{item.displayTitle || item.title || 'Utan titel'}</span><ChevronRight size={16}/></button>)}</div>}
  </div>)}
 </section>;
}
