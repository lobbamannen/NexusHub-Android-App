'use client';
import MaterialIcon from '@/components/MaterialIcon';
import React from 'react';
import { BookOpen, CheckCircle2, ChevronRight, Shuffle, Globe2, House, Castle, Layers, Scale, Star, Fingerprint } from 'lucide-react';
type StoryItem = {
    path: string;
    category: string;
    numericRating: number | null;
};
type Props = {
    stories: StoryItem[];
    categories: string[];
    counts: Record<string, number>;
    finishedCount: number;
    selectedCategory: string;
    loading: boolean;
    onSelectCategory: (name: string) => void;
    onSurprise: () => void;
    toolbar?: React.ReactNode;
};
// User-space coordinates keep the castle's horizontal and vertical strokes visible.
function HistoricalIcon(props: React.ComponentProps<typeof Castle>) {
    const inkId = 'historical-ink-' + React.useId().replace(/:/g, '');
    return <Castle {...props} style={{ ...props.style, stroke: `url(#${inkId})` }}><defs><linearGradient id={inkId} href="#ink-blue" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24"/></defs></Castle>;
}
const iconFor = (name: string) => name === 'Hemsökta hus' ? House : name === 'True crime' ? Scale : name === 'Brott' ? Fingerprint : name === 'Internetmysterier & nätfenomen' ? Globe2 : name === 'Historiska & paranormala mysterier' ? HistoricalIcon : BookOpen;
export default function StoryOverview({ stories, categories, counts, finishedCount, selectedCategory, loading, onSelectCategory, onSurprise, toolbar }: Props) {
    const total = stories.length;
    const rated = stories.filter(x => x.numericRating !== null).length;
    const metrics = [
        { label: 'Berättelser', value: total, icon: BookOpen, tone: 'purple' },
        { label: 'Kategorier', value: categories.length, icon: Layers, tone: 'blue' },
        { label: 'Med exakt betyg', value: rated, icon: Star, tone: 'pink' },
        { label: 'Lästa i GitHub', value: finishedCount, icon: CheckCircle2, tone: 'green' }
    ];
    return <section className="nh-module-dashboard nh-story-dashboard" aria-labelledby="nh-story-dashboard-title">
  <header className="nh-module-dashboard-header">
   <div className="nh-module-dashboard-title"><span className="nh-module-heading-icon"><MaterialIcon tone="blue" size={48}><BookOpen size={29} aria-hidden="true"/></MaterialIcon></span><div><span className="nh-module-eyebrow">NEXUS HUB · BERÄTTELSEBIBLIOTEKET</span><h1 id="nh-story-dashboard-title">Berättelser</h1><p>Hemsökta platser, verkliga fall, mysterier och fördjupande research – direkt från ditt arkiv.</p></div></div>
  </header>
  <div className="nh-story-primary-actions"><button type="button" className="primary" onClick={onSurprise} disabled={!total}><Shuffle size={17}/>Överraska mig</button></div>
  <div className="nh-module-stat-row nh-story-stat-row" aria-label="Berättelseöversikt">
   {metrics.map(({ label, value, icon: Icon, tone }) => <div key={label} className={'nh-module-stat nh-tone-' + tone}><MaterialIcon tone={tone === 'blue' ? 'blue' : tone === 'pink' ? 'pink' : 'violet'} size={30}><Icon size={23} aria-hidden="true"/></MaterialIcon><strong>{loading && !total ? '–' : value.toLocaleString('sv-SE')}</strong><span>{label}</span></div>)}
  </div>
  {toolbar}
  <div className="nh-module-category-head"><div><span className="nh-module-eyebrow">UPPTÄCK</span><h2>Utforska kategorier</h2><p>Välj ett ämne för att se dess berättelser direkt.</p></div></div>
  <div className="nh-module-category-grid" aria-label="Berättelsekategorier">
   {categories.map((name, index) => {
            const Icon = iconFor(name);
            const count = counts[name] || 0;
            return <button className={'nh-module-category-card nh-category-' + index % 4 + (selectedCategory === name ? ' selected' : '')} key={name} type="button" aria-pressed={selectedCategory === name} onClick={() => onSelectCategory(name)}>
    <span className="nh-category-icon"><MaterialIcon tone={name === 'Brott' ? 'ruby' : (['blue', 'pink', 'violet', 'blue'] as const)[index % 4]} size={33}><Icon size={25} aria-hidden="true"/></MaterialIcon></span><span className="nh-category-copy"><strong>{name}</strong><small>{count} {count === 1 ? 'berättelse' : 'berättelser'}</small></span><ChevronRight size={17} className="nh-category-arrow" aria-hidden="true"/>
   </button>;
        })}
  </div>
 </section>;
}
