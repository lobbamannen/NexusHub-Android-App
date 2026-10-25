/** Deterministic read-only projections. No receipt or catalog is ever mutated here. */
export const SEK_TO_ORE = 100;
const amountOre = value => Math.round((Number(value) || 0) * SEK_TO_ORE);
const byId = list => new Map((Array.isArray(list) ? list : []).map(value => [value.id, value]));

export function normalizeReceiptName(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('sv-SE')
    .replace(/[\u00a0]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function catalogLookup(catalog, products) {
  const groups = byId(catalog?.groups), categories = byId(catalog?.categories);
  const groupAliases = new Map(), productAliases = new Map();
  for (const group of groups.values()) for (const alias of group.aliases || []) {
    const key = normalizeReceiptName(alias);
    if (key && !groupAliases.has(key)) groupAliases.set(key, group);
  }
  for (const product of products?.products || []) for (const alias of product.aliases || []) {
    const key = normalizeReceiptName(alias);
    if (key && !productAliases.has(key)) productAliases.set(key, product);
  }
  const legacy = new Map(Object.entries(catalog?.legacy_category_map || {}).map(([k, id]) => [normalizeReceiptName(k), id]));
  return { groups, categories, groupAliases, productAliases, legacy };
}

const unknown = { categoryId: 'ovrigt', groupId: 'ovrigt', productId: null, match: 'unknown', needsReview: true };
function isDiscount(article) {
  return amountOre(article.line_amount_sek) < 0 &&
    (/^(rabatt|rabatt\/bonus)$/i.test(String(article.category || '')) ||
      /^(rabatt|lidl plus rabatt|kampanjrabatt|klubbpris|bonuscheck|multi deal)/.test(normalizeReceiptName(article.name)));
}
function isPant(article) {
  return normalizeReceiptName(article.category) === 'pant' || /^pant(burk| pet| |$)/.test(normalizeReceiptName(article.name));
}
function result(group, productId, match, lookup, needsReview = false) {
  const categoryId = group?.category_id;
  if (!categoryId || !lookup.categories.has(categoryId)) return { ...unknown };
  return { categoryId, groupId: group.id, productId, match, needsReview };
}

/** Exact normalized aliases win. Legacy labels are fallback, never a guessed specific product. */
export function classifyReceiptArticle(article, catalog, products) {
  const lookup = catalogLookup(catalog, products), key = normalizeReceiptName(article?.name);
  if (isPant(article)) return result(lookup.groups.get('pant'), null, 'adjustment', lookup);
  if (isDiscount(article)) return result(lookup.groups.get('rabatt'), null, 'adjustment', lookup);
  const explicitProduct = article?.product_id && byId(products?.products).get(article.product_id);
  const product = explicitProduct || lookup.productAliases.get(key);
  if (product) return result(lookup.groups.get(product.group_id), product.id, 'product', lookup);
  const group = (article?.group_id && lookup.groups.get(article.group_id)) || lookup.groupAliases.get(key);
  if (group) return result(group, null, 'group', lookup);
  const legacyGroup = lookup.groups.get(lookup.legacy.get(normalizeReceiptName(article?.category)));
  if (legacyGroup) return result(legacyGroup, null, 'legacy', lookup, legacyGroup.id === 'ovrigt');
  return { ...unknown };
}

function tokens(name) {
  const common = new Set(['rabatt', 'bonus', 'lidl', 'plus', 'kampanjrabatt', 'klubbpris', 'multi', 'deal', 'köp', 'for', 'för', 'och', 'på', 'med']);
  return normalizeReceiptName(name).split(' ').filter(token => token.length >= 5 && !common.has(token) && !/^\d/.test(token));
}
function discountTarget(discount, articles, sourceIndex, catalog, products) {
  const safeTarget = row => row && amountOre(row.line_amount_sek) > 0 && !isPant(row) && !isDiscount(row);
  if (Number.isInteger(discount.discount_for_index) && discount.discount_for_index >= 0 && discount.discount_for_index < articles.length && discount.discount_for_index !== sourceIndex && safeTarget(articles[discount.discount_for_index]))
    return classifyReceiptArticle(articles[discount.discount_for_index], catalog, products);
  if (Number.isInteger(discount.discount_for_source_row)) {
    const hit = articles.find((article, index) => index !== sourceIndex && article.source_row === discount.discount_for_source_row && safeTarget(article));
    if (hit) return classifyReceiptArticle(hit, catalog, products);
  }
  const wanted = tokens(discount.name);
  if (!wanted.length) return null;
  const candidates = articles.filter((article, index) => index !== sourceIndex && amountOre(article.line_amount_sek) > 0 && !isPant(article))
    .filter(article => {
      const words = new Set(normalizeReceiptName(article.name).split(' '));
      return wanted.some(word => words.has(word));
    });
  return candidates.length === 1 ? classifyReceiptArticle(candidates[0], catalog, products) : null;
}

const record = () => ({ amountOre: 0, count: 0 });
function plus(map, key, amount) {
  const row = map[key] || (map[key] = record());
  row.amountOre += amount;
  row.count++;
}

/** A category report is an explanation of purchase totals, not another ledger. */
export function summarizeEconomyPeriod(file, catalog, products) {
  const purchases = file?.data?.purchases || [];
  const byCategory = {}, byGroup = {}, articleDetails = [], priceSamplesByProduct = {};
  let totalOre = 0, unallocatedOre = 0, reconciliationDifferenceOre = 0, purchasesMissingArticles = 0, reviewCount = 0, itemCount = 0;
  for (const purchase of purchases) {
    const purchaseOre = amountOre(purchase.amount_sek), articles = Array.isArray(purchase.articles) ? purchase.articles : [];
    totalOre += purchaseOre;
    if (!articles.length) {
      purchasesMissingArticles++;
      unallocatedOre += purchaseOre;
      plus(byCategory, 'ovrigt', purchaseOre);
      plus(byGroup, 'ovrigt', purchaseOre);
      continue;
    }
    let itemOre = 0;
    for (const [index, article] of articles.entries()) {
      const ore = amountOre(article.line_amount_sek);
      itemOre += ore;
      let classification = classifyReceiptArticle(article, catalog, products);
      if (isDiscount(article)) {
        const target = discountTarget(article, articles, index, catalog, products);
        if (target && !target.needsReview && target.categoryId !== 'rabatter') {
          classification = { ...target, productId: null, match: 'discount-linked', needsReview: false };
        }
      }
      if (classification.needsReview) reviewCount++;
      plus(byCategory, classification.categoryId, ore);
      plus(byGroup, classification.groupId, ore);
      itemCount++;
      articleDetails.push({ purchaseId: purchase.id, purchaseDescription: purchase.description, articleIndex: index,
        name: article.name, amountOre: ore, ...classification });
      if (classification.productId && ore > 0) {
        (priceSamplesByProduct[classification.productId] ||= []).push({ purchaseId: purchase.id, date: purchase.date,
          priceOre: ore, quantity: article.quantity_or_weight || null });
      }
    }
    const difference = purchaseOre - itemOre;
    if (difference !== 0) {
      reconciliationDifferenceOre += Math.abs(difference);
      unallocatedOre += difference;
      plus(byCategory, 'ovrigt', difference);
      plus(byGroup, 'ovrigt', difference);
    }
  }
  return { path: file.path, label: file.data.period?.label || file.path?.split('/').pop() || 'Period',
    startDate: file.data.period?.start_date || null, endDate: file.data.period?.end_date || null,
    totalOre, byCategory, byGroup, articleDetails, priceSamplesByProduct, purchases: purchases.length,
    itemCount, reviewCount, unallocatedOre, reconciliationDifferenceOre, purchasesMissingArticles };
}

function precedingDay(iso) {
  const date = new Date(iso + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function analyzeEconomy(files, catalog, products) {
  const periods = (files || []).filter(file => Array.isArray(file.data?.purchases)).map(file => summarizeEconomyPeriod(file, catalog, products));
  periods.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  return periods.map((period, index) => {
    const nextPeriodStart = index > 0 ? periods[index - 1].startDate : null;
    const derivedEnd = nextPeriodStart ? precedingDay(nextPeriodStart) : null;
    return { ...period, endDate: derivedEnd || period.endDate || null,
      periodWarning: derivedEnd && period.endDate && period.endDate !== derivedEnd
        ? 'Registrerat slutdatum avviker från nästa utbetalning och har ersatts i analysen.' : null };
  });
}
