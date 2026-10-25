import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReceiptName, classifyReceiptArticle, summarizeEconomyPeriod, analyzeEconomy } from '../lib/economy-intelligence.mjs';

const catalog = {
  schema_version: 1,
  categories: [
    { id: 'mat', name: 'Mat' }, { id: 'godis', name: 'Godis' },
    { id: 'bebis', name: 'Bebis & barn' }, { id: 'pant', name: 'Pant' },
    { id: 'rabatter', name: 'Rabatter & bonus' }, { id: 'ovrigt', name: 'Övrigt' },
  ],
  groups: [
    { id: 'matvaror', name: 'Matvaror', category_id: 'mat', aliases: [] },
    { id: 'choklad', name: 'Choklad', category_id: 'godis', aliases: ['KEXCHOKLAD'] },
    { id: 'vatservetter', name: 'Våtservetter', category_id: 'bebis', aliases: ['VÅTSERVETTER'] },
    { id: 'pant', name: 'Pant', category_id: 'pant', aliases: [] },
    { id: 'rabatt', name: 'Rabatt', category_id: 'rabatter', aliases: [] },
    { id: 'ovrigt', name: 'Övrigt', category_id: 'ovrigt', aliases: [] },
  ],
  legacy_category_map: { Livsmedel: 'matvaror', Godis: 'choklad', 'Hygien/barn': 'vatservetter', Pant: 'pant', Rabatt: 'rabatt' },
};
const products = {
  schema_version: 1,
  products: [
    { id: 'eldorado-vatservetter-72', name: 'Eldorado Våtservetter 72-pack', group_id: 'vatservetter', package: { value: 72, unit: 'st' }, aliases: ['ELDORADO VÅTSERVETTER 72P'] },
  ],
};
const row = (name, amount, category = '') => ({ name, line_amount_sek: amount, category });

test('normalizes receipt spelling without merging different pack sizes', () => {
  assert.equal(normalizeReceiptName('  VÅTSERVETTER, 72P! '), 'våtservetter 72p');
  assert.notEqual(normalizeReceiptName('Våtservetter 40p'), normalizeReceiptName('Våtservetter 80p'));
});

test('recognizes precise product aliases and broad group aliases separately', () => {
  const exact = classifyReceiptArticle(row('Eldorado Våtservetter 72p', 25), catalog, products);
  assert.deepEqual([exact.categoryId, exact.groupId, exact.productId, exact.match], ['bebis', 'vatservetter', 'eldorado-vatservetter-72', 'product']);
  const broad = classifyReceiptArticle(row('Våtservetter', 20), catalog, products);
  assert.deepEqual([broad.categoryId, broad.groupId, broad.productId, broad.match], ['bebis', 'vatservetter', null, 'group']);
  assert.equal(classifyReceiptArticle(row('Eldorado Våtservetter 40p', 23), catalog, products).productId, null);
});

test('reclassifies historical purchases from central catalog without touching their articles', () => {
  const old = row('VÅTSERVETTER', 25.9, 'Hygien/barn');
  const original = JSON.stringify(old);
  assert.equal(classifyReceiptArticle(old, catalog, products).categoryId, 'bebis');
  const changed = structuredClone(catalog);
  changed.groups.find(g => g.id === 'vatservetter').category_id = 'mat';
  assert.equal(classifyReceiptArticle(old, changed, products).categoryId, 'mat');
  assert.equal(JSON.stringify(old), original);
});

test('allocates an identifiable article discount to its category and keeps bonus separate', () => {
  const lines = [row('KEXCHOKLAD', 35.55, 'Godis'), row('Rabatt Kexchoklad', -10.55, 'Rabatt'), row('Bonuscheck kupong', -5, 'Rabatt')];
  const sum = summarizeEconomyPeriod({ path: 'Ekonomi/Gemensamt/2026/2026-10-19.json', data: { period: { start_date: '2026-10-19', end_date: null }, purchases: [{ id: 'p1', amount_sek: 20, articles: lines }] } }, catalog, products);
  assert.equal(sum.byCategory.godis.amountOre, 2500);
  assert.equal(sum.byCategory.rabatter.amountOre, -500);
  assert.equal(sum.totalOre, 2000);
  assert.equal(sum.reconciliationDifferenceOre, 0);
});

test('a discount is not attached to an unrelated article through a substring or a negative target', () => {
  const lines = [row('Havrekaka', 30, 'Godis'), row('Rabatt Havre Mjölk', -10, 'Rabatt'),
    { ...row('Rabatt okänd', -5, 'Rabatt'), discount_for_index: 1 }];
  const sum = summarizeEconomyPeriod({path:'x',data:{period:{start_date:'2026-10-19'},purchases:[{id:'k',amount_sek:15,articles:lines}]}},catalog,products);
  assert.equal(sum.byCategory.godis.amountOre, 3000);
  assert.equal(sum.byCategory.rabatter.amountOre, -1500);
});

test('keeps pant distinct and never double-counts purchase and its article rows', () => {
  const sum = summarizeEconomyPeriod({ path: 'x', data: { period: { start_date: '2026-10-19' }, purchases: [{ id: 'a', amount_sek: 22, articles: [row('VÅTSERVETTER', 20, 'Hygien/barn'), row('Pantburk 2 kr', 2, 'Pant')] }] } }, catalog, products);
  assert.equal(sum.byCategory.bebis.amountOre, 2000);
  assert.equal(sum.byCategory.pant.amountOre, 200);
  assert.equal(sum.totalOre, 2200);
});

test('exposes unitemized totals and mismatches instead of pretending detailed coverage', () => {
  const sum = summarizeEconomyPeriod({ path: 'x', data: { period: { start_date: '2026-10-19' }, purchases: [
    { id: 'a', amount_sek: 100, articles: [] }, { id: 'b', amount_sek: 50, articles: [row('Godis', 40, 'Godis')] },
  ] } }, catalog, products);
  assert.equal(sum.totalOre, 15000);
  assert.equal(sum.unallocatedOre, 11000);
  assert.equal(sum.reconciliationDifferenceOre, 1000);
  assert.equal(sum.purchasesMissingArticles, 1);
  assert.equal(sum.byGroup.ovrigt.amountOre, 11000);
});

test('sorts salary periods by actual starts and does not guess their last dates', () => {
  const files = [
    { path: 'Ekonomi/Gemensamt/2026/2026-11-21.json', data: { period: { start_date: '2026-11-21', end_date: null }, purchases: [] } },
    { path: 'Ekonomi/Gemensamt/2026/2026-10-19.json', data: { period: { start_date: '2026-10-19', end_date: null }, purchases: [] } },
  ];
  const periods = analyzeEconomy(files, catalog, products);
  assert.deepEqual(periods.map(p => p.startDate), ['2026-11-21', '2026-10-19']);
  assert.equal(periods[0].endDate, null);
  assert.equal(periods[1].endDate, '2026-11-20');
});

test('next verified payday overrides conflicting old end_date and flags it', () => {
  const files = [
    {path:'Ekonomi/Gemensamt/2026/2026-11-21.json',data:{period:{start_date:'2026-11-21'},purchases:[]}},
    {path:'Ekonomi/Gemensamt/2026/2026-10-19.json',data:{period:{start_date:'2026-10-19',end_date:'2026-11-30'},purchases:[]}},
  ];
  const period = analyzeEconomy(files,catalog,products)[1];
  assert.equal(period.endDate,'2026-11-20');
  assert.match(period.periodWarning,/slutdatum/i);
});
