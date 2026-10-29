import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyWidgetSnapshot} from '../lib/widget-activity.mjs';
import {existingIdeaNumbers} from '../lib/widget-activity.mjs';
test('deleted ideas remain in number history but disappear from daily home and widget counts',()=>{
 const index={schemaVersion:1,nextNumber:3,entries:[{id:'a',createdAt:'2026-10-29T12:00:00Z'},{id:'b',createdAt:'2026-10-29T12:00:00Z'}]};
 const visible=existingIdeaNumbers(index,[{path:'Ideer/a.json'}]);
 assert.equal(index.entries.length,2);assert.equal(visible.entries.length,1);assert.equal(dailyWidgetSnapshot({},visible.entries,new Date('2026-10-29T14:00:00Z')).counts.ideas,1);
 assert.deepEqual(dailyWidgetSnapshot({},existingIdeaNumbers(index,[]).entries,new Date('2026-10-29T14:00:00Z')).counts,{});
 assert.equal(existingIdeaNumbers(index,[{path:'Ideer/Genomforda/b.json'}]).entries[0].id,'b');
});
test('shares Stockholm day and creation counts, hides zeros and ignores yesterday',()=>{
 const now=new Date('2026-10-29T23:30:00Z');
 assert.deepEqual(dailyWidgetSnapshot({day:'2026-10-30',counts:{films:2,series:0,stories:1}},[{createdAt:'2026-10-29T23:10:00Z'},{createdAt:'2026-10-29T12:00:00Z'}],now).counts,{ideas:1,films:2,stories:1});
 assert.deepEqual(dailyWidgetSnapshot({day:'2026-10-29',counts:{films:9}},[],now).counts,{});
});
test('negative, missing and invalid counters never appear as new content',()=>{
 assert.deepEqual(dailyWidgetSnapshot({day:'2026-10-29',counts:{films:-1,series:null,stories:2.5}},[],new Date('2026-10-29T12:00:00Z')).counts,{});
});
