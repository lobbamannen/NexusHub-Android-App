'use client';

import EconomySyncNote, { type EconomyDraftTarget } from '@/components/economy/EconomySyncNote';
import { cancelQueuedEdits, cancelSupersededEconomyWrites } from '@/platform/outbox';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, BarChart3, ChevronDown, ChevronRight, Coins, LibraryBig, Edit3, Loader2, Plus, RefreshCw, Save, Search, Tags, X } from 'lucide-react';
import MaterialIcon from '@/components/MaterialIcon';
import { useBackHandler } from '@/components/NativeBackBridge';
import { EconomyInsights, EconomyCatalog, type EconomyCatalogSnapshot } from './economy-insights';
import { removeEconomyArticle, renameEconomyArticle } from '@/lib/economy-articles.mjs';
import './economy.css';

type Article = { name: string; quantity_or_weight?: string | null; unit_price_sek?: number | null; line_amount_sek: number; category?: string | null; note?: string | null; source_row?: number; product_id?: string; group_id?: string; discount_for_index?: number; discount_for_source_row?: number };
type BudgetEntry = { id: string; name: string; type: string; monthly_amount_sek: number };
type Purchase = { id: string; date: string | null; description: string; category: string; amount_sek: number; status?: string; paid_by?: string | null; articles?: Article[]; article_reconciliation?: string };
type EconomyFile = { path: string; sha: string; data: { entries?: BudgetEntry[]; purchases?: Purchase[]; period?: { label?: string; start_date?: string; end_date?: string | null } } };
type Row = { key: string; source: EconomyFile; kind: 'budget' | 'purchase'; person: 'Robin' | 'Rebecca' | 'Gemensamt'; entry: BudgetEntry | Purchase };
type Form = { attempted: boolean; row: Row | null; kind: 'budget' | 'purchase'; person: 'Robin' | 'Rebecca' | 'Gemensamt'; file: EconomyFile; id: string; name: string; type: string; amount: string; date: string; category: string; status: string; articles: Article[] };
const money = (n: number) => n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 });
const makeId = () => 'manual-' + crypto.randomUUID();
const numeric = (value: string) => Number(value.replace(/\s/g, '').replace(',', '.'));
const validAmount = (value: string) => { const number = numeric(value); return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100000000 && Math.abs(Math.round(number * 100) - number * 100) < .000001; };
function personFor(path: string): Row['person'] { return path.includes('/Robin/') ? 'Robin' : path.includes('/Rebecca/') ? 'Rebecca' : 'Gemensamt'; }
function createForm(file: EconomyFile, row: Row | null): Form {
  const kind = file.data.entries ? 'budget' : 'purchase';
  const entry: any = row?.entry;
  return { attempted: false, row, kind, person: personFor(file.path), file, id: entry?.id || makeId(),
    name: entry?.name || entry?.description || '', type: entry?.type || 'Fast utgift',
    amount: entry ? String(kind === 'budget' ? entry.monthly_amount_sek : entry.amount_sek) : '',
    date: entry?.date || new Date().toLocaleDateString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/-(\d{2})-(\d{2})$/, '-$1-$2'),
    category: entry?.category || 'Gemensamt – övrigt', status: entry?.status || 'Registrerad i Nexus Hub',
    articles: (entry?.articles || []).map((a: Article) => ({ ...a })) };
}
async function json(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Kunde inte läsa GitHub.');
  return data;
}
export default function Economy({ onDirtyChange }: { onDirtyChange?: (dirty: boolean, busy?: boolean, discard?: () => Promise<void>) => void }) {
  const [screen, setScreen] = useState<'overview' | 'register' | 'analysis' | 'catalog'>('overview');
  const [files, setFiles] = useState<EconomyFile[]>([]);
  const [catalog, setCatalog] = useState<EconomyCatalogSnapshot | null>(null);
  const [catalogEditing, setCatalogEditing] = useState(false);
  const [catalogTarget, setCatalogTarget] = useState<EconomyDraftTarget | null>(null);
  const catalogDirty = useCallback((editing: boolean, target: EconomyDraftTarget | null = null) => {setCatalogEditing(editing);setCatalogTarget(target);},[]);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scope, setScope] = useState<'Alla' | Row['person']>('Alla');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [articleEdit, setArticleEdit] = useState(false);
  const reload = async (force=true) => {
    setLoading(true); setError('');
    try { const response = await fetch('/api/economy', { cache: force?'reload':'no-store' }); const data = await json(response); setFiles(data.files); setCatalog(data.catalog); setError(data.catalogError || ''); setOfflineCopy(response.headers.get('X-Nexus-Offline') === 'true'); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(false); }, []);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent).detail?.view !== 'ekonomi') return;
      if (form || catalogEditing || saving || catalogSaving) { setNotice('Avsluta redigeringen innan du uppdaterar ekonomin.'); return; }
      void reload();
    };
    window.addEventListener('nexus-refresh-module', refresh);
    return () => window.removeEventListener('nexus-refresh-module', refresh);
  }, [form, catalogEditing, saving, catalogSaving]);
  useEffect(() => {
    const onCompleted = (event: Event) => {
      if ((event as CustomEvent<{ path?: string }>).detail?.path !== '/api/economy') return;
      if (!form && !catalogEditing && !catalogSaving && !saving) void reload();
      else setNotice('En väntande ekonomisparning slutfördes. Uppdatera registret när du är klar med redigeringen.');
    };
    window.addEventListener('nexus-write-completed', onCompleted);
    return () => window.removeEventListener('nexus-write-completed', onCompleted);
  }, [form, catalogEditing, catalogSaving, saving]);
  useEffect(() => {
    const target = form ? {path: form.file.path, id: form.id} : catalogTarget;
    onDirtyChange?.(!!form || catalogEditing, saving || catalogSaving, async () => { if(target) await cancelQueuedEdits('economy',target); });
    return () => onDirtyChange?.(false, false);
  }, [form, saving, catalogEditing, catalogSaving, catalogTarget, onDirtyChange]);
  const closeForm = async () => {
    if (!form || saving) return;
    setSaving(true);
    try { await cancelQueuedEdits('economy', { path: form.file.path, id: form.id }); setForm(null); setError(''); }
    catch (e: any) { setError('Sparförsöket kunde inte avbrytas. ' + e.message); }
    finally { setSaving(false); }
  };
  useBackHandler(120, () => { if (!form) return false; if (!saving) void closeForm(); return true; });
  useBackHandler(90, () => { if (screen === 'overview' || form || catalogEditing) return false; setScreen('overview'); window.scrollTo(0, 0); return true; });
  const rows = useMemo<Row[]>(() => files.flatMap(file => (file.data.entries || file.data.purchases || []).map(entry => ({
    key: file.path + ':' + entry.id, source: file, kind: file.data.entries ? 'budget' as const : 'purchase' as const,
    person: personFor(file.path), entry,
  }))), [files]);
  const categories = useMemo(() => [...new Set(rows.map(row => row.kind === 'budget' ? (row.entry as BudgetEntry).type : (row.entry as Purchase).category))].sort((a,b) => a.localeCompare(b, 'sv')), [rows]);
  const displayed = useMemo(() => rows.filter(row => {
    if (scope !== 'Alla' && row.person !== scope) return false;
    const group = row.kind === 'budget' ? (row.entry as BudgetEntry).type : (row.entry as Purchase).category;
    if (category && category !== group) return false;
    const entry: any = row.entry;
    const value = [entry.name, entry.description, entry.date, entry.type, entry.category, entry.status, ...(entry.articles || []).map((a: Article) => a.name)].filter(Boolean).join(' ').toLocaleLowerCase('sv');
    return value.includes(query.toLocaleLowerCase('sv'));
  }), [rows, scope, query, category]);
  const defaultPeriod = files.filter(file => !!file.data.purchases).sort((a,b) => b.path.localeCompare(a.path))[0];
  const openNew = () => {
    const file = scope === 'Robin' ? files.find(f => f.path === 'Ekonomi/Robin/budget.json')
      : scope === 'Rebecca' ? files.find(f => f.path === 'Ekonomi/Rebecca/budget.json')
      : defaultPeriod || files.find(f => !!f.data.entries);
    if (!file) { setError('Ingen skrivbar ekonomifil finns ännu.'); return; }
    setArticleEdit(false); setForm(createForm(file, null));
  };
  const edit = (row: Row) => { setArticleEdit(false); setForm(createForm(row.source, row)); };
  const set = (patch: Partial<Form>) => setForm(current => current ? { ...current, ...patch } : current);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form || saving) return;
    if (!validAmount(form.amount)) { setError('Ange ett giltigt belopp i kronor.'); return; }
    if (!form.name.trim()) { setError('Namn eller beskrivning saknas.'); return; }
    setError(''); setSaving(true); setForm(current => current ? {...current, attempted:true} : current);
    try {
      const changes: Record<string, any> = form.kind === 'budget'
        ? { name: form.name.trim(), type: form.type.trim(), monthly_amount_sek: numeric(form.amount) }
        : { description: form.name.trim(), category: form.category.trim(), date: form.date || null,
            amount_sek: numeric(form.amount), status: form.status.trim(), articles: form.articles };
      const input = { path: form.file.path, expectedSha: form.file.sha, action: form.row ? 'update' : 'create', id: form.id, changes };
      await cancelSupersededEconomyWrites(input);
      const result = await json(await fetch('/api/economy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
      setFiles(previous => previous.map(file => file.path === result.path ? { ...file, sha: result.sha, data: result.data } : file));
      setNotice('Sparat och verifierat i GitHub.');
      setForm(null);
    } catch (e: any) { setError(e.message + ' Ändringen ligger kvar i formuläret.'); }
    finally { setSaving(false); }
  };
  const articleSum = (articles: Article[]) => Math.round(articles.reduce((sum, a) => sum + (Number(a.line_amount_sek) || 0), 0) * 100) / 100;
  const saveCatalogEntry = async (kind: 'category'|'group'|'product', entry: any) => {
    if (!catalog || catalogSaving) throw Error('Katalogen är inte redo för sparning.');
    const slot = kind === 'product' ? 'products' : 'categories';
    const file = catalog[slot];
    setCatalogSaving(true);
    try {
      const input = { path: file.path, expectedSha: file.sha, action: 'upsert', kind, entry };
      await cancelSupersededEconomyWrites(input);
      const result = await json(await fetch('/api/economy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }));
      if (!result.saved || !result.sha || !result.data) throw Error('GitHub bekräftade inte katalogändringen.');
      setCatalog(previous => previous ? { ...previous, [slot]: { path: result.path, sha: result.sha, data: result.data } } : previous);
      setNotice('Katalogändringen är sparad i GitHub.');
      setError('');
    } catch (e: any) { setError(e.message || 'Kunde inte spara katalogändringen.'); throw e; }
    finally { setCatalogSaving(false); }
  };
  const periodCount = files.filter(file => !!file.data.purchases).length;
  return <section className="nh-economy nh-module-dashboard" aria-label="Ekonomi">
    <header className="nh-module-dashboard-header"><div className="nh-module-dashboard-title"><span className="nh-module-heading-icon">
      <MaterialIcon size={48} tone="green"><Coins size={29}/></MaterialIcon></span>
      <div><span className="nh-module-eyebrow">NEXUS HUB · EKONOMI</span><h1>Ekonomi</h1><p>Fasta budgetposter och gemensamma köp, direkt från GitHub.</p></div></div>
    </header>
    <div className="nh-story-primary-actions"><button type="button" className="primary" onClick={() => void reload()} disabled={loading || !!form || catalogEditing} aria-label="Uppdatera ekonomiregistret"><RefreshCw size={17} className={loading ? 'spin' : ''}/>Uppdatera</button></div>
    {offlineCopy && <p className="nh-eco-warning">Du ser en sparad offlinekopia. Nya uppgifter kan saknas tills GitHub går att nå igen.</p>}
    {error && screen === 'analysis' && <div role="alert" className="nh-economy-error">{error}</div>}
    {screen === 'overview' ? <div className="nh-economy-overview">
      <button type="button" className="nh-register-shortcut" onClick={() => { setScreen('register'); window.scrollTo(0, 0); }}>
        <span className="nh-economy-shortcut-icon"><MaterialIcon tone="blue" size={38}><LibraryBig size={25}/></MaterialIcon></span>
        <span className="nh-register-shortcut-copy"><strong>Register</strong><small>Alla fasta och rörliga utgifter · sök, läs och redigera</small><span>{loading ? 'Hämtar poster…' : rows.length + (rows.length===1?' post':' poster')+' i databasen'}</span></span>
        <ChevronRight size={23} aria-hidden="true"/>
      </button>
      <button type="button" className="nh-register-shortcut" onClick={() => { setScreen('analysis'); window.scrollTo(0, 0); }}>
        <span className="nh-economy-shortcut-icon"><MaterialIcon tone="violet" size={38}><BarChart3 size={25}/></MaterialIcon></span>
        <span className="nh-register-shortcut-copy"><strong>Analys</strong><small>Mat, godis, bebis, hushåll och annat – per utbetalningsperiod</small><span>{periodCount} ekonomiperiod{periodCount === 1 ? '' : 'er'}</span></span>
        <ChevronRight size={23} aria-hidden="true"/>
      </button>
      <button type="button" className="nh-register-shortcut" onClick={() => { setScreen('catalog'); window.scrollTo(0, 0); }}>
        <span className="nh-economy-shortcut-icon"><MaterialIcon tone="violet" size={38}><Tags size={25}/></MaterialIcon></span>
        <span className="nh-register-shortcut-copy"><strong>Kategorier & produkter</strong><small>Lär NexusHub nya kvittonamn och redigera produktgrupper</small><span>{catalog ? catalog.categories.data.groups.length + (catalog.categories.data.groups.length===1?' produktgrupp':' produktgrupper') : 'Hämtar katalog…'}</span></span>
        <ChevronRight size={23} aria-hidden="true"/>
      </button>
      {error && <div role="alert" className="nh-economy-error">{error}<button type="button" onClick={() => void reload()}>Försök igen</button></div>}
    </div> : <>
    <button type="button" className="nh-economy-back" disabled={!!form || catalogEditing || catalogSaving} onClick={() => { setScreen('overview'); window.scrollTo(0, 0); }}><ArrowLeft size={17}/>Tillbaka till Ekonomi</button>
    {screen === 'register' ? <div className="nh-economy-register">
      <div className="nh-economy-register-top"><div><span className="hub-section-kicker">EKONOMIREGISTER</span><h2>Alla poster</h2><p>{rows.length} registrerade poster · {periodCount} ekonomiperiod{periodCount === 1 ? '' : 'er'}</p></div><button className="primary" type="button" onClick={openNew} disabled={loading || !!form}><Plus size={17}/>Ny post</button></div>
      <div className="nh-economy-tabs" role="group" aria-label="Filtrera på hushållsdel">
        {(['Alla','Robin','Rebecca','Gemensamt'] as const).map(value => <button key={value} type="button" className={scope === value ? 'active' : ''} aria-pressed={scope === value} onClick={() => {setScope(value);setCategory('');}}>{value}</button>)}
      </div>
      <div className="nh-economy-controls"><label className="nh-economy-search"><Search size={17}/><input type="search" aria-label="Sök ekonomiposter" placeholder="Sök utgifter och artiklar…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" aria-label="Rensa sökning" onClick={() => setQuery('')}><X size={16}/></button>}</label><select aria-label="Filtrera kategori" value={category} onChange={e => setCategory(e.target.value)}><option value="">Alla kategorier</option>{categories.map(value => <option value={value} key={value}>{value}</option>)}</select></div>
      {error && <div role="alert" className="nh-economy-error">{error}</div>}
      {notice && <div role="status" className="nh-economy-success"><BadgeCheck size={18}/>{notice}<button type="button" onClick={() => setNotice('')} aria-label="Stäng meddelande"><X size={15}/></button></div>}
      {loading && !files.length ? <p className="nh-economy-loading"><Loader2 className="spin" size={19}/> Läser ekonomidata…</p> : displayed.length ? <div className="nh-economy-list">
        {displayed.map(row => {
          const entry: any = row.entry, purchase = row.kind === 'purchase', articles: Article[] = entry.articles || [];
          const isOpen = expanded === row.key;
          return <div className="nh-economy-entry" key={row.key}>
            <button type="button" className="nh-economy-entry-main" onClick={() => setExpanded(isOpen ? null : row.key)} aria-expanded={isOpen}>
              <span className="nh-economy-entry-icon"><Coins size={20}/></span>
              <span className="nh-economy-entry-content"><strong>{purchase ? entry.description : entry.name}</strong><small>{row.person} · {purchase ? (entry.date || 'Datum okänt') : 'Budget per månad'} · {purchase ? entry.category : entry.type}</small></span>
              <span className="nh-economy-entry-price">{money(purchase ? entry.amount_sek : entry.monthly_amount_sek)}</span>{isOpen ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
            </button>
            {isOpen && <div className="nh-economy-entry-detail">
              <p>{purchase ? 'Genomfört/registrerat köp' : 'Budgeterat månadsbelopp – inte betalningsbevis'}</p>
              {purchase && <><p>Status: {entry.status || 'Ej angiven'}{entry.paid_by ? ' · Betalat av: ' + entry.paid_by : ''}</p><p>{articles.length} artikelrader{articles.length ? ' · Summa ' + money(articleSum(articles)) : ''}</p>
                {!!articles.length && <div className="nh-economy-articles">{articles.map((article, index) => <div key={index}><span>{article.name}{article.quantity_or_weight ? ' · ' + article.quantity_or_weight : ''}</span><strong>{money(article.line_amount_sek)}</strong></div>)}</div>}
              </>}
              <button type="button" className="secondary" onClick={() => edit(row)}><Edit3 size={16}/>Redigera och spara</button>
            </div>}
          </div>;
        })}
      </div> : <div className="nh-economy-empty">Inga ekonomiposter matchar filtreringen.</div>}
    </div> : screen === 'analysis' ? <EconomyInsights files={files} catalog={catalog} onCatalog={() => {setScreen('catalog');window.scrollTo(0,0);}} /> :
      <><EconomyCatalog files={files} catalog={catalog} save={saveCatalogEntry} onDirtyChange={catalogDirty}/>
        {notice && <div role="status" className="nh-economy-success"><BadgeCheck size={18}/>{notice}<button type="button" onClick={() => setNotice('')} aria-label="Stäng meddelande"><X size={15}/></button></div>}
        {error && <div role="alert" className="nh-economy-error">{error}</div>}
      </>}
    </>}
    {form && <div className="nh-economy-overlay" role="presentation"><form className="nh-economy-editor" onSubmit={save} aria-label={form.row ? 'Redigera ekonomipost' : 'Skapa ekonomipost'}>
      <div className="nh-economy-editor-head"><div><p className="eyebrow">{form.person} · {form.kind === 'budget' ? 'FAST BUDGET' : 'RÖRLIGT KÖP'}</p><h2>{form.row ? 'Redigera post' : 'Ny post'}</h2></div><button type="button" aria-label="Stäng formulär" onClick={() => void closeForm()} disabled={saving}><X size={21}/></button></div>
      <fieldset className="nh-economy-fields" disabled={saving}>
        {!form.row && <label>Vilket register?<select value={form.file.path} onChange={e => { const file = files.find(item => item.path === e.target.value); if (file) setForm(createForm(file, null)); }} disabled={saving || form.attempted}>{files.filter(file => !!file.data.entries || !!file.data.purchases).map(file => <option key={file.path} value={file.path}>{personFor(file.path)}{file.data.period?.label ? ' · ' + file.data.period.label : ''}</option>)}</select></label>}
        <label>{form.kind === 'budget' ? 'Post' : 'Butik eller beskrivning'}<input required maxLength={280} value={form.name} onChange={e => set({name:e.target.value})}/></label>
        {form.kind === 'budget' ? <label>Typ<input required maxLength={100} value={form.type} onChange={e => set({type:e.target.value})}/></label> : <>
          <label>Kategori<input required maxLength={160} value={form.category} onChange={e => set({category:e.target.value})}/></label>
          <label>Datum (kan lämnas tomt)<input type="date" value={form.date} onChange={e => set({date:e.target.value})}/></label>
          <label>Status<input value={form.status} onChange={e => set({status:e.target.value})} maxLength={120}/></label>
        </>}
        <label>{form.kind === 'budget' ? 'Kronor per månad' : 'Köpets totalbelopp i kronor'}<input type="text" inputMode="decimal" required value={form.amount} onChange={e => set({amount:e.target.value})}/></label>
        {form.kind === 'purchase' && <div className="nh-economy-edit-articles">
          <button type="button" className="nh-economy-article-toggle" onClick={() => setArticleEdit(!articleEdit)}>Artiklar ({form.articles.length}) <ChevronDown size={17}/></button>
          {articleEdit && <><p>Rabatter och pant kan anges med minusbelopp. Köpbeloppet räknas aldrig två gånger.</p>
          {form.articles.map((article, index) => <div key={index} className="nh-economy-article-edit"><input aria-label={'Artikel ' + (index+1)} placeholder="Artikel" value={article.name} onChange={e => set({ articles: renameEconomyArticle(form.articles, index, e.target.value) })}/><input aria-label={'Artikelbelopp ' + (index+1)} inputMode="decimal" value={article.line_amount_sek} onChange={e => set({articles:form.articles.map((a,i)=>i===index?{...a,line_amount_sek:numeric(e.target.value)}:a)})}/><button type="button" aria-label="Ta bort artikelrad" onClick={() => set({ articles: removeEconomyArticle(form.articles, index) })}><X size={16}/></button></div>)}
          <button type="button" className="secondary" onClick={() => set({articles:[...form.articles,{name:'',line_amount_sek:0}]})}><Plus size={15}/>Lägg till artikelrad</button>
          <p>Artikelsumma: {money(articleSum(form.articles))}{form.articles.length && validAmount(form.amount) && Math.abs(articleSum(form.articles)-numeric(form.amount))>.01?' · Skiljer sig från köpbeloppet':''}</p></>}
        </div>}
      </fieldset>
      {error && <p className="nh-economy-error" role="alert">{error}</p>}
      <EconomySyncNote target={{path: form.file.path, id: form.id}}/>
      <div className="nh-economy-editor-actions"><button type="button" className="secondary" onClick={() => void closeForm()} disabled={saving}><ArrowLeft size={16}/>Avbryt</button><button type="submit" className="primary" disabled={saving}>{saving ? <Loader2 className="spin" size={17}/> : <Save size={17}/>}Spara i GitHub</button></div>
    </form></div>}
  </section>;
}
