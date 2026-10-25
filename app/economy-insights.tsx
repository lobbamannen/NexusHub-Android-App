'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, BarChart3, ChevronDown, ChevronRight, Edit3, FolderTree, Loader2, Package, Plus, Save, Search, Tags, X } from 'lucide-react';
import { useBackHandler } from '@/components/NativeBackBridge';
import { buildEconomyDashboard } from '@/lib/economy-dashboard.mjs';
import { normalizeReceiptName } from '@/lib/economy-intelligence.mjs';
import './economy-intelligence.css';

type Category = { id: string; name: string };
type Group = { id: string; name: string; category_id: string; aliases: string[] };
type Product = { id: string; name: string; group_id: string; aliases: string[]; package?: { value: number; unit: string } };
export type CatalogFile<T> = { path: string; sha: string; data: T };
export type EconomyCatalogSnapshot = {
  categories: CatalogFile<{ schema_version: 1; categories: Category[]; groups: Group[]; legacy_category_map: Record<string,string> }>;
  products: CatalogFile<{ schema_version: 1; products: Product[] }>;
};
type Kind = 'category' | 'group' | 'product';
type Edit = { kind: Kind; id: string; name: string; parentId: string; aliases: string; packageValue: string; packageUnit: string; isNew: boolean };
type SaveEntry = (kind: Kind, entry: Category | Group | Product) => Promise<void>;
type DashboardPeriod = {path:string;label:string;startDate:string|null;endDate:string|null;totalOre:number;purchases:number;reviewCount:number;
  purchasesMissingArticles:number;unallocatedOre:number;reconciliationDifferenceOre:number;periodWarning:string|null;
  categoryRows:{id:string;name:string;amountOre:number;lineCount:number;widthPercent:number}[];
  groupRows:{id:string;name:string;categoryName:string;amountOre:number;lineCount:number}[];
  unknownArticles:{name:string;count:number;amountOre:number}[];
  priceComparisons:{productId:string;name:string;minUnitOre:number;maxUnitOre:number;samples:number}[];};
const kronor = (ore: number) => (ore / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 });
const periodRange = (period: {startDate:string|null;endDate:string|null}) => `${period.startDate || 'Startdatum okänt'} – ${period.endDate || 'pågående / slutdatum ej registrerat'}`;

