'use client';
import React from 'react';
import MaterialIcon from '@/components/MaterialIcon';
import { BookOpen, Clapperboard, Database, FolderOpen, Bookmark, Puzzle, Dumbbell, Coins, ChevronRight } from 'lucide-react';
/** Complete bulb silhouette, including the base, for both icon and background art. */
function IdeaBulb({size=24,strokeWidth=2,className,...props}: React.SVGProps<SVGSVGElement> & {size?:number;strokeWidth?:number}) {
 return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
  <path d="M9 18h6" />
  <path d="M10 22h4" />
  <path d="M15.09 14a6 6 0 1 0-6.18 0c.8.54 1.09 1.2 1.09 2v.5h4V16c0-.8.29-1.46 1.09-2Z" />
 </svg>;
}
type Counts = {
    ideas: number | null;
    ideasStale: boolean;
    files: number | null;
    knowledgeFiles: number | null;
    stories: number | null;
    plugins: number | null;
    films: number | null;
    series: number | null;
    watchlist: number | null;
};
type Props = {
    counts: Counts;
    onNavigate: (view: string) => void;
};
const modules = [
    {id:'mottaget',title:'Mottagningsinkorg',description:'Delade filer, bilder, länkar och text',icon:FolderOpen,tone:'pink',art:'files'},
    {id:'attgora',title:'Att göra',description:'Dina uppgifter och nästa steg',icon:Bookmark,tone:'purple',art:'upload'},
    { id: 'filmer', title: 'Film & serier', description: 'Dina filmer, serier och betyg', icon: Clapperboard, tone: 'purple', art: 'cinema' },
    { id: 'berattelser', title: 'Berättelser', description: 'Research, mysterier och historier', icon: BookOpen, tone: 'pink', art: 'stories' },
    { id: 'databas', title: 'Kunskapsbanken', description: 'Dokument, metoder och forskning', icon: Database, tone: 'blue', art: 'knowledge' },
    { id: 'plugins', title: 'Plugins', description: 'Dina ChatGPT-verktyg', icon: Puzzle, tone: 'cyan', art: 'plugins' },
    { id: 'ekonomi', title: 'Ekonomi', description: 'Budget, räkningar och gemensamma köp', icon: Coins, tone: 'green', art: 'economy' },
    { id: 'traning', title: 'Träning', description: 'Din träning och utveckling', icon: Dumbbell, tone: 'orange', art: 'training' },
    { id: 'filer', title: 'Utforska filer', description: 'Sök och bläddra i GitHub-databasen', icon: FolderOpen, tone: 'blue', art: 'files' },
    { id: 'ideer', title: 'Idéinkorg', description: 'Fånga tanken. Utveckla den senare.', icon: IdeaBulb, tone: 'orange', art: 'ideas' },
    { id: 'villse', title: 'Vill se', description: 'Filmer och serier på din lista', icon: Bookmark, tone: 'purple', art: 'upload' }
] as const;
export default function ModuleGrid({ counts, onNavigate }: Props) {
    const formatted = (n: number | null) => typeof n === 'number' ? n.toLocaleString('sv-SE') : null;
    const films = formatted(counts.films), series = formatted(counts.series), stories = formatted(counts.stories), plugins = formatted(counts.plugins), watchlist = formatted(counts.watchlist), knowledgeFiles = formatted(counts.knowledgeFiles), files = formatted(counts.files);
    const details: Record<string, string | null> = { ideer: counts.ideas === null ? 'Kunde inte verifiera antal' : counts.ideas.toLocaleString('sv-SE') + ' nya idéer' + (counts.ideasStale ? ' · lokal vy' : ''), filmer: films !== null && series !== null ? films + ' filmer · ' + series + ' serier' : null, berattelser: stories !== null ? stories + ' berättelser' : null, databas: knowledgeFiles !== null ? knowledgeFiles + ' dokument' : null, filer: files !== null ? files + ' filer' : null, plugins: plugins !== null ? plugins + ' pluginpaket' : null, villse: watchlist !== null ? watchlist + ' objekt' : null };
    return <section className="nh-modules" aria-label="Utforska Nexus Hub">
  <div className="nh-module-grid">{modules.map(({ id, title, description, icon: Icon, tone, art }) => <button type="button" key={id} className={'nh-module-card nh-tone-' + tone + ' nh-art-' + art} onClick={() => onNavigate(id)}>
    <MaterialIcon size="module" tone={id === 'mottaget' ? 'pink' : id === 'attgora' ? 'violet' : id === 'filmer' ? 'ruby' : id === 'plugins' ? 'pink' : id === 'filer' || id === 'ekonomi' ? 'green' : id === 'villse' ? 'violet' : id === 'traning' || id === 'ideer' ? 'orange' : 'blue'} className="nh-module-symbol">
     <Icon size={35} aria-hidden="true"/>
    </MaterialIcon>
    <span className="nh-module-copy"><strong>{title}</strong><span>{description}</span>{details[id] && <span className="nh-module-count">{details[id]}</span>}</span>
    <span className="nh-module-decoration" aria-hidden="true"><Icon size={125} strokeWidth={0.7}/></span>
    <ChevronRight className="nh-module-chevron" size={22} aria-hidden="true"/>
   </button>)}</div>
 </section>;
}
