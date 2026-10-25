import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEconomyCatalogEdit, validateEconomyCatalog, catalogEditPersisted, catalogReconciledReceipt, combineEconomyCatalogRead } from '../lib/economy-catalog.mjs';
import { githubClient, gitBlobSha } from '../lib/github-inbox.mjs';

const categories = () => ({ schema_version: 1, categories: [{ id: 'bebis', name: 'Bebis' }],
  groups: [{ id: 'vatservetter', name: 'Våtservetter', category_id: 'bebis', aliases: ['VÅTSERVETTER'] }],
  legacy_category_map: { 'Hygien/barn': 'vatservetter' } });
const products = () => ({ schema_version: 1, products: [
  { id: 'eldorado72', name: 'Eldorado 72-pack', group_id: 'vatservetter', aliases: ['Eldorado våtservetter 72p'], package: { value: 72, unit: 'st' } },
] });

test('renames category by ID without changing group links or old mappings', () => {
  const original = categories(), before = structuredClone(original);
  const changed = applyEconomyCatalogEdit(original, 'category', { id: 'bebis', name: 'Barn & bebis' });
  assert.equal(changed.categories[0].name, 'Barn & bebis');
  assert.equal(changed.groups[0].category_id, 'bebis');
  assert.deepEqual(original, before);
});

test('adds category, group and precise product without rewriting purchases', () => {
  const withCategory = applyEconomyCatalogEdit(categories(), 'category', { id: 'hushall', name: 'Hushåll' });
  const withGroup = applyEconomyCatalogEdit(withCategory, 'group', { id: 'tvatt', name: 'Tvättmedel', category_id: 'hushall', aliases: ['TVÄTTMEDEL'] });
  const withProduct = applyEconomyCatalogEdit(products(), 'product', { id: 'test40', name: 'Test 40-pack', group_id: 'tvatt', aliases: ['TEST 40P'], package: { value: 40, unit: 'st' } }, withGroup);
  assert.equal(withProduct.products.length, 2);
  assert.equal(withGroup.groups.find(g => g.id === 'tvatt').category_id, 'hushall');
});

test('rejects dangling group links and duplicate normalized aliases', () => {
  assert.throws(() => applyEconomyCatalogEdit(categories(), 'group', { id: 'oops', name: 'Fel', category_id: 'saknas', aliases: [] }), /kategori/i);
  assert.throws(() => applyEconomyCatalogEdit(categories(), 'group', { id: 'annat', name: 'Annat', category_id: 'bebis', aliases: [' våtservetter! '] }), /alias/i);
  assert.throws(() => applyEconomyCatalogEdit(products(), 'product', { id: 'test', name: 'Ny', group_id: 'vatservetter', aliases: ['Eldorado våtservetter, 72P'] }, categories()), /alias/i);
  assert.throws(() => applyEconomyCatalogEdit(products(), 'product', { id: 'bad', name: 'Okänd', group_id: 'fel', aliases: ['ny'] }, categories()), /produktgrupp/i);
});

test('rejects unknown keys, malformed schema, empty IDs, huge aliases and negative packages', () => {
  assert.throws(() => validateEconomyCatalog({ ...categories(), schema_version: 2 }, 'categories'), /format/i);
  assert.throws(() => applyEconomyCatalogEdit(categories(), 'category', { id: '', name: 'Tyst' }), /ID/i);
  assert.throws(() => applyEconomyCatalogEdit(categories(), 'category', { id: 'ny', name: 'Tyst', data: 'unsupported' }), /fält/i);
  assert.throws(() => applyEconomyCatalogEdit(products(), 'product', { id: 'ny', name: 'Tyst', group_id: 'vatservetter', aliases: ['x'.repeat(500)] }, categories()), /alias/i);
  assert.throws(() => applyEconomyCatalogEdit(products(), 'product', { id: 'ny', name: 'Tyst', group_id: 'vatservetter', aliases: ['XYZ'], package: { value: -1, unit: 'st' } }, categories()), /förpackning/i);
});

