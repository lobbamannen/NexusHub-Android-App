import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseCategoryOverview,storyCategoryOverview} from '../lib/module-dashboard.mjs';

test('database overview derives totals and sortable categories from canonical catalog rows',()=>{
 const source=[
  {path:'Kunskap/a',module:'databas',category:'AI',technical:false},
  {path:'Kunskap/b',module:'databas',category:'AI',technical:false},
  {path:'Kunskap/c',module:'databas',category:'Historia',technical:false},
  {path:'Kunskap/d',module:'databas',category:'',technical:false},
  {path:'Kunskap/old',module:'databas',category:'AI',technical:true},
  {path:'Berattelser/test.md',module:'mysterier',category:'Hemsökta hus',technical:false},
  {path:'00-Inkorg/file',module:'inkorg',category:'AI',technical:false}
 ];
 const result=databaseCategoryOverview(source);
 assert.equal(result.count,4,'only nontechnical databaskatalog rows');
 assert.deepEqual(result.categories,[{name:'AI',count:2},{name:'Historia',count:1}]);
 assert.equal(result.categories.reduce((n,c)=>n+c.count,0),3,'uncategorized row is not assigned an invented category');
});
test('database overview handles missing catalogs and Swedish category names',()=>{
 assert.deepEqual(databaseCategoryOverview(),{count:0,categories:[]});
 assert.deepEqual(databaseCategoryOverview(null),{count:0,categories:[]});
 const categories=databaseCategoryOverview([
  {module:'databas',category:'Återblick'}, {module:'databas',category:'Ämnen'},
  {module:'databas',category:'AI'}, {module:'databas',category:'Övrigt'}
 ]).categories.map(x=>x.name);
 assert.deepEqual(categories,['AI','Återblick','Ämnen','Övrigt']);
});
test('story overview counts authentic folder categories and only exact numeric ratings',()=>{
 const stories=[
  {path:'a',category:'Hemsökta hus',numericRating:4.5},
  {path:'b',category:'Hemsökta hus',numericRating:null},
  {path:'c',category:'True crime',numericRating:null},
  {path:'d',category:'Internetmysterier & nätfenomen',numericRating:3.5},
  {path:'e',category:'Historiska & paranormala mysterier',numericRating:null}
 ];
 const result=storyCategoryOverview(stories);
 assert.equal(result.count,5);
 assert.deepEqual(result.counts,{'Hemsökta hus':2,'True crime':1,'Internetmysterier & nätfenomen':1,'Historiska & paranormala mysterier':1});
 assert.equal(result.exactRatings,2);
 assert.equal(result.categories.length,4);
});
test('story overview does not invent missing groups, ratings or items',()=>{
 assert.deepEqual(storyCategoryOverview(),{count:0,categories:[],counts:{},exactRatings:0});
 const result=storyCategoryOverview([{category:'',numericRating:null},{category:'True crime',numericRating:NaN}]);
 assert.equal(result.count,2);
 assert.equal(result.exactRatings,0);
 assert.deepEqual(result.categories,['True crime']);
});