export function EconomyInsights({ files, catalog, onCatalog }: { files: any[]; catalog: EconomyCatalogSnapshot | null; onCatalog: () => void }) {
  const [selected, setSelected] = useState('');
  const [showGroups, setShowGroups] = useState(false);
  const report = useMemo<{periods:DashboardPeriod[]}>(() => catalog ? buildEconomyDashboard(files, catalog.categories.data, catalog.products.data) : { periods: [] }, [files, catalog]);
  const active = report.periods.find(period => period.path === selected) || report.periods[0];
  return <div className="nh-eco-insight nh-economy-register">
    <div className="nh-economy-register-top"><div><span className="hub-section-kicker">EKONOMIANALYS</span><h2>Vad handlar vi?</h2><p>Riktiga kvittobelopp, fördelade mellan utbetalningarna.</p></div><BarChart3 size={25} color="#77d8a4"/></div>
    {!catalog ? <p className="nh-eco-note">Katalogen kunde inte läsas. Statistik visas inte förrän underlaget finns.</p> : !active ? <p className="nh-eco-note">Inga ekonomiperioder finns ännu.</p> : <>
      <label className="nh-eco-period-picker">Ekonomiperiod <select value={active.path} onChange={event => setSelected(event.target.value)}>{report.periods.map(period => <option value={period.path} key={period.path}>{period.label}</option>)}</select></label>
      <p className="nh-eco-date">{periodRange(active)}</p>
      {active.periodWarning && <p className="nh-eco-warning">{active.periodWarning}</p>}
      <div className="nh-eco-summary">
        <div><small>Registrerade gemensamma köp</small><strong>{kronor(active.totalOre)}</strong><span>{active.purchases} köp i perioden</span></div>
        <div><small>Artiklar att granska</small><strong>{active.reviewCount}</strong><span>{active.purchasesMissingArticles} köp utan artikelrader</span></div>
      </div>
      {active.unallocatedOre !== 0 && <p className="nh-eco-warning"><Tags size={16}/> {kronor(active.unallocatedOre)} saknar fullständig artikeluppdelning. Beloppet visas som ospecificerat och räknas inte in i en påhittad produktkategori.</p>}
      {!!active.reconciliationDifferenceOre && <p className="nh-eco-warning">Artikelraderna skiljer sig från köpens totalsummor med sammanlagt {kronor(active.reconciliationDifferenceOre)}. Kontrollera kvittooriginalet.</p>}
      <div className="nh-eco-panel-heading"><h3>Utgifter per kategori</h3><small>Netto inklusive identifierbara rabatter</small></div>
      <div className="nh-eco-bars">{active.categoryRows.map(group => <div className="nh-eco-bar-row" key={group.id}>
        <div className="nh-eco-bar-label"><span>{group.name}</span><strong>{kronor(group.amountOre)}</strong></div>
        <div className="nh-eco-bar-track"><span style={{width: `${group.widthPercent}%`}}/></div>
      </div>)}{!active.categoryRows.length && <p className="nh-eco-note">Inga kategoribelopp ännu.</p>}</div>
      <button className="nh-eco-text-button" type="button" aria-expanded={showGroups} onClick={() => setShowGroups(current => !current)}>
        <FolderTree size={17}/> Produktgrupper ({active.groupRows.length}) {showGroups ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}
      </button>
      {showGroups && <div className="nh-eco-review-list">{active.groupRows.map(group => <div key={group.id}><span>{group.name}<small>{group.categoryName} · {group.lineCount} rad{group.lineCount === 1 ? '' : 'er'}</small></span><strong>{kronor(group.amountOre)}</strong></div>)}
        {!active.groupRows.length && <p className="nh-eco-note">Inga produktgrupper i den här perioden.</p>}
      </div>}
      <div className="nh-eco-panel-heading"><h3>Produktgranskning</h3><small>Okända och ospecificerade artiklar</small></div>
      {active.unknownArticles.length ? <div className="nh-eco-review-list">{active.unknownArticles.slice(0,25).map(item => <div key={normalizeReceiptName(item.name)}><span>{item.name}<small>{item.count} rad{item.count === 1 ? '' : 'er'}</small></span><strong>{kronor(item.amountOre)}</strong></div>)}</div> : <p className="nh-eco-note">Alla artikelrader har en känd produktgrupp eller historisk kategori.</p>}
      <button className="nh-eco-text-button" type="button" onClick={onCatalog}><Tags size={17}/> Öppna Kategorier & produkter <ChevronRight size={17}/></button>
      <div className="nh-eco-panel-heading"><h3>Prisjämförelser</h3><small>Endast samma exakt identifierade produkt</small></div>
      {active.priceComparisons.length ? <div className="nh-eco-review-list">{active.priceComparisons.map(item => <div key={item.productId}><span>{item.name}<small>{item.samples} jämförbara köp</small></span><strong>{kronor(item.minUnitOre)} – {kronor(item.maxUnitOre)}</strong></div>)}</div> : <p className="nh-eco-note">Ännu för få säkert identifierade återkommande produkter för tillförlitlig prisjämförelse.</p>}
    </>}
    <p className="nh-eco-footnote">Budgetposter är planerade belopp, inte extra registrerade köp. Pant och generella rabatter särredovisas när de inte kan knytas säkert till en artikel.</p>
  </div>;
}

function newId(name: string, ids: string[]) {
  const base = normalizeReceiptName(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/å/g,'a').replace(/ä/g,'a').replace(/ö/g,'o')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50) || 'artikel';
  let id = base.length < 2 ? 'id-' + base : base, n = 2;
  while (ids.includes(id)) id = `${base.slice(0,46)}-${n++}`;
  return id;
}
function formFor(kind: Kind, value?: Category | Group | Product): Edit {
  const obj: any = value || {};
  return { kind, id: obj.id || '', name: obj.name || '', parentId: obj.category_id || obj.group_id || '', aliases: (obj.aliases || []).join('\n'),
    packageValue: obj.package?.value ? String(obj.package.value) : '', packageUnit: obj.package?.unit || 'st', isNew: !value };
}

