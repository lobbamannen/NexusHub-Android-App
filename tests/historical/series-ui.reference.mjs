import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const portal=read('app/portal.tsx');
const series=read('app/series.tsx');
const api=read('app/api/series/route.ts');
const css=read('app/series.css');

test('Serier kopplas till samma portal som Filmer',()=>{
 assert.match(portal,/import Series from '\.\/series'/);
 assert.match(portal,/\['serier','Serier',Tv\]/);
 assert.match(portal,/view==='filmer'\|\|view==='serier'/);
 assert.match(portal,/<Series initialItem=\{mediaItem\}\/\>/);
 assert.match(portal,/aria-label="Film- och seriebibliotek"/);
 assert.match(portal,/Film & serier/);
});
test('Servern verifierar GitHub-registret och begränsar Vill se-skrivningar',()=>{
 assert.match(api,/github\('databas'\)\.browse\('Serier\/register\.json'\)/);
 assert.match(api,/gitBlobSha\(bytes\)!==file\.sha/);
 assert.match(api,/register\?\.schemaVersion!==1/);
 assert.match(api,/no-store/);
 assert.match(api,/export async function GET/);
 assert.match(api,/export async function POST\(request:Request\)/);
 assert.match(api,/\['set-watchlist','set-watched-seasons','set-release-watch'\]\.includes\(input\.action\)/);
 assert.match(api,/applySeriesWatchedSeasonsChange\(current\.register,input\.target,input\.watchedSeasons\)/);
 assert.match(api,/current\.sha!==input\.expectedSha/);
 assert.match(api,/applySeriesWatchlistChange\(current\.register,input\.target,input\.wantToWatch\)/);
});
test('Visningen särskiljer svenska nummer, katalogantal och internationella säsonger',()=>{
 for(const name of ['swedenAvailableSeasonNumbers','swedenProviderSeasonCounts','availableSeasonNumbers','internationalVerifiedReleasedSeasonCount','watchedSeasons','allSeasonsAvailableInSwedenWatched','viewingProvider'])assert.ok(series.includes(name),name);
 assert.match(series,/Individuella säsongsnummer inte angivna för tjänsten/);
 assert.match(series,/katalogantal ger inte automatiskt kända säsongsnummer/);
 assert.match(series,/textNumbers/);
});
test('Serier har filter, paginering, posterreserv och mobil CSS',()=>{
 assert.match(series,/setPage\(p=>p\+1\)/);
 assert.match(series,/setPage\(p=>p-1\)/);
 assert.match(series,/film-poster-fallback/);
 assert.match(series,/Streamingkatalog/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/\.media-switch/);
});

test('Nya Chroma-seriedetaljer bevarar svensk tillgänglighet men möjliggör endast individuellt belagda säsonger',()=>{
 assert.match(series,/MediaDetailHero/);
 assert.match(series,/ChromaRating/);
 assert.match(series,/Om serien/);
 assert.match(series,/Säsong \{n\}/);
 assert.match(series,/action:'set-watched-seasons'/);
 assert.match(series,/seasonAvailabilityResearch/);
 assert.match(series,/onToggleSeason/);
 assert.match(series,/seasonSaving/);
 assert.match(series,/useBackHandler\(110/);
 assert.match(css,/series-provider/);
});
