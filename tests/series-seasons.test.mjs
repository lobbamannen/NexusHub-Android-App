import test from 'node:test';
import assert from 'node:assert/strict';
import {applySeriesWatchedSeasonsChange} from '../lib/series-seasons.mjs';
const target={title:'Test Series',startYear:2021,imdbId:'tt1234567'};
const base=()=>({schemaVersion:1,lastUpdated:'2026-10-21',description:'Sensitive series data',series:[
 { ...target,status:'Sedd – alla säsonger tillgängliga i Sverige',ourRating:9,ourReview:'Great',favorite:true,wantToWatch:false,seasonRatings:{'1':9},notes:'Preserve',allSeasonsAvailableInSwedenWatched:false,seasonCoverageConfirmedOn:'2026-10-18',watchedSeasons:[1],seasonAvailabilityResearch:{checkedAt:'2026-10-18',swedenAvailableSeasonNumbers:[1,3],swedenProviderSeasonCounts:[{provider:'Provider X',seasons:2,availableSeasonNumbers:[1,3]}],internationalVerifiedReleasedSeasonCount:6},seasonRuntimeMetadata:{'1':{totalMinutes:300,status:'verified'},'3':{totalMinutes:500,status:'estimated'}}},
 {title:'Other',startYear:2023,imdbId:null,watchedSeasons:[],allSeasonsAvailableInSwedenWatched:false,seasonAvailabilityResearch:{swedenAvailableSeasonNumbers:[1]}}
]});
test('season editing accepts only exact individually verified Swedish season numbers and keeps gaps',()=>{
 const old=base(),snapshot=JSON.stringify(old);
 const result=applySeriesWatchedSeasonsChange(old,target,[3,1]);
 assert.equal(result.changed,true);
 assert.equal(JSON.stringify(old),snapshot,'original not mutated');
 assert.deepEqual(result.register.series[0].watchedSeasons,[1,3]);
 assert.equal(result.register.series[0].allSeasonsAvailableInSwedenWatched,true);
 assert.deepEqual(result.register.series[0].seasonAvailabilityResearch,old.series[0].seasonAvailabilityResearch);
 assert.deepEqual(result.register.series[0].seasonRuntimeMetadata,old.series[0].seasonRuntimeMetadata);
 for(const name of ['ourRating','ourReview','favorite','wantToWatch','seasonRatings','notes','status'])assert.deepEqual(result.register.series[0][name],old.series[0][name],name);
 assert.deepEqual(result.register.series[1],old.series[1]);
 assert.deepEqual(applySeriesWatchedSeasonsChange(result.register,target,[1,3]).changed,false);
});
test('removing a watched season changes coverage but preserves catalogue and ratings',()=>{
 const first=applySeriesWatchedSeasonsChange(base(),target,[1,3]).register;
 const reduced=applySeriesWatchedSeasonsChange(first,target,[3]).register;
 assert.deepEqual(reduced.series[0].watchedSeasons,[3]);
 assert.equal(reduced.series[0].allSeasonsAvailableInSwedenWatched,false);
 assert.deepEqual(reduced.series[0].seasonRatings,first.series[0].seasonRatings);
 assert.equal(reduced.series[0].seasonCoverageConfirmedOn,first.series[0].seasonCoverageConfirmedOn,'historical confirmation must remain');
});
test('invalid season, fabricated catalogue range, forged title, duplicate and missing research fail closed',()=>{
 const original=base();
 for(const list of [[2],[0],[-1],[1,1],[1,1.5],['1'],[101]])
  assert.throws(()=>applySeriesWatchedSeasonsChange(original,target,list));
 assert.throws(()=>applySeriesWatchedSeasonsChange(original,{...target,title:'Wrong'},[1]),/finns inte/);
 assert.throws(()=>applySeriesWatchedSeasonsChange(original,{...target,imdbId:'invalid'},[1]),/IMDb/);
 const duplicate=base();duplicate.series.push({...duplicate.series[0]});
 assert.throws(()=>applySeriesWatchedSeasonsChange(duplicate,target,[1]),/inte unik/);
 const noResearch=base();delete noResearch.series[0].seasonAvailabilityResearch;
 assert.throws(()=>applySeriesWatchedSeasonsChange(noResearch,target,[1]),/saknas/);
});
test('real-world special: only 1–9 may stay watched while 10 is known available; an unchanged save does not silently include 10',()=>{
 const original=base(),w=[1,2,3,4,5,6,7,8,9];
 original.series[0]={...original.series[0],title:'Maria Wern',startYear:2008,imdbId:'tt1644606',watchedSeasons:w,allSeasonsAvailableInSwedenWatched:false,seasonAvailabilityResearch:{swedenAvailableSeasonNumbers:[1,2,3,4,5,6,7,8,9,10]}};
 const result=applySeriesWatchedSeasonsChange(original,{title:'Maria Wern',startYear:2008,imdbId:'tt1644606'},w);
 assert.equal(result.changed,false);
 assert.equal(result.register.series[0].watchedSeasons.includes(10),false);
});
