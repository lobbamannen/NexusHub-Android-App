import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyStoryStatus,applyStoryStatus,validateStoryStatus,validateStoryPath} from '../lib/story-status.mjs';

const first='Berattelser/Hemsökta hus/Borgvattnets prästgård — 4,5 av 5 ★.md';
const second='Berattelser/True crime/Peter Bergmann - 5 av 5 ★.md';
const when='2026-10-17T19:30:00.000Z';
test('tomt register är giltigt och filerna ändras inte',()=>{
 const source=emptyStoryStatus(),old=JSON.stringify(source);
 const next=applyStoryStatus(source,{action:'set',path:first,field:'saved',value:true},when);
 assert.equal(next.entries[first].saved,true);assert.equal(next.entries[first].read,false);
 assert.equal(JSON.stringify(source),old);
});
test('Sparad och Läst kan växlas oberoende utan att tappa den andra markeringen',()=>{
 let current=emptyStoryStatus();
 current=applyStoryStatus(current,{action:'set',path:first,field:'saved',value:true},when);
 current=applyStoryStatus(current,{action:'set',path:first,field:'read',value:true},when);
 assert.deepEqual({...current.entries[first]},{saved:true,read:true,updatedAt:when});
 current=applyStoryStatus(current,{action:'set',path:first,field:'saved',value:false},when);
 assert.equal(current.entries[first].read,true);assert.equal(current.entries[first].saved,false);
});
test('migration från äldre lokala markeringar är additiv och idempotent',()=>{
 let current=applyStoryStatus(emptyStoryStatus(),{action:'set',path:first,field:'read',value:true},when);
 current=applyStoryStatus(current,{action:'migrate',paths:[{path:first,saved:true,read:false},{path:second,saved:false,read:true}]},when);
 assert.equal(current.entries[first].saved,true);
 assert.equal(current.entries[first].read,true);
 assert.equal(current.entries[second].read,true);
 const again=applyStoryStatus(current,{action:'migrate',paths:[{path:first,saved:true,read:false}]},when);
 assert.equal(again.entries[first].read,true);
});
test('okända registerversioner och skadad metadata får aldrig skrivs över',()=>{
 assert.throws(()=>validateStoryStatus({schemaVersion:2,entries:{}}),/okänt format/);
 assert.throws(()=>validateStoryStatus({schemaVersion:1,entries:{[first]:{saved:'true',read:false,updatedAt:when}}}),/Felaktig/);
 assert.throws(()=>applyStoryStatus(emptyStoryStatus(),{action:'set',path:first,field:'read',value:'yes'},when),/Ogiltig/);
});
test('sökvägsregler hindrar att andra GitHub-filer ändras via lässtatus',()=>{
 assert.equal(validateStoryPath(first),first);
 for(const path of ['Filmer/register.json','Berattelser/../Filmer/register.md','Berattelser/True crime/../foo.md','Berattelser/lasstatus.json','Berattelser/x\\evil.md','Berattelser/Crime/x.docx'])assert.throws(()=>validateStoryPath(path));
});
