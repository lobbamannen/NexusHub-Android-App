import { normalizeReceiptName } from './economy-intelligence.mjs';

const isObject = item => !!item && typeof item === 'object' && !Array.isArray(item);
const fail = message => { throw new Error(message); };
const identifier = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(id);
const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const own = (record, keys) => Object.keys(record).every(key => keys.includes(key));
const idSet = list => new Set(list.map(row => row.id));

function checkUnique(list, labelText) {
  const ids = new Set();
  for (const row of list) {
    if (!isObject(row) || !identifier(row.id) || !label(row.name)) fail('Ogiltigt ID eller namn för ' + labelText + '.');
    if (ids.has(row.id)) fail('Dubblerat ID för ' + labelText + '.');
    ids.add(row.id);
  }
}
function checkAliases(list, existing = new Set()) {
  for (const row of list) {
    if (!Array.isArray(row.aliases) || row.aliases.length > 30) fail('För många alias.');
    for (const alias of row.aliases) {
      if (!label(alias) || alias.length > 160) fail('Ogiltigt alias.');
      const key = normalizeReceiptName(alias);
      if (!key || existing.has(key)) fail('Dubblerat eller otillåtet alias.');
      existing.add(key);
    }
  }
  return existing;
}
function checkPackage(value) {
  if (value == null) return;
  if (!isObject(value) || !own(value, ['value', 'unit']) || !Number.isFinite(value.value) || value.value <= 0 || value.value > 100000 || !['st','g','kg','ml','l'].includes(value.unit))
    fail('Ogiltig förpackning.');
}

/** Verifies the whole document before any GitHub write. */
export function validateEconomyCatalog(doc, type, categoriesDoc = null) {
  if (!isObject(doc) || doc.schema_version !== 1) fail('Okänt katalogformat.');
  if (type === 'categories') {
    if (!Array.isArray(doc.categories) || !Array.isArray(doc.groups) || !isObject(doc.legacy_category_map) ||
        doc.categories.length > 80 || doc.groups.length > 500) fail('Okänt kategoriformat.');
    checkUnique(doc.categories, 'kategori');
    checkUnique(doc.groups, 'produktgrupp');
    const cIds = idSet(doc.categories), gIds = idSet(doc.groups);
    for (const cat of doc.categories) if (!own(cat, ['id','name'])) fail('Okänt fält i kategori.');
    for (const group of doc.groups) {
      if (!own(group, ['id','name','category_id','aliases']) || !cIds.has(group.category_id)) fail('Produktgrupp med okänd kategori.');
    }
    checkAliases(doc.groups);
    if (categoriesDoc) {
      if (!Array.isArray(categoriesDoc.products)) fail('Okänd produktkatalog.');
      const productAliases = new Set(categoriesDoc.products.flatMap(product => product.aliases || []).map(normalizeReceiptName));
      for (const group of doc.groups) for (const alias of group.aliases)
        if (productAliases.has(normalizeReceiptName(alias))) fail('Dubblerat alias mellan produkt och produktgrupp.');
    }
    for (const [alias, groupId] of Object.entries(doc.legacy_category_map)) {
      if (!label(alias) || !gIds.has(groupId)) fail('Äldre kategori har okänd produktgrupp.');
    }
    return doc;
  }
  if (type === 'products') {
    if (!Array.isArray(doc.products) || doc.products.length > 2000) fail('Okänt produktformat.');
    checkUnique(doc.products, 'produkt');
    for (const product of doc.products) {
      if (!own(product, ['id','name','group_id','aliases','package'])) fail('Okänt fält i produkt.');
      if (!Array.isArray(product.aliases) || !product.aliases.length) fail('Produkten behöver ett säkert kvittoalias.');
      checkPackage(product.package);
      if (categoriesDoc && !categoriesDoc.groups.some(group => group.id === product.group_id)) fail('Produkten pekar på okänd produktgrupp.');
    }
    const taken = new Set();
    if (categoriesDoc) {
      validateEconomyCatalog(categoriesDoc, 'categories');
      for (const group of categoriesDoc.groups) for (const alias of group.aliases) taken.add(normalizeReceiptName(alias));
    }
    checkAliases(doc.products, taken);
    return doc;
  }
  fail('Okänd katalogtyp.');
}

/** Upserts by stable ID. Never performs delete, bulk replacement or history rewriting. */
export function applyEconomyCatalogEdit(current, kind, entry, categoriesDoc = null) {
  if (!isObject(entry) || !identifier(entry.id) || !label(entry.name)) fail('Ogiltigt ID eller namn.');
  const info = kind === 'category' ? { type: 'categories', field: 'categories', keys: ['id','name'] } :
    kind === 'group' ? { type: 'categories', field: 'groups', keys: ['id','name','category_id','aliases'] } :
      kind === 'product' ? { type: 'products', field: 'products', keys: ['id','name','group_id','aliases','package'] } : null;
  if (!info) fail('Okänd katalogpost.');
  if (!own(entry, info.keys)) fail('Otillåtet fält i katalogpost.');
  if ((kind === 'group' || kind === 'product') && !Array.isArray(entry.aliases)) fail('Alias saknas.');
  validateEconomyCatalog(current, info.type, categoriesDoc);
  const value = { ...entry, name: entry.name.trim() };
  if (kind === 'group' || kind === 'product') value.aliases = entry.aliases.map(alias => typeof alias === 'string' ? alias.trim() : alias);
  const list = current[info.field];
  const index = list.findIndex(row => row.id === entry.id);
  const next = list.slice();
  if (index === -1) next.push(value);
  else next[index] = value;
  const updated = { ...current, [info.field]: next };
  return validateEconomyCatalog(updated, info.type, categoriesDoc);
}

/** When a response gets lost, trust only a newer blob containing the requested entry. */
export function catalogEditPersisted(snapshot, input) {
  if (!input || !input.entry || !['category','group','product'].includes(input.kind)) return false;
  const file = input.path === 'Ekonomi/Katalog/kategorier.json' ? snapshot?.catalog?.categories :
    input.path === 'Ekonomi/Katalog/produkter.json' ? snapshot?.catalog?.products : null;
  if (!file || file.sha === input.expectedSha || !/^[a-f0-9]{40}$/.test(file.sha || '')) return false;
  const list = input.kind === 'category' ? file.data?.categories : input.kind === 'group' ? file.data?.groups : file.data?.products;
  const found = Array.isArray(list) ? list.filter(row => row.id === input.entry.id) : [];
  return found.length === 1 && Object.keys(input.entry).every(key => JSON.stringify(found[0][key]) === JSON.stringify(input.entry[key]));
}

export function catalogReconciledReceipt(snapshot, input) {
  if (!catalogEditPersisted(snapshot, input)) return null;
  const file = input.kind === 'product' ? snapshot.catalog.products : snapshot.catalog.categories;
  return { saved: true, reconciled: true, source: 'github', path: input.path, sha: file.sha, data: file.data };
}

/** A broken or not-yet-published catalog must never block the existing economy register. */
export function combineEconomyCatalogRead(categoriesFile, productsFile) {
  try {
    if (!categoriesFile || !productsFile) fail('Ekonomikatalogen saknas.');
    validateEconomyCatalog(categoriesFile.data, 'categories', productsFile.data);
    validateEconomyCatalog(productsFile.data, 'products', categoriesFile.data);
    return { catalog: { categories: categoriesFile, products: productsFile }, catalogError: null };
  } catch (error) {
    return { catalog: null, catalogError: 'Ekonomikatalogen kunde inte användas: ' + error.message };
  }
}
