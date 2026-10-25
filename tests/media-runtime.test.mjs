import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRuntime,formatDays,movieStats,seriesStats,mediaTotals,releaseYearGroups} from '../lib/media-runtime.mjs';
const film=(year,status,minutes,runtimeStatus='verified',title='Film')=>({title,imdbId:'tt1234567',year,status,runtimeMetadata:minutes===null?undefined:{minutes,status:runtimeStatus}});
const show=(year,watched,metadata,title='Serie')=>({title,startYear:year,watchedSeasons:watched,seasonRuntimeMetadata:metadata});
test('movie watch time includes watched titles only, not planned or unknown time',()=>{
 const values=[film(2019,'Sedd',120),film(2020,'Sedd',90,'estimated'),film(2020,'Sedd',null),film(2021,'Vill se',145),film(2022,'Inte sett',70)];
 assert.deepEqual(movieStats(values),{watched:3,verified:120,estimated:90,missing:1,total:210});
 assert.equal(formatRuntime(210),'3 h 30 min');
 assert.equal(formatRuntime(null),'Okänd tid');
 assert.equal(formatDays(2880),'2 dygn');
});
test('series totals use ONLY explicit unique watched seasons and distinguish estimates',()=>{
 const s=[show(2023,[1,2,2],{
 '1':{totalMinutes:475,status:'verified'},
 '2':{totalMinutes:505,status:'estimated'},
 '3':{totalMinutes:541,status:'verified'}}),show(2018,[1,2],{
 '1':{totalMinutes:null,status:'unknown'},
 '2':{totalMinutes:0,status:'unknown'}})];
 assert.deepEqual(seriesStats(s),{watched:4,verified:475,estimated:505,missing:2,total:980});
 const totals=mediaTotals([film(2020,'Sedd',120)],s);
 assert.equal(totals.total,1100);
 assert.equal(totals.missing,2);
 assert.equal(totals.verified,595);
});
test('international seasons, Swedish catalogue counts and future seasons are NEVER assumed watched',()=>{
 const s=show(2026,[1],{'1':{totalMinutes:200,status:'verified'},'2':{totalMinutes:300,status:'verified'}},'Example');
 s.allSeasonsAvailableInSwedenWatched=true;
 s.seasonAvailabilityResearch={swedenAvailableSeasonNumbers:[1,2],internationalVerifiedReleasedSeasonCount:6};
 assert.equal(seriesStats([s]).total,200);
});
test('year view groups films by release year and series by start year; filter and title details agree',()=>{
 const f=[film(2019,'Sedd',120,'verified','Film A'),film(2019,'Vill se',130,'verified','Film B')];
 const s=[show(2019,[1],{},'Serie A'),show(2022,[],{},'Serie B')];
 const both=releaseYearGroups(f,s);
 assert.deepEqual(both.map(y=>[y.year,y.films,y.series]),[[2019,2,1],[2022,0,1]]);
 assert.equal(both[0].items.length,3);
 assert.deepEqual(releaseYearGroups(f,s,'filmer').map(y=>[y.year,y.films,y.series]),[[2019,2,0]]);
 assert.deepEqual(releaseYearGroups(f,s,'serier').map(y=>[y.year,y.films,y.series]),[[2019,0,1],[2022,0,1]]);
});
