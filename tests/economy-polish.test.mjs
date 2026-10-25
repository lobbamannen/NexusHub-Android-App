import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEconomyDashboard} from '../lib/economy-dashboard.mjs';
const {parseReceiptAliases}=await import('../lib/economy-catalog.mjs');
const {queuedEditMatches}=await import('../lib/draft-scope.mjs').catch(()=>({}));
test('alias with commas remains one receipt name during an unchanged edit',()=>{
 assert.equal(typeof parseReceiptAliases,'function');
 assert.deepEqual(parseReceiptAliases('Goji Fine Tip styluspenna, svart\n ANNAT NAMN '),['Goji Fine Tip styluspenna, svart','ANNAT NAMN']);
});
test('discard targets budget/purchase/catalog intent and retains unrelated pending work',()=>{
 assert.equal(typeof queuedEditMatches,'function');
 const item=(input)=>({path:'/api/economy',body:{kind:'json',text:JSON.stringify(input)}});
 const a=item({path:'Ekonomi/Robin/budget.json',id:'a'}),b=item({path:'Ekonomi/Robin/budget.json',id:'b'}),cat=item({path:'Ekonomi/Katalog/kategorier.json',kind:'group',entry:{id:'x'}});
 assert.equal(queuedEditMatches(a,'economy',{path:'Ekonomi/Robin/budget.json',id:'a'}),true);
 assert.equal(queuedEditMatches(b,'economy',{path:'Ekonomi/Robin/budget.json',id:'a'}),false);
 assert.equal(queuedEditMatches(cat,'economy',{path:'Ekonomi/Katalog/kategorier.json',id:'x',kind:'group'}),true);
 assert.equal(queuedEditMatches(a,'all-drafts'),false, 'discarding film/story drafts retains unrelated economy saves');
 assert.equal(queuedEditMatches({path:'/api/story-status',body:{kind:'json',text:'{"action":"set"}'}},'all-drafts'),false);
});
test('price samples subtract linked discounts from the correct article only',()=>{
 const categories={categories:[{id:'mat',name:'Mat'},{id:'ovrigt',name:'Övrigt'},{id:'rabatter',name:'Rabatter'}],groups:[{id:'mat',name:'Mat',category_id:'mat',aliases:[]},{id:'rabatt',name:'Rabatt',category_id:'rabatter',aliases:[]}],legacy_category_map:{}};
 const products={products:[{id:'same',name:'Samma produkt',group_id:'mat',aliases:['PRODUKT']}]};
 const file={path:'test',data:{purchases:[{id:'a',amount_sek:20,articles:[{name:'PRODUKT',quantity_or_weight:'1',line_amount_sek:30},{name:'Rabatt produkt',category:'Rabatt',line_amount_sek:-10,discount_for_index:0}]},{id:'b',amount_sek:20,articles:[{name:'PRODUKT',quantity_or_weight:'1',line_amount_sek:20}]}]}};
 const report=buildEconomyDashboard([file],categories,products).periods[0];
 assert.deepEqual(report.priceComparisons.map(p=>[p.minUnitOre,p.maxUnitOre,p.samples]),[[2000,2000,2]]);
 assert.equal(report.totalOre,4000);assert.equal(report.categoryRows.reduce((n,r)=>n+r.amountOre,0),4000);
});
