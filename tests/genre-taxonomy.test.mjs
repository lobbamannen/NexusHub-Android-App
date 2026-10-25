import test from 'node:test';
import assert from 'node:assert/strict';
import {GENRE_GROUPS,categoryForGenre,groupedGenreOptions,matchesGenreGroup} from '../lib/genre-taxonomy.mjs';
import {filmDiscovery,seriesDiscovery} from '../lib/media-discovery.mjs';
const seriesGenres=['Dokumentär','Kriminal','Reality','Äventyr','True crime','Mysterium','Science fiction','Drama','Skräck','Historia','Samhälle','Hälsa','Paranormalt','Fantasy','Thriller','Natur','Sport','Brott','Familj','Komedi','Mystery','Resor','Horror','Postapokalyptiskt','Dystopi','Mysterie','Reality TV','Action och äventyr','Biografi','Arbete','Djur','Vänskap','Underhållning','Mat och bakning'];
const filmGenres=['Äventyr','Action','Fantasy','Skräck','Familj','Komedi','Paranormalt','Thriller','Science fiction','Kriminal','Animation','Drama','Musikal','Sport','Mysterium','Dokumentär','Romantik','Kortfilm','Biografi'];

test('current source genre inventories are all covered exactly once by a twelve-group browse taxonomy',()=>{
 assert.equal(GENRE_GROUPS.length,12);
 const flattened=GENRE_GROUPS.flatMap(g=>g.genres);
 assert.equal(flattened.length,new Set(flattened).size,'each source genre is in one primary browse group');
 for(const name of new Set([...seriesGenres,...filmGenres])){
  assert.ok(flattened.includes(name),'genre from current registers must be explicitly mapped: '+name);
  if(name==='Kortfilm')assert.equal(categoryForGenre(name),'ovrigt');
  else assert.notEqual(categoryForGenre(name),'ovrigt',name+' must be in a named primary group');
 }
 assert.equal(categoryForGenre('Kortfilm'),'ovrigt');
});
test('synonyms are merged for browsing, but the exact canonical source terms remain available',()=>{
 const titles=[
  {genres:['Mysterium','Mystery','Kriminal']},
  {genres:['Mysterie']},
  {genres:['Horror','Skräck']},
  {genres:['Reality','Reality TV']}
 ];
 const groups=groupedGenreOptions(titles);
 const crime=groups.find(x=>x.id==='genregroup:kriminal');
 assert.equal(crime.count,2,'one title with three related genres is counted only once');
 assert.deepEqual(crime.children.map(x=>[x.label,x.count]),[['Kriminal',1],['Mysterie',1],['Mysterium',1],['Mystery',1]]);
 assert.equal(groups.find(x=>x.id==='genregroup:skrack').count,1);
 assert.equal(groups.find(x=>x.id==='genregroup:reality').count,1);
 assert.deepEqual(titles[0].genres,['Mysterium','Mystery','Kriminal'],'original genres are never mutated');
 assert.ok(matchesGenreGroup(titles[0],'kriminal'));
 assert.ok(!matchesGenreGroup(titles[0],'reality'));
});
test('same grouped taxonomy is shared by movie and TV modules',()=>{
 const films=filmDiscovery([
  {status:'Sedd',genres:['Skräck','Horror'],series:null},
  {status:'Vill se',genres:['Paranormalt'],series:null}
 ]);
 const series=seriesDiscovery([
  {allSeasonsAvailableInSwedenWatched:true,genres:['Skräck','Horror'],seasonAvailabilityResearch:{swedenProviderSeasonCounts:[]}},
  {allSeasonsAvailableInSwedenWatched:false,genres:['Paranormalt'],seasonAvailabilityResearch:{swedenProviderSeasonCounts:[]}}
 ]);
 for(const discovery of [films,series]){
  const tab=discovery.groups.find(g=>g.id==='genre');
  assert.equal(tab.label,'Huvudgenrer');
  assert.equal(tab.items.length,1);
  assert.equal(tab.items[0].id,'genregroup:skrack');
  assert.equal(tab.items[0].count,2);
  assert.deepEqual(tab.items[0].children.map(c=>c.label),['Horror','Paranormalt','Skräck']);
 }
});