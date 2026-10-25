import test from 'node:test';
import assert from 'node:assert/strict';
import {recentGenrePosters} from '../lib/recent-genre-posters.mjs';
test('latest additions come first, not latest release year',()=>{
 const rows=[{title:'New release',imdbId:'tt1234567',genres:['Action'],year:2026},{title:'Older release newly added',imdbId:'tt7654321',genres:['Action'],year:1980}];
 assert.deepEqual(recentGenrePosters(rows,'films')['genregroup:action'],[{key:'tt7654321',title:'Older release newly added'},{key:'tt1234567',title:'New release'}]);
});
test('only already indexed posters appear in newest-first order',()=>{
 const rows=[
  {title:'Older',imdbId:'tt1000001',genres:['Action']},
  {title:'Newest without poster',imdbId:'tt1000002',genres:['Action']},
  {title:'Newest with poster',imdbId:'tt1000003',genres:['Äventyr']}
 ];
 assert.deepEqual(recentGenrePosters(rows,'films',4,['tt1000001','tt1000003'])['genregroup:action'],[
  {key:'tt1000003',title:'Newest with poster'},{key:'tt1000001',title:'Older'}
 ]);
 assert.equal(recentGenrePosters(rows,'films',4,[])['genregroup:action'],undefined);
});
test('series title-year aliases work and categories are separate',()=>{
 const rows=[{title:'Mystery',startYear:2020,genres:['Kriminal']},{title:'Nature',imdbId:'tt1234567',genres:['Natur']},{title:'Another',startYear:2022,genres:['Kriminal']}];
 const result=recentGenrePosters(rows,'series');
 assert.deepEqual(result['genregroup:kriminal'].map(x=>x.key),['Another|2022','Mystery|2020']);
 assert.deepEqual(result['genregroup:natur'].map(x=>x.key),['tt1234567']);
});
