import test from 'node:test';
import assert from 'node:assert/strict';
import {createMirrorWriteBarrier} from '../lib/mirror-write-barrier.mjs';

const before='a'.repeat(40),after='b'.repeat(40);
test('a confirmed write blocks older replica projections until its commit is mirrored',()=>{
 const barrier=createMirrorWriteBarrier();
 barrier.record('/api/films',after);
 assert.equal(barrier.blocked('/api/films',before),true);
 assert.equal(barrier.blocked('/api/series',before),false);
 assert.equal(barrier.blocked('/api/films',null),true);
 assert.equal(barrier.blocked('/api/films',after),false);
});
test('invalid write receipts never disable local reads',()=>{
 const barrier=createMirrorWriteBarrier();
 barrier.record('/api/economy','invalid');
 assert.equal(barrier.blocked('/api/economy',before),false);
});
