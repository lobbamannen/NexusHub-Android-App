import {WatchHomeNotice} from '@/components/watch/ReleaseWatch';
import {useWatchState} from '@/components/watch/use-watch-state';
import './grouped-home.css';
'use client';
import DailyActivity from './DailyActivity';
import { mediaFetch } from '@/lib/media-client';
import React, { useEffect, useState } from 'react';
import DatabaseStats from './DatabaseStats';
import ModuleGrid from './ModuleGrid';
import RecentActivity from './RecentActivity';
import { usePosterRevision } from '@/components/repository-poster';
import './home-dashboard.css';
import {ideaDay} from '@/lib/idea-numbers.mjs';
import { seriesIsWatchlisted } from '@/lib/media-discovery.mjs';
type Props = {
    ideaCount: number | null;
    ideaEntries?: {id:string;number:number;createdAt:string}[];
    ideasStale: boolean;
    catalog: any;
    pluginRepo: any;
    stories: any[];
    recentFiles: any[];
    commits: any[];
    onNavigate: (view: string) => void;
    onOpenMedia: (view: 'filmer' | 'serier', item: string) => void;
    onOpenStory: (path: string) => void;
    onOpenFile: (item: any) => void;
};
export default function HomeDashboard({ ideaCount, ideaEntries=[], ideasStale, catalog, pluginRepo, stories, recentFiles, commits, onNavigate, onOpenMedia, onOpenStory, onOpenFile }: Props) {
    const {state:watchState}=useWatchState();
    const [posterRevision, refreshPosters] = usePosterRevision();
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        const update = () => setNow(new Date());
        update();
        const timer = window.setInterval(update, 60000);
        const midnight = window.setInterval(()=>setNow(previous=>{const current=new Date();return previous&&ideaDay(previous.toISOString())===ideaDay(current.toISOString())?previous:current;}),1000);
        const onVisible = () => { if (document.visibilityState === 'visible')
            update(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearInterval(timer);window.clearInterval(midnight); document.removeEventListener('visibilitychange', onVisible); };
    }, []);
    const greeting = now ? (now.getHours() < 5 ? 'God natt' : now.getHours() < 10 ? 'God morgon' : now.getHours() < 17 ? 'God dag' : now.getHours() < 22 ? 'God kväll' : 'God natt') : null;
    const [films, setFilms] = useState<any[]>([]);
    const [series, setSeries] = useState<any[]>([]);
    const [filmsLoaded, setFilmsLoaded] = useState(false);
    const [seriesLoaded, setSeriesLoaded] = useState(false);
    const [mediaLoading, setMediaLoading] = useState(true), [mediaError, setMediaError] = useState(''), [retry, setRetry] = useState(0);
    useEffect(() => {
        setMediaLoading(true);
        setMediaError('');
        void refreshPosters();
        const controller = new AbortController();
        const get = async (url: string) => {
            const response = await mediaFetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok)
                throw Error('Kunde inte läsa registret');
            return response.json() as Promise<any>;
        };
        Promise.allSettled([get('/api/films').then(d => { if (!controller.signal.aborted) {
                setFilms(Array.isArray(d?.register?.films) ? d.register.films : []);
                setFilmsLoaded(Array.isArray(d?.register?.films));
            } })
                .catch(() => { if (!controller.signal.aborted)
                setMediaError('Filmregistret kunde inte hämtas.'); }),
            get('/api/series').then(d => { if (!controller.signal.aborted) {
                setSeries(Array.isArray(d?.register?.series) ? d.register.series : []);
                setSeriesLoaded(Array.isArray(d?.register?.series));
            } })
                .catch(() => { if (!controller.signal.aborted)
                setMediaError('Serieregistret kunde inte hämtas.'); })]).finally(() => { if (!controller.signal.aborted)
            setMediaLoading(false); });
        return () => controller.abort();
    }, [catalog?.fetchedAt, retry]);
    const [additions,setAdditions]=useState<any>(null);
    useEffect(()=>{let active=true;void fetch('/api/media-additions').then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(active)setAdditions(d.data);}).catch(()=>{});return()=>{active=false;};},[catalog?.commit]);
    const plugins = Array.isArray(pluginRepo?.packages) ? pluginRepo.packages.filter((p: any) => !p.archived && !p.legacy) : [];
    // Same document scope as the Knowledge Bank overview.
    const knowledgeFiles = catalog ? catalog.documents.filter((d: any) => d.module === 'databas' && !d.technical && !d.asset).length : null;
    const counts = {
        watchNew:watchState.events.filter(event=>!event.readAt&&event.availability==='confirmed_available').length,
        ideas: ideaCount,
        ideasStale,
        files: typeof catalog?.fileCount === 'number' ? catalog.fileCount : null,
        knowledgeFiles,
        stories: catalog ? stories.length : null,
        plugins: pluginRepo ? plugins.length : null,
        films: filmsLoaded ? films.length : null,
        series: seriesLoaded ? series.length : null,
        watchlist: filmsLoaded && seriesLoaded ? films.filter(f => f.status === "Vill se").length + series.filter(s => seriesIsWatchlisted(s)).length : null
    };
    return <div className="nh-home">
  <header className="nh-home-welcome"><div className="nh-home-greeting" aria-live="off">{greeting || 'Välkommen till Nexus Hub'}<span className="nh-home-greeting-dot" aria-hidden="true">.</span></div><p className="nh-home-signature"><strong>Two Thumbs</strong>{' '}<span>Incorporated<sup>™</sup></span></p></header>
  <DailyActivity now={now} revision={catalog?.commit} ideaEntries={ideaEntries} ideasStale={ideasStale} onNavigate={onNavigate}/>
  <WatchHomeNotice onNavigate={onNavigate} state={watchState}/>
  <DatabaseStats now={now} counts={counts} checkedAt={catalog?.fetchedAt} onNavigate={onNavigate} loading={!catalog}/>
  <ModuleGrid counts={counts} onNavigate={onNavigate}/>
  <RecentActivity additions={additions} loading={mediaLoading} error={mediaError} onRetry={() => setRetry(n => n + 1)} posterRevision={posterRevision} films={films} series={series} stories={stories} files={recentFiles} plugins={plugins} commits={commits} onNavigate={onNavigate} onOpenMedia={onOpenMedia} onOpenStory={onOpenStory} onOpenFile={onOpenFile}/>
 </div>;
}
