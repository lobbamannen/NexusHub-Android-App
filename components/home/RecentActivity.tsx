import {sortByAdded} from '@/lib/media-additions.mjs';
'use client';
import React, { useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronRight, Clapperboard, Clock3, FileText, Images, Puzzle, Tv } from 'lucide-react';
import RepositoryPoster from '@/components/repository-poster';
type Props = {
    additions?: any;
    loading?: boolean;
    error?: string;
    onRetry?: () => void;
    films: any[];
    series: any[];
    stories: any[];
    files: any[];
    plugins: any[];
    commits: any[];
    posterRevision: string;
    onNavigate: (view: string) => void;
    onOpenMedia: (view: 'filmer' | 'serier', item: string) => void;
    onOpenStory: (path: string) => void;
    onOpenFile: (item: any) => void;
};
type Tab = 'filmer' | 'serier' | 'berattelser' | 'filer' | 'plugins' | 'andringar';
const tabs: [
    Tab,
    string
][] = [['filmer', 'Filmer'], ['serier', 'Serier'], ['berattelser', 'Berättelser'], ['filer', 'Filer'], ['plugins', 'Plugins'], ['andringar', 'Ändringar']];
function Poster({ title, kind, posterKey, revision }: {
    title: string;
    kind: 'film' | 'series' | 'story';
    posterKey: string;
    revision: string;
}) {
    return <span className={'nh-recent-poster ' + (kind === 'series' ? 'nh-poster-series' : '')}><RepositoryPoster kind={kind === 'film' ? 'films' : kind === 'story' ? 'stories' : 'series'} posterKey={posterKey} revision={revision} alt={(kind === 'story' ? 'Omslag för ' : 'Affisch för ') + title}><span className="nh-poster-empty">{kind === 'series' ? <Tv size={32}/> : kind === 'story' ? <BookOpen size={32}/> : <Clapperboard size={32}/>}</span></RepositoryPoster></span>;
}
export default function RecentActivity({ additions, loading = false, error, onRetry, films, series, stories, files, plugins, commits, posterRevision, onNavigate, onOpenMedia, onOpenStory, onOpenFile }: Props) {
    const [tab, setTab] = useState<Tab>('filmer');
    const scroll = useRef<HTMLDivElement>(null);
    const selected = tabs.find(([id]) => id === tab)?.[1] || 'Filmer';
    const view = tab === 'filmer' ? 'filmer' : tab === 'serier' ? 'serier' : tab === 'berattelser' ? 'berattelser' : tab === 'plugins' ? 'plugins' : tab === 'andringar' ? 'installningar' : 'databas';
    const sortedCommits = [...commits].filter(c => c?.date).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
    const items = tab === 'filmer' ? sortByAdded(films,'films',additions).slice(0,9)
        : tab === 'serier' ? sortByAdded(series,'series',additions).slice(0,9)
            : tab === 'berattelser' ? sortByAdded(stories,'stories',additions).slice(0,9)
                : tab === 'filer' ? files.slice(0, 9)
                    : tab === 'plugins' ? plugins.slice(0, 9)
                        : sortedCommits;
    const note = tab === 'filmer' || tab === 'serier'
        ? (additions?.source==='git-first-registration'?'Senast först tillagda i GitHub; ändrade betyg räknas inte som nya titlar.':'Tilläggsdatum läses in. Titlar utan verifierat datum visas sist.')
        : tab === 'berattelser' ? 'Sorterade efter första registrering i GitHub när datum finns.'
            : tab === 'filer' ? 'Senast öppnade på den här enheten.'
                : tab === 'plugins' ? 'Aktiva paket i GitHub-katalogen.'
                    : 'Senaste registrerade GitHub-ändringarna.';
    return <section className="nh-recent nh-surface" aria-labelledby="nh-recent-title">
  <div className="nh-section-top nh-recent-heading">
   <div className="nh-section-heading"><Clock3 size={28}/><div><h2 id="nh-recent-title">Senaste i Nexus Hub</h2><p>{note}</p></div></div>
   <button type="button" className="nh-see-all" onClick={() => onNavigate(view)}>Visa {selected.toLowerCase()} <ArrowRight size={17}/></button>
  </div>
  <div role="tablist" aria-label="Senaste innehåll per kategori" className="nh-recent-tabs">
   {tabs.map(([id, label]) => <button key={id} role="tab" type="button" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
  </div>
  {(tab === 'filmer' || tab === 'serier') && loading && !items.length ? <div className="nh-recent-empty" role="status"><Clock3 size={28}/><p>Hämtar titlar från GitHub…</p></div> : (tab === 'filmer' || tab === 'serier') && error && !items.length ? <div className="nh-recent-empty" role="alert"><p>{error}</p><button className="secondary" onClick={onRetry}>Försök igen</button></div> : items.length === 0 ? <div className="nh-recent-empty"><Images size={28}/><p>Inget innehåll att visa för {selected.toLowerCase()} just nu.</p><button className="nh-see-all" onClick={() => onNavigate(view)}>Öppna modulen <ArrowRight size={16}/></button></div> :
            <div className="nh-recent-scroller">
   <div ref={scroll} className={'nh-recent-strip ' + (tab === 'filmer' || tab === 'serier' || tab === 'berattelser' ? 'nh-poster-strip' : 'nh-list-strip')}>
    {items.map((item: any, index: number) => {
                    if (tab === 'filmer' || tab === 'serier') {
                        const isFilm = tab === 'filmer';
                        const name = String(item.displayTitle || item.title || 'Utan titel');
                        const id = String(item.imdbId || '');
                        const year = isFilm ? item.year : item.startYear;
                        const shownTitle = year && !name.includes('(' + year + ')') ? name + ' (' + year + ')' : name;
                        return <button key={(id || name) + index} className="nh-recent-film" type="button" onClick={() => onOpenMedia(isFilm ? 'filmer' : 'serier', id || (String(item.title) + '|' + (item.startYear ?? '')))} aria-label={'Öppna ' + (isFilm ? 'filmer' : 'serier') + ': ' + name}>
       <Poster title={name} kind={isFilm ? 'film' : 'series'} posterKey={id || String(item.title) + '|' + (item.startYear ?? '')} revision={posterRevision}/>
       <strong>{shownTitle}</strong>
       <small>{item.status || 'Status ej uppgiven'}</small>
      </button>;
                    }
                    if (tab === 'berattelser')
                        return <button type="button" className="nh-recent-film nh-recent-story" key={item.path || index} onClick={() => item.path ? onOpenStory(item.path) : onNavigate('berattelser')} aria-label={'Öppna berättelse: ' + (item.title || 'Berättelse')}>
      <Poster title={item.title || 'Berättelse'} kind="story" posterKey={String(item.path || '')} revision={posterRevision}/>
      <strong>{item.title || 'Berättelse'}</strong><small>{item.category || 'Berättelsebibliotek'}</small>
     </button>;
                    if (tab === 'filer')
                        return <button type="button" className="nh-recent-list-card" key={item.path || index} onClick={() => onOpenFile(item)}>
      <FileText size={26}/><strong>{item.title || item.name || item.path || 'Dokument'}</strong><small>Öppna dokumentet</small><ChevronRight size={17} className="nh-card-arrow"/></button>;
                    if (tab === 'plugins')
                        return <button type="button" className="nh-recent-list-card" key={item.name || index} onClick={() => onOpenFile({ ...item, repoKey: 'plugins', title: item.title || item.name })}>
      <Puzzle size={26}/><strong>{item.name || item.title || 'Plugin'}</strong><small>{item.version ? 'Version ' + item.version : 'Pluginbibliotek'}</small><ChevronRight size={17} className="nh-card-arrow"/></button>;
                    return <a className="nh-recent-list-card" key={(item.repo || '') + (item.sha || index)} href={typeof item.url === 'string' && item.url.startsWith('https://github.com/') ? item.url : undefined} target="_blank" rel="noopener noreferrer">
      <Clock3 size={26}/><strong>{item.title || 'GitHub-ändring'}</strong><small>{item.repo || 'GitHub'} · {new Date(item.date).toLocaleDateString('sv-SE')}</small><ChevronRight size={17} className="nh-card-arrow"/></a>;
                })}
   </div>
   <button type="button" className="nh-recent-next" aria-label="Visa fler kort" onClick={() => scroll.current?.scrollBy({ left: Math.max(240, scroll.current.clientWidth * .7), behavior: 'smooth' })}><ChevronRight size={25}/></button>
  </div>}
 </section>;
}
