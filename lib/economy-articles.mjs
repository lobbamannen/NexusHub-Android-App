const fail = message => { throw new Error(message); };
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const ref = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/.test(value);
/** Re-index explicit discount links when an article disappears; never silently re-target a discount. */
export function removeEconomyArticle(articles, removedIndex) {
  const removed = articles[removedIndex];
  if (!removed) return articles;
  return articles.filter((_, i) => i !== removedIndex).map(article => {
    const next = { ...article };
    if (Number.isInteger(next.discount_for_index)) {
      if (next.discount_for_index === removedIndex) delete next.discount_for_index;
      else if (next.discount_for_index > removedIndex) next.discount_for_index--;
    }
    if (removed.source_row != null && next.discount_for_source_row === removed.source_row)
      delete next.discount_for_source_row;
    return next;
  });
}

/** Classification hints belong to the article identity, never to an arbitrary replacement name. */
export function renameEconomyArticle(articles, index, name) {
  return articles.map((article, i) => {
    if (i !== index) return article;
    const next = { ...article, name };
    if (name.trim().toLocaleLowerCase('sv-SE') !== article.name.trim().toLocaleLowerCase('sv-SE')) {
      delete next.product_id;
      delete next.group_id;
      next.category = null;
    }
    return next;
  });
}
/** Validate editor round-trips without losing future one-write receipt metadata. */
export function validateEconomyArticles(value) {
  if (!Array.isArray(value) || value.length > 150) fail('För många artikelrader.');
  return value.map(row => {
    if (!isObject(row) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 220) fail('Ogiltig artikelrad.');
    const amount = row.line_amount_sek;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) > 100000000 || Math.abs(Math.round(amount * 100) - amount * 100) > .000001) fail('Ogiltigt artikelbelopp.');
    if (row.unit_price_sek != null && (typeof row.unit_price_sek !== 'number' || !Number.isFinite(row.unit_price_sek) || row.unit_price_sek < 0 || row.unit_price_sek > 100000000)) fail('Ogiltigt artikelstyckpris.');
    const item = {
      name: row.name.trim(), quantity_or_weight: row.quantity_or_weight == null ? null : String(row.quantity_or_weight).slice(0,60),
      unit_price_sek: row.unit_price_sek ?? null, line_amount_sek: amount,
      category: row.category ? String(row.category).slice(0,160) : null, note: row.note ? String(row.note).slice(0,400) : null,
    };
    if (Number.isInteger(row.source_row)) item.source_row = row.source_row;
    for (const field of ['product_id','group_id']) {
      if (row[field] != null) {
        if (!ref(row[field])) fail('Ogiltig produkt- eller gruppreferens.');
        item[field] = row[field];
      }
    }
    for (const field of ['discount_for_index','discount_for_source_row']) {
      if (row[field] != null) {
        if (!Number.isInteger(row[field]) || row[field] < 0 || row[field] > (field === 'discount_for_index' ? 149 : 1000000)) fail('Ogiltig rabattkoppling.');
        item[field] = row[field];
      }
    }
    return item;
  });
}
