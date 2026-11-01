import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {loadReactModule} from './helpers/react-module.mjs';
import * as discovery from '../lib/media-discovery.mjs';
import * as genres from '../lib/genre-taxonomy.mjs';
import * as runtime from '../lib/media-runtime.mjs';
import {applySeriesWatchlistChange} from '../lib/series-watchlist.mjs';
import {applySeriesWatchedSeasonsChange} from '../lib/series-seasons.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
const noop=()=>null;
const Toolbar=props=>React.createElement('div',null,props.children);
function harness(initialItem) {
 let register={schemaVersion:1,lastUpdated:'2026-11-01',series:Array.from({length:30},(_,i)=>({title:'Serie '+String(i).padStart(2,'0'),imdbId:'tt'+(1000000+i),startYear:2020,genres:['Drama'],status:'Inte sett',ourRating:null,ourReview:null,watchedSeasons:[],seasonRatings:{},notes:'',seasonAvailabilityResearch:{swedenAvailableSeasonNumbers:[1,3],swedenProviderSeasonCounts:[{provider:'Tjänst',seasons:4}],internationalVerifiedReleasedSeasonCount:7}}))};
 let sha='a'.repeat(40);const writes=[];
 const mediaFetch=async(_url,options={})=>{
  if(options.method==='POST'){
   const input=JSON.parse(options.body);writes.push(input);assert.equal(input.expectedSha,sha);
   register=(input.action==='set-watchlist'?applySeriesWatchlistChange(register,input.target,input.wantToWatch):applySeriesWatchedSeasonsChange(register,input.target,input.watchedSeasons)).register;
   sha='b'.repeat(40);
  }
  return {ok:true,json:async()=>({register,sha})};
 };
 const window=new EventTarget();Object.assign(window,{scrollTo(){},scrollY:0,history:{replaceState(){}}});
 const {default:Series}=loadReactModule('app/series.tsx',{
  '@/lib/navigation-motion':{navigateMotion:fn=>fn()},'@/components/watch/ReleaseWatch':{WatchSeriesControl:noop},
  '@/lib/media-client':{mediaFetch},'@/components/MaterialIcon':noop,'@/components/NativeBackBridge':{useBackHandler:()=>{}},
  '@/lib/client-navigation':{restoreListScroll:()=>{}},'@/lib/library-state':{useLibraryState:(key,initial)=>React.useState(key==='series:browsing'?true:initial)},
  '@/components/media/ChromaRating':noop,'@/components/media/MediaStatistics':noop,
  '@/components/media/MediaDetailHero':p=>React.createElement('header',null,React.createElement('h2',null,p.title),p.poster,p.status,p.children),
  '@/lib/media-runtime.mjs':runtime,'@/components/dashboard/MediaOverview':{__esModule:true,default:p=>p.toolbar,GenreSubfilters:noop},
  '@/lib/recent-genre-posters.mjs':{recentGenrePosters:()=>[]},'@/components/dashboard/DiscoveryToolbar':Toolbar,
  '@/lib/media-discovery.mjs':discovery,'@/lib/genre-taxonomy.mjs':genres,
  '@/components/repository-poster':{__esModule:true,default:p=>p.children,usePosterRevision:()=>['rev',async()=>{},{series:[]}]},
 },{window,location:{hash:'#serier'},requestAnimationFrame:fn=>fn(),document:{getElementById:()=>null}});
 return {Series,initialItem,writes};
}
async function mounted(h,run){let view;try{await act(async()=>{view=Renderer.create(React.createElement(h.Series,{initialItem:h.initialItem}));await flush()});await run(view);}finally{if(view)await act(async()=>view.unmount())}}
const cards=view=>view.root.findAllByProps({className:'film-card series-card'});
const text=node=>JSON.stringify(node.toJSON());
test('series navigation renders the requested identity and a usable poster fallback',async()=>{
 const h=harness('tt1000002');await mounted(h,async view=>{assert.ok(text(view).includes('Serie 02'));assert.equal(view.root.findAllByProps({className:'film-poster-fallback'}).length,1);assert.equal(view.root.findAllByProps({className:'series-detail'}).length,1)});
});
test('series list paginates and a new query resets the page',async()=>{
 const h=harness();await mounted(h,async view=>{
  assert.equal(cards(view).length,24);
  const next=view.root.findAllByType('button').find(b=>b.children.includes('Nästa'));
  await act(async()=>next.props.onClick());assert.equal(cards(view).length,6);
  await act(async()=>view.root.findByType(Toolbar).props.onQuery('Serie 02'));
  assert.equal(cards(view).length,1);assert.ok(text(view).includes('Serie 02'));
 });
});
test('watchlist persists the actual identity and revision then updates visible state',async()=>{
 const h=harness('tt1000002');await mounted(h,async view=>{
  const button=()=>view.root.findAllByType('button').find(b=>b.props.className?.includes('series-wishlist-toggle'));
  assert.equal(button().props['aria-pressed'],false);
  await act(async()=>{await button().props.onClick();await flush()});
  assert.equal(h.writes[0].action,'set-watchlist');assert.equal(h.writes[0].target.imdbId,'tt1000002');assert.equal(h.writes[0].wantToWatch,true);assert.equal(button().props['aria-pressed'],true);
 });
});
test('only individually evidenced Swedish seasons are selectable, independently of catalogue totals',async()=>{
 const h=harness('tt1000002');await mounted(h,async view=>{
  const buttons=view.root.findByProps({className:'nh-season-select'}).findAllByType('button');
  assert.equal(buttons.length,2);assert.ok(text(view).includes('7'));assert.ok(text(view).includes('Tjänst'));
  await act(async()=>{await buttons[1].props.onClick();await flush()});
  assert.equal(h.writes[0].action,'set-watched-seasons');assert.deepEqual(h.writes[0].watchedSeasons,[3]);
  assert.equal(view.root.findByProps({className:'nh-season-select'}).findAllByType('button')[1].props['aria-pressed'],true);
 });
});
