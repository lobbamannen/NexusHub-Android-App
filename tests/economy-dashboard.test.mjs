import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEconomyDashboard } from '../lib/economy-dashboard.mjs';

const categories = { schema_version: 1,
  categories: [{ id:'mat',name:'Mat' },{ id:'bebis',name:'Barn & bebis' },{ id:'pant',name:'Pant' },{ id:'rabatter',name:'Rabatter & bonus' },{ id:'ovrigt',name:'Övrigt & ospecificerat' }],
  groups: [{ id:'mat',name:'Mat',category_id:'mat',aliases:[] },{ id:'wipes',name:'Våtservetter',category_id:'bebis',aliases:['VÅTSERVETTER'] },{ id:'pant',name:'Pant',category_id:'pant',aliases:[] },{ id:'rabatt',name:'Rabatt',category_id:'rabatter',aliases:[] },{ id:'ovrigt',name:'Övrigt',category_id:'ovrigt',aliases:[] }],
  legacy_category_map: { Livsmedel:'mat', Pant:'pant' } };
const products = { schema_version:1,products:[{id:'test72',name:'Test 72-pack',group_id:'wipes',aliases:['TEST 72P'],package:{value:72,unit:'st'}}] };
const line = (name, amount, category = '') => ({name,line_amount_sek:amount,category});

test('dashboard separates category totals, unresolved article names and unitemized purchases', () => {
  const files=[{path:'Ekonomi/Gemensamt/2026/2026-10-19.json',data:{period:{start_date:'2026-10-19',label:'Oktober–november'},purchases:[
    {id:'1',description:'ICA',amount_sek:30,articles:[line('VÅTSERVETTER',20),line('Något okänt',10)]},
    {id:'2',description:'Butik',amount_sek:100,articles:[]},
  ]}}];
  const dashboard = buildEconomyDashboard(files,categories,products);
  assert.equal(dashboard.periods[0].totalOre,13000);
  assert.equal(dashboard.periods[0].categoryRows.find(row=>row.id==='bebis').amountOre,2000);
  assert.equal(dashboard.periods[0].categoryRows.find(row=>row.id==='ovrigt').amountOre,11000);
  assert.deepEqual(dashboard.periods[0].unknownArticles.map(row=>row.name),['Något okänt']);
  assert.equal(dashboard.periods[0].purchasesMissingArticles,1);
  assert.equal(dashboard.periods[0].groupRows.find(row=>row.id==='ovrigt').amountOre,11000);
});

test('price comparisons require the same exact product and use verified receipt quantity', () => {
  const files=[{path:'x',data:{period:{start_date:'2026-10-19'},purchases:[
    {id:'a',amount_sek:24,articles:[{...line('TEST 72P',24),quantity_or_weight:'1'}]},
    {id:'b',amount_sek:40,articles:[{...line('TEST 72P',40),quantity_or_weight:'2'}]},
    {id:'c',amount_sek:10,articles:[line('VÅTSERVETTER',10)]},
  ]}}];
  const period = buildEconomyDashboard(files,categories,products).periods[0];
  assert.deepEqual(period.priceComparisons.map(p=>[p.productId,p.minUnitOre,p.maxUnitOre,p.samples]),[['test72',2000,2400,2]]);
});

test('missing quantity never becomes an invented unit price', () => {
  const files=[{path:'x',data:{period:{start_date:'2026-10-19'},purchases:[
    {id:'a',amount_sek:30,articles:[line('TEST 72P',30)]},
    {id:'b',amount_sek:60,articles:[line('TEST 72P',60)]},
  ]}}];
  assert.deepEqual(buildEconomyDashboard(files,categories,products).periods[0].priceComparisons,[]);
});
