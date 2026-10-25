import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFilmChange} from '../lib/films.mjs';

const film=()=>({
 imdbId:'tt1234567',title:'Example Film',year:2020,displayTitle:'Example Film – (2020)',
 genres:['Drama'],status:'Sedd',ourRating:8,ourReview:null,synopsis:'Old synopsis',
 series:null,viewings:[{date:null,provider:null,accessType:'okänt',priceSek:null}],
 startedViewingDate:null,plannedViewingDate:null,
 statusEvidence:{type:'direkt',note:'Bekräftad av användaren.'},
 metadataSource:'https://www.imdb.com/title/tt1234567/',
 acquisitions:[{platform:'HBO Max',status:'köpt',edition:'Blu-ray',purchaseDate:null,priceSek:null,evidence:'import'}],
 originalTitle:'Original title',alternativeTitles:['Alt title'],
 metadataSources:[{label:'IMDb',url:'https://www.imdb.com/title/tt1234567/'}],edition:{format:'4K UHD'},futureMetadata:{preserve:true}
});

test('film edits preserve canonical metadata that the form does not edit',()=>{
 const original=film();
 const submitted={...original};
 delete submitted.acquisitions;
 delete submitted.originalTitle;
 delete submitted.alternativeTitles;
 delete submitted.metadataSources;
 delete submitted.edition;
 delete submitted.futureMetadata;
 submitted.ourRating=9;
 const result=applyFilmChange({schemaVersion:'1.0.0',lastUpdated:'2026-10-18',films:[original]},'update',submitted);
 const saved=result.films[0];
 assert.equal(saved.ourRating,9);
 for(const key of ['acquisitions','originalTitle','alternativeTitles','metadataSources','edition','futureMetadata']){
  assert.deepEqual(saved[key],original[key],`${key} must survive a normal edit`);
 }
});

test('film schema validation accepts canonical acquisition metadata',()=>{
 const original=film();
 assert.doesNotThrow(()=>applyFilmChange({schemaVersion:'1.0.0',films:[original]},'update',original));
});

test('film edits can save a changed favorite flag without dropping other personal data',()=>{
 const original={...film(),favorite:true};
 const submitted={...original,favorite:false};
 const result=applyFilmChange({schemaVersion:'1.3.0',films:[original]},'update',submitted);
 assert.equal(result.films[0].favorite,false);
 assert.deepEqual(result.films[0].acquisitions,original.acquisitions);
 assert.deepEqual(result.films[0].viewings,original.viewings);
});

test('film edits reject a non-boolean favorite flag',()=>{
 const original=film();
 assert.throws(()=>applyFilmChange({schemaVersion:'1.3.0',films:[original]},'update',{...original,favorite:'yes'}),/favorit/i);
});
