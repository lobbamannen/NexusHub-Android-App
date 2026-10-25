import { analyzeEconomy, normalizeReceiptName } from './economy-intelligence.mjs';

/** Presentation view-model: retains transparent known/unknown boundaries. */
export function buildEconomyDashboard(files, catalog, products) {
  const names = new Map((catalog?.categories || []).map(cat => [cat.id, cat.name]));
  const groups = new Map((catalog?.groups || []).map(group => [group.id, group]));
  const productNames = new Map((products?.products || []).map(product => [product.id, product.name]));
  return { periods: analyzeEconomy(files, catalog, products).map(period => {
    const categoryRows = Object.entries(period.byCategory)
      .filter(([,data]) => data.amountOre !== 0)
      .map(([id,data]) => ({ id, name: names.get(id) || id, amountOre: data.amountOre, lineCount: data.count }))
      .sort((a,b) => b.amountOre - a.amountOre);
    const maxPositive = Math.max(1, ...categoryRows.map(row => row.amountOre));
    for (const row of categoryRows) row.widthPercent = row.amountOre > 0 ? Math.round(row.amountOre / maxPositive * 100) : 0;
    const groupRows = Object.entries(period.byGroup)
      .filter(([,data]) => data.amountOre !== 0)
      .map(([id,data]) => ({ id, name: groups.get(id)?.name || id,
        categoryName: names.get(groups.get(id)?.category_id) || 'Övrigt', amountOre: data.amountOre, lineCount: data.count }))
      .sort((a,b) => b.amountOre - a.amountOre);
    const unresolved = new Map();
    for (const detail of period.articleDetails.filter(detail => detail.needsReview)) {
      const key = normalizeReceiptName(detail.name);
      const previous = unresolved.get(key) || { name: detail.name, count: 0, amountOre: 0 };
      previous.count++; previous.amountOre += detail.amountOre;
      unresolved.set(key, previous);
    }
    const unknownArticles = Array.from(unresolved.values()).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name,'sv'));
    const priceComparisons = Object.entries(period.priceSamplesByProduct).flatMap(([productId, samples]) => {
      const unitPrices = samples.map(row => {
        const quantity = String(row.quantity ?? '').trim();
        if (!/^\d+(?:[,.]\d+)?$/.test(quantity)) return null;
        const count = Number(quantity.replace(',','.'));
        return count > 0 && Number.isFinite(count) ? Math.round(row.priceOre / count) : null;
      }).filter(value => value !== null && value > 0);
      if (unitPrices.length < 2) return [];
      return [{ productId, name: productNames.get(productId) || productId,
        minUnitOre: Math.min(...unitPrices), maxUnitOre: Math.max(...unitPrices), samples: unitPrices.length }];
    }).sort((a,b) => b.maxUnitOre - b.minUnitOre - (a.maxUnitOre - a.minUnitOre));
    return { ...period, categoryRows, groupRows, unknownArticles, priceComparisons };
  }) };
}