export function EconomyCatalog({ catalog, files, save, onDirtyChange }: { catalog: EconomyCatalogSnapshot | null; files: any[]; save: SaveEntry; onDirtyChange: (editing: boolean) => void }) {
  const [tab, setTab] = useState<Kind>('category');
  const [editing, setEditing] = useState<Edit | null>(null);
  const [linkName, setLinkName] = useState('');
  const [linkGroup, setLinkGroup] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => { onDirtyChange(!!editing || !!linkName || working); return () => onDirtyChange(false); }, [editing, linkName, working, onDirtyChange]);
  useBackHandler(120, () => { if (!editing && !linkName) return false; if (!working) {setEditing(null);setLinkName('');setError('');} return true; });
  const cat = catalog?.categories.data, products = catalog?.products.data;
  const dashboard = useMemo(() => catalog ? buildEconomyDashboard(files, cat, products) : {periods:[]}, [files, catalog, cat, products]);
  const groups = cat?.groups || [], cats = cat?.categories || [];
  const all = tab === 'category' ? cats : tab === 'group' ? groups : products?.products || [];
  const list = all.filter(entry => [entry.name,entry.id,...(('aliases' in entry && Array.isArray(entry.aliases)) ? entry.aliases : [])].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));
  const unknown = new Map<string,{name:string,count:number}>();
  for (const period of dashboard.periods) for (const item of period.unknownArticles) {
    const key = normalizeReceiptName(item.name), old = unknown.get(key);
    unknown.set(key,{name:item.name,count:(old?.count||0)+item.count});
  }
  const perform = async (kind:Kind, entry:Category|Group|Product) => { setWorking(true);setError('');try {await save(kind,entry);setEditing(null);setLinkName('');}catch(e:any){setError(e.message||'Kunde inte spara.');}finally{setWorking(false);} };
  const submit = (event:React.FormEvent) => {
    event.preventDefault();if(!editing||!catalog||working)return;
    const name=editing.name.trim();if(!name){setError('Ange ett namn.');return;}
    const ids=(editing.kind==='category'?cats:editing.kind==='group'?groups:products?.products||[]).map(item=>item.id);
    const id=editing.isNew?newId(name,ids):editing.id;
    const aliases=editing.aliases.split(/[\n,]+/).map(value=>value.trim()).filter(Boolean);
    if(editing.kind==='category') void perform('category',{id,name});
    else if(editing.kind==='group') void perform('group',{id,name,category_id:editing.parentId||cats[0]?.id||'',aliases});
    else {
      const value=editing.packageValue.trim().replace(',','.');
      const pack=value?{value:Number(value),unit:editing.packageUnit}:undefined;
      void perform('product',{id,name,group_id:editing.parentId||groups[0]?.id||'',aliases,...(pack?{package:pack}:{})});
    }
  };
  const link = () => {
    const group = groups.find(value=>value.id===linkGroup);
    if(!group){setError('Välj vilken produktgrupp artikeln tillhör.');return;}
    const alias=linkName.trim();
    if(group.aliases.some(value=>normalizeReceiptName(value)===normalizeReceiptName(alias))){setLinkName('');return;}
    void perform('group',{...group,aliases:[...group.aliases,alias]});
  };
  return <div className="nh-eco-catalog nh-economy-register">
    <div className="nh-economy-register-top"><div><span className="hub-section-kicker">PRODUKTKATALOG</span><h2>Kategorier & produkter</h2><p>En gemensam uppsättning regler för alla kvitton, gamla som nya.</p></div><Tags size={26} color="#77d8a4"/></div>
    <div className="nh-eco-summary nh-eco-summary-three">
      <div><small>Huvudkategorier</small><strong>{cats.length}</strong></div>
      <div><small>Produktgrupper</small><strong>{groups.length}</strong></div>
      <div><small>Säkra produkter</small><strong>{products?.products.length||0}</strong></div>
    </div>
    <div className="nh-economy-tabs" role="group" aria-label="Välj katalognivå">{([['category','Kategorier'],['group','Produktgrupper'],['product','Produkter']] as const).map(([value,name])=><button key={value} type="button" className={tab===value?'active':''} aria-pressed={tab===value} onClick={()=>{setTab(value);setQuery('');setEditing(null);}}>{name}</button>)}</div>
    <div className="nh-eco-catalog-actions"><label className="nh-economy-search"><Search size={17}/><input placeholder="Sök kategorier och artikelnamn…" value={query} onChange={event=>setQuery(event.target.value)}/></label><button type="button" className="primary" disabled={!catalog||working} onClick={()=>setEditing(formFor(tab))}><Plus size={16}/>Lägg till</button></div>
    {error&&<p className="nh-economy-error" role="alert">{error}</p>}
    <div className="nh-eco-catalog-list">{list.map(entry => <button key={entry.id} type="button" onClick={()=>{setError('');setEditing(formFor(tab,entry));}}>
      <span className="nh-eco-catalog-icon">{tab==='category'?<FolderTree size={18}/>:tab==='group'?<Tags size={18}/>:<Package size={18}/>}</span>
      <span><strong>{entry.name}</strong><small>{tab==='category' ? `${groups.filter(group=>group.category_id===entry.id).length} produktgrupper` : tab==='group' ? `${cats.find(cat=>cat.id===(entry as Group).category_id)?.name||'Okänd kategori'} · ${(entry as Group).aliases.length} namnkopplingar` : `${groups.find(group=>group.id===(entry as Product).group_id)?.name||'Okänd grupp'} · ${(entry as Product).aliases.length} kvittonamn`}</small></span>
      <Edit3 size={16}/>
    </button>)}{!list.length&&<p className="nh-eco-note">Inga träffar.</p>}</div>
    <div className="nh-eco-panel-heading"><h3>Artiklar att lära in</h3><small>Okända artikelnamn från sparade kvitton</small></div>
    {unknown.size?<div className="nh-eco-review-list">{Array.from(unknown.entries()).slice(0,40).map(([key,item])=><div key={key}><span>{item.name}<small>{item.count} förekomster</small></span><button className="nh-eco-small-button" type="button" onClick={()=>{setLinkName(item.name);setLinkGroup(groups[0]?.id||'');setEditing(null);}}>Koppla</button></div>)}</div>:<p className="nh-eco-note">Inga omatchade artikelnamn just nu. Vissa historiska generella kategorier kan fortfarande behöva förfinas.</p>}
    {linkName&&<div className="nh-eco-inline-form"><h3>Koppla kvittonamn</h3><p><strong>{linkName}</strong> ska tillhöra vilken produktgrupp?</p><label>Produktgrupp<select value={linkGroup} onChange={event=>setLinkGroup(event.target.value)}>{groups.map(group=><option key={group.id} value={group.id}>{cats.find(cat=>cat.id===group.category_id)?.name} · {group.name}</option>)}</select></label><div className="nh-eco-form-buttons"><button type="button" onClick={()=>setLinkName('')} disabled={working}>Avbryt</button><button type="button" className="primary" onClick={link} disabled={working}>{working?<Loader2 className="spin" size={16}/>:<Save size={16}/>}Spara koppling</button></div></div>}
    <p className="nh-eco-footnote">Att ändra en kategori eller koppla ett kvittonamn påverkar analysen direkt, inte originalkvittot. För exakt prisjämförelse används endast säkra produktidentiteter; generella namn förblir produktgrupper.</p>
    {editing&&<div className="nh-economy-overlay" role="presentation"><form className="nh-economy-editor" onSubmit={submit} aria-label="Redigera katalogpost">
      <div className="nh-economy-editor-head"><div><p className="eyebrow">KATALOG · {editing.kind==='category'?'KATEGORI':editing.kind==='group'?'PRODUKTGRUPP':'PRODUKT'}</p><h2>{editing.isNew?'Ny post':'Redigera post'}</h2></div><button type="button" aria-label="Stäng redigering" onClick={()=>setEditing(null)} disabled={working}><X size={20}/></button></div>
      <div className="nh-economy-fields">
        <label>Namn<input value={editing.name} required maxLength={120} onChange={event=>setEditing({...editing,name:event.target.value})}/></label>
        {editing.kind==='group'&&<label>Huvudkategori<select value={editing.parentId||cats[0]?.id||''} onChange={event=>setEditing({...editing,parentId:event.target.value})}>{cats.map(cat=><option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>}
        {editing.kind==='product'&&<label>Produktgrupp<select value={editing.parentId||groups[0]?.id||''} onChange={event=>setEditing({...editing,parentId:event.target.value})}>{groups.map(group=><option key={group.id} value={group.id}>{cats.find(cat=>cat.id===group.category_id)?.name} · {group.name}</option>)}</select></label>}
        {editing.kind!=='category'&&<label>Kvittonamn som ska kännas igen (ett per rad)<textarea value={editing.aliases} placeholder="Precis så som det står på kvittot" onChange={event=>setEditing({...editing,aliases:event.target.value})}/></label>}
        {editing.kind==='product'&&<div className="nh-eco-package"><label>Förpackningsstorlek (om säker)<input type="number" min="0.001" step="any" value={editing.packageValue} onChange={event=>setEditing({...editing,packageValue:event.target.value})}/></label><label>Enhet<select value={editing.packageUnit} onChange={event=>setEditing({...editing,packageUnit:event.target.value})}>{['st','g','kg','ml','l'].map(unit=><option key={unit}>{unit}</option>)}</select></label></div>}
      </div>
      {error&&<p className="nh-economy-error" role="alert">{error}</p>}
      <div className="nh-economy-editor-actions"><button type="button" className="secondary" onClick={()=>setEditing(null)} disabled={working}>Avbryt</button><button type="submit" className="primary" disabled={working}>{working?<Loader2 className="spin" size={16}/>:<Save size={16}/>}Spara i GitHub</button></div>
    </form></div>}
  </div>;
}
