import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySeriesWatchlistChange} from '../lib/series-watchlist.mjs';
import {seriesIsWatchlisted,seriesDiscovery} from '../lib/media-discovery.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const base=()=>({schemaVersion:1,lastUpdated:'2026-10-18',description:'Kanoniskt serieregister',series:[
 {title:'Silo',startYear:2023,imdbId:'tt14688458',genres:['Science fiction','Drama'],status:'Sedd – alla säsonger tillgängliga i Sverige',favorite:true,ourRating:9,watchedSeasons:[1,2],seasonRatings:{'1':9},allSeasonsAvailableInSwedenWatched:true,seasonAvailabilityResearch:{swedenAvailableSeasonNumbers:[1,2],swedenProviderSeasonCounts:[{provider:'Apple TV',seasons:2}]}},
 {title:'Svensk titel',startYear:2026,imdbId:null,genres:['Reality'],status:'Sedd – alla säsonger tillgängliga i Sverige',watchedSeasons:[1],allSeasonsAvailableInSwedenWatched:true}
]});
const silo={title:'Silo',startYear:2023,imdbId:'tt14688458'};
test('series Vill se is independent of watched seasons, providers, genres, ratings and favorites',()=>{
 const before=base();const snapshot=JSON.stringify(before);
 const {register,changed}=applySeriesWatchlistChange(before,silo,true);
 assert.equal(changed,true);
 assert.equal(JSON.stringify(before),snapshot,'source snapshot is not mutated');
 assert.equal(seriesIsWatchlisted(register.series[0]),true);
 assert.equal(seriesDiscovery(register.series).metrics[1].value,1);
 assert.deepEqual(register.series[0],{...before.series[0],wantToWatch:true});
 assert.deepEqual(register.series[1],before.series[1]);
 assert.equal(register.description,before.description);
 assert.equal(register.series[0].allSeasonsAvailableInSwedenWatched,true);
 const undone=applySeriesWatchlistChange(register,silo,false);
 assert.equal(undone.changed,true);
 assert.equal(undone.register.series[0].wantToWatch,undefined);
 assert.equal(seriesIsWatchlisted(undone.register.series[0]),false);
 assert.deepEqual(undone.register.series[0],before.series[0]);
});
test('series without IMDb ID can be identified unambiguously by title and start year',()=>{
 const r=base(),target={title:'Svensk titel',startYear:2026,imdbId:null};
 const result=applySeriesWatchlistChange(r,target,true);
 assert.equal(result.register.series[1].wantToWatch,true);
 assert.equal(result.register.series[0].wantToWatch,undefined);
});
test('duplicate identification, forged target, missing required fields, and malformed flags are rejected',()=>{
 const original=base();
 assert.throws(()=>applySeriesWatchlistChange(original,{...silo,title:'Fel titel'},true),/finns inte/);
 assert.throws(()=>applySeriesWatchlistChange(original,{...silo,imdbId:'not-imdb'},true),/IMDb/);
 assert.throws(()=>applySeriesWatchlistChange(original,silo,'ja'),/sant eller falskt/);
 assert.throws(()=>applySeriesWatchlistChange(original,{...silo,startYear:undefined},true),/serieår/);
 const withDuplicate=base();withDuplicate.series.push({...withDuplicate.series[0]});
 assert.throws(()=>applySeriesWatchlistChange(withDuplicate,silo,true),/inte unik/);
 assert.throws(()=>applySeriesWatchlistChange({...original,schemaVersion:2},silo,true),/Ogiltigt serieregister/);
});
test('idempotent operation does not create unnecessary commits',()=>{
 const r=base();
 assert.equal(applySeriesWatchlistChange(r,silo,false).changed,false);
 const on=applySeriesWatchlistChange(r,silo,true).register;
 assert.equal(applySeriesWatchlistChange(on,silo,true).changed,false);
});
test('legacy Vill se status stays compatible with explicit removal',()=>{
 const r=base();r.series[0].status='Vill se';
 assert.equal(seriesIsWatchlisted(r.series[0]),true);
 const next=applySeriesWatchlistChange(r,silo,false);
 assert.equal(next.changed,true);
 assert.equal(next.register.series[0].wantToWatch,false);
 assert.equal(seriesIsWatchlisted(next.register.series[0]),false);
});
test('UI includes visible and persistent watchlist control and guarded API',()=>{
 const page=read('app/series.tsx'),route=read('app/api/series/route.ts'),client=read('lib/github-inbox.mjs');
 const overview=read('components/dashboard/MediaOverview.tsx');
 assert.match(page,/aria-pressed=\{seriesIsWatchlisted\(item\)\}/);
 assert.match(page,/action:'set-watchlist'/);
 assert.match(page,/expectedSha:sourceSha/);
 assert.match(page,/wantToWatch:!seriesIsWatchlisted\(item\)/);
 assert.match(page,/status==='villse'\?seriesIsWatchlisted\(item\)/);
 assert.match(page,/Vill se-lista/);
 assert.match(route,/origin!==new URL\(request.url\).origin/);
 assert.match(route,/current.sha!==input.expectedSha/);
 assert.match(route,/applySeriesWatchlistChange\(/);
 assert.match(route,/writeSeriesRegister\(current.sha,content\)/);
 assert.match(client,/filePath\('Serier\/register.json'\)/);
 assert.match(client,/sha:expectedSha/);
 assert.match(overview,/nh-media-quick-link/);
});