test('validates all existing references before updating a catalog file', () => {
  const bad = categories();bad.legacy_category_map['Fel'] = 'saknas';
  assert.throws(() => validateEconomyCatalog(bad, 'categories'), /okänd/i);
  const dupe = products();dupe.products.push({ id: 'other', name: 'Other', group_id: 'vatservetter', aliases: ['eldorado VÅTSERVETTER 72p'] });
  assert.throws(() => validateEconomyCatalog(dupe, 'products', categories()), /alias/i);
});

test('group edits cannot claim an exact alias already registered by a product', () => {
  assert.throws(() => applyEconomyCatalogEdit(categories(),'group',
    {id:'vatservetter',name:'Våtservetter',category_id:'bebis',aliases:['Eldorado våtservetter 72p']}, products()), /alias/i);
});

test('catalog load may fail without blocking existing budget and receipt files', () => {
  const fallback=combineEconomyCatalogRead(null,null);
  assert.equal(fallback.catalog,null);
  assert.match(fallback.catalogError,/katalog/i);
  const valid=combineEconomyCatalogRead({path:'k',sha:'a'.repeat(40),data:categories()},
    {path:'p',sha:'b'.repeat(40),data:products()});
  assert.equal(valid.catalog.categories.data.groups.length,1);
  const invalid=combineEconomyCatalogRead({path:'k',sha:'a'.repeat(40),data:categories()},
    {path:'p',sha:'b'.repeat(40),data:{schema_version:3,products:[]}});
  assert.equal(invalid.catalog,null);
});

test('catalog GitHub writer is blob-SHA protected and restricted to two fixed paths', async () => {
  const content = JSON.stringify(categories()) + '\n';
  const expectedSha = 'a'.repeat(40), wantedHash = await gitBlobSha(new TextEncoder().encode(content));
  let writes = 0;
  const c = githubClient('secret-token', async (url, options) => {
    writes++;
    assert.equal(url, 'https://api.github.com/repos/lobbamannen/Databas/contents/Ekonomi/Katalog/kategorier.json');
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body);
    assert.equal(body.sha, expectedSha);
    assert.equal(body.branch, 'main');
    return Response.json({ content: { sha: wantedHash }, commit: { sha: 'b'.repeat(40) } });
  });
  assert.equal((await c.writeEconomyFile('Ekonomi/Katalog/kategorier.json', expectedSha, content)).sha, wantedHash);
  await assert.rejects(c.writeEconomyFile('Ekonomi/Katalog/secret.json', expectedSha, content), /inte tillåten/i);
  await assert.rejects(c.writeEconomyFile('Ekonomi/Katalog/kategorier.json', 'badsha', content), /Versionsnyckel/i);
  assert.equal(writes, 1);
  const other = githubClient('secret-token', async () => { throw Error('wrong repository write'); }, 'lobbamannen/ChatGPT-Plugin');
  await assert.rejects(other.writeEconomyFile('Ekonomi/Katalog/kategorier.json', expectedSha, content), /inte tillåten/i);
});

test('reconciles a lost catalog response only when the exact requested edit is in a newer GitHub blob', () => {
  const input = { path: 'Ekonomi/Katalog/kategorier.json', expectedSha: 'a'.repeat(40), kind: 'category', entry: { id: 'bebis', name: 'Barn & bebis' } };
  const snapshot = { catalog: { categories: { sha: 'b'.repeat(40), data: { ...categories(), categories: [{ id: 'bebis', name: 'Barn & bebis' }] } } } };
  assert.equal(catalogEditPersisted(snapshot, input), true);
  assert.equal(catalogEditPersisted({ catalog: { categories: { ...snapshot.catalog.categories, sha: input.expectedSha } } }, input), false);
  assert.equal(catalogEditPersisted({ catalog: { categories: { ...snapshot.catalog.categories, data: categories() } } }, input), false);
  assert.deepEqual(catalogReconciledReceipt(snapshot,input), {saved:true,reconciled:true,source:'github',path:input.path,sha:'b'.repeat(40),data:snapshot.catalog.categories.data});
});
