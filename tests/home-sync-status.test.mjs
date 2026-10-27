import test from 'node:test';import assert from 'node:assert/strict';import {homeSyncStatus} from '../lib/home-sync-status.mjs';
test('corner status distinguishes completed sync from old local data, pause, work and errors',()=>{
 assert.equal(homeSyncStatus({}).label,'Ej verifierad');
 assert.equal(homeSyncStatus({checkedAt:'2026-10-27T12:00:00Z'}).tone,'ready');
 assert.equal(homeSyncStatus({running:true,checkedAt:'old'}).label,'Hämtar…');
 assert.equal(homeSyncStatus({paused:true,checkedAt:'old'}).label,'Pausad');
 assert.equal(homeSyncStatus({error:'Offline',checkedAt:'old'}).tone,'error');
});
