'use client';
import { mediaFetch } from '@/lib/media-client';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Clapperboard, Clock3, Film, Tv, AlertCircle } from 'lucide-react';
import { formatRuntime, formatDays, mediaTotals, releaseYearGroups } from '@/lib/media-runtime.mjs';
type Props = {
    onBack: () => void;
    initialFilter?: 'alla' | 'filmer' | 'serier';
};
type FilmEntry = {
    imdbId: string;
    title: string;
    year: number;
    status: string;
    runtimeMetadata?: {
        minutes?: number;
        status?: string;
    };
};
type SeriesEntry = {
    imdbId?: string | null;
    title: string;
    startYear: number | null;
    watchedSeasons?: number[] | null;
    seasonRuntimeMetadata?: Record<string, {
        totalMinutes?: number | null;
        status?: string;
    }>;
};
export default function MediaStatistics({ onBack, initialFilter = 'alla' }: Props) {
    const [filter, setFilter] = useState<'alla' | 'filmer' | 'serier'>(initialFilter);
    const [films, setFilms] = useState<FilmEntry[]>([]);
    const [series, setSeries] = useState<SeriesEntry[]>([]);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        async function run() {
            try {
                const responses = await Promise.all([mediaFetch('/api/films', { cache: 'no-store', signal: controller.signal }), mediaFetch('/api/series', { cache: 'no-store', signal: controller.signal })]);
                const [f, s]: any[] = await Promise.all(responses.map(r => r.json()));
                if (!responses[0].ok || !responses[1].ok || !Array.isArray(f.register?.films) || !Array.isArray(s.register?.series))
                    throw Error(f.error || s.error || 'Kunde inte hämta båda registren.');
                if (active) {
                    setFilms(f.register.films);
                    setSeries(s.register.series);
                    setLoading(false);
                }
            }
            catch (e: any) {
                if (active && !controller.signal.aborted) {
                    setError(e.message || 'Statistiken kunde inte hämtas.');
                    setLoading(false);
                }
            }
        }
        void run();
        return () => { active = false; controller.abort(); };
    }, []);
    const totals = useMemo(() => mediaTotals(films, series), [films, series]);
    const years = useMemo(() => releaseYearGroups(films, series, filter), [films, series, filter]);
    const max = Math.max(1, ...years.flatMap(y => [y.films, y.series]));
    const selected = years.find(y => y.year === selectedYear);
    const unknown = totals.missing;
    const timeBasis = (verified: number, estimated: number) => <dl className="nh-stat-time-basis"><div><dt>Verifierad</dt><dd>{formatRuntime(verified)}</dd></div><div><dt>Uppskattad</dt><dd>{formatRuntime(estimated)}</dd></div></dl>;
    return <section className="nh-media-statistics" aria-label="Film- och seriestatistik">
  <div className="nh-stat-top"><button type="button" className="film-quiet text-button" onClick={onBack}><ArrowLeft size={18}/>Till biblioteket</button><span className="nh-stat-eyebrow"><BarChart3 size={16}/> STATISTIK</span></div>
  <h2>Din tid framför skärmen</h2>
  <p className="nh-stat-lead">Tittartid räknas bara för sedda filmer och uttryckligen markerade säsonger. Utgivningsåren visar när titlarna släpptes eller serierna började, inte när du såg dem.</p>
  {loading ? <div className="film-loading"><Clock3 size={22}/>Läser film- och serieregistren…</div> : error ? <div role="alert" className="film-error"><AlertCircle size={18}/>{error}</div> : <>
   <div className="nh-stat-grid">
    <div className="nh-stat-metric"><span><Clapperboard size={18}/> FILMER</span><strong>{formatRuntime(totals.movies.total)}</strong><small>{totals.movies.watched} sedda filmer</small>{timeBasis(totals.movies.verified, totals.movies.estimated)}{totals.movies.missing > 0 && <small className="nh-stat-missing">{totals.movies.missing} sedda filmer saknar speltid</small>}</div>
    <div className="nh-stat-metric"><span><Tv size={18}/> SERIER</span><strong>{formatRuntime(totals.shows.total)}</strong><small>{totals.shows.watched} markerade säsonger</small>{timeBasis(totals.shows.verified, totals.shows.estimated)}{totals.shows.missing > 0 && <small className="nh-stat-missing">{totals.shows.missing} sedda säsonger saknar speltid</small>}</div>
    <div className="nh-stat-metric primary"><span><Clock3 size={18}/> SAMMANLAGT</span><strong>{formatRuntime(totals.total)}</strong><small>{formatDays(totals.total)} · verifierad och uppskattad tid</small>{timeBasis(totals.verified, totals.estimated)}</div>
   </div>
   <section className="nh-stat-chart-panel">
    <div className="nh-stat-chart-heading"><div><h3>Utgivningsår</h3><p>Antal registrerade titlar efter filmens år eller seriens startår. Staplarna jämförs på samma skala.</p></div><div className="nh-stat-switch" aria-label="Filtrera årtalsdiagram">{([['alla', 'Alla'], ['filmer', 'Filmer'], ['serier', 'Serier']] as const).map(([value, title]) => <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'selected' : ''} onClick={() => { setFilter(value); setSelectedYear(null); }}>{title}</button>)}</div></div>
    {years.length ? <><p className="nh-year-scroll-hint" id="nh-year-scroll-hint"><span className="nh-year-hint-desktop">Svep eller rulla i sidled för fler år.</span><span className="nh-year-hint-mobile">Skrolla nedåt för fler år.</span> Tryck på ett år för att se titlarna.</p><div className="nh-year-chart-scroll" tabIndex={0} role="region" aria-label="Diagram över utgivningsår" aria-describedby="nh-year-scroll-hint"><div className={'nh-year-chart' + (filter === 'alla' ? ' nh-year-chart-paired' : '')} role="group" aria-label="Välj ett utgivningsår för att visa titlar">
     {years.map(y => <button key={y.year} type="button" className={'nh-year-column' + (y.year === selectedYear ? ' active' : '')} aria-label={y.year + ': ' + (y.films + y.series) + ' titlar, ' + y.films + ' filmer och ' + y.series + ' serier'} aria-pressed={y.year === selectedYear} onClick={() => setSelectedYear(y.year === selectedYear ? null : y.year)}>
      <span className="nh-year-bars" aria-hidden="true">
       {filter !== 'serier' && <span className="nh-year-bar-slot">{y.films > 0 && <span className="nh-year-bar-film" style={{ '--year-bar-size': (y.films / max * 100) + '%' } as React.CSSProperties}><span className="nh-year-count">{y.films}</span></span>}</span>}
       {filter !== 'filmer' && <span className="nh-year-bar-slot">{y.series > 0 && <span className="nh-year-bar-series" style={{ '--year-bar-size': (y.series / max * 100) + '%' } as React.CSSProperties}><span className="nh-year-count">{y.series}</span></span>}</span>}
      </span><span className="nh-year-label">{y.year}</span>
     </button>)}
    </div></div><div className="nh-year-legend">{filter !== 'serier' && <span><i className="film"/>Filmer</span>}{filter !== 'filmer' && <span><i className="series"/>Serier</span>}</div>
    {selected && <div className="nh-year-titles" aria-live="polite"><h4>{selected.year} · {selected.films} filmer · {selected.series} serier</h4><div>{[...selected.items].sort((a, b) => a.title.localeCompare(b.title, 'sv')).map(x => <span key={x.kind + x.key}><span>{x.kind === 'films' ? <Film size={14}/> : <Tv size={14}/>}</span>{x.title}</span>)}</div></div>}</> : <p>Inga utgivningsår finns registrerade.</p>}
   </section>
   <p className="nh-stat-footnote">Totalsumman omfattar alltid både film och serier; filtret ovan gäller bara årtalsdiagrammet.{unknown > 0 ? ' Sedda titlar och säsonger som saknar speltid räknas som sedda men bidrar inte till tittartiden.' : ''} Tid för omtittningar läggs inte till automatiskt. Internationella avsnittslistor kan skilja sig från utbudet i Sverige.</p>
  </>}
 </section>;
}
