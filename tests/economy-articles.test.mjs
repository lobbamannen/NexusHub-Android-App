import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEconomyArticles, removeEconomyArticle, renameEconomyArticle } from '../lib/economy-articles.mjs';

test('preserves optional product and discount relations when an old purchase is edited', () => {
  const rows=[{name:'VÅTSERVETTER',quantity_or_weight:'2',unit_price_sek:12.95,line_amount_sek:25.90,category:'Barn/hygien',source_row:42,
    product_id:'wipes72',group_id:'vatservetter',note:'Kvitto',discount_for_source_row:41},
    {name:'Rabatt våtservetter',line_amount_sek:-1.9,category:'Rabatt',discount_for_index:0}];
  const clean=validateEconomyArticles(rows);
  assert.equal(clean[0].product_id,'wipes72');
  assert.equal(clean[0].group_id,'vatservetter');
  assert.equal(clean[0].discount_for_source_row,41);
  assert.equal(clean[1].discount_for_index,0);
  assert.equal(clean[1].line_amount_sek,-1.9);
});

test('rejects malformed links and unbounded item counts', () => {
  assert.throws(()=>validateEconomyArticles([{name:'X',line_amount_sek:2,product_id:'../../secret'}]),/produkt/i);
  assert.throws(()=>validateEconomyArticles([{name:'X',line_amount_sek:2,discount_for_index:301}]),/rabatt/i);
  assert.throws(()=>validateEconomyArticles(Array.from({length:151},()=>({name:'X',line_amount_sek:1}))),/artikelrader/i);
});

test('deleting an article does not silently retarget an indexed discount', () => {
  const rows=[{name:'Mjölk',line_amount_sek:20,source_row:5},
    {name:'Godis',line_amount_sek:30,source_row:6},
    {name:'Rabatt mjölk',line_amount_sek:-5,discount_for_index:0,discount_for_source_row:5},
    {name:'Rabatt godis',line_amount_sek:-2,discount_for_index:1}];
  const next=removeEconomyArticle(rows,0);
  assert.equal(next[1].discount_for_index,undefined);
  assert.equal(next[1].discount_for_source_row,undefined);
  assert.equal(next[2].discount_for_index,0);
  assert.equal(rows[2].discount_for_index,0);
});

test('renaming a receipt article removes stale product/group/category hints', () => {
  const rows=[{name:'Våtservetter',line_amount_sek:25,category:'Barn/hygien',product_id:'v72',group_id:'wipes'}];
  const changed=renameEconomyArticle(rows,0,'Tvättmedel');
  assert.equal(changed[0].product_id,undefined);
  assert.equal(changed[0].group_id,undefined);
  assert.equal(changed[0].category,null);
  assert.equal(rows[0].product_id,'v72');
});

test('long historic source row numbers remain valid discount references', () => {
  assert.equal(validateEconomyArticles([{name:'Rabatt',line_amount_sek:-2,discount_for_source_row:542}])[0].discount_for_source_row,542);
});
