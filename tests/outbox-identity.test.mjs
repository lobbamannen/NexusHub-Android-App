import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingIntentFor,newIntentId} from '../lib/outbox-identity.mjs';

test('matching pending mutations retry the same operation across old and new identity schemas',()=>{
 const hash='a'.repeat(64),old={id:hash,status:'pending'};
 assert.equal(pendingIntentFor([old],hash),old);
 const later={id:'uuid-for-new-attempt',fingerprint:hash,status:'conflict'};
 assert.equal(pendingIntentFor([later],hash),later);
 assert.equal(pendingIntentFor([later],'another'),null);
});
test('a historical receipt cannot suppress a later A-to-B-to-A save',()=>{
 const hash='f'.repeat(64);
 assert.equal(newIntentId(hash,false,()=>{throw Error('not called')}),hash);
 const fresh='fresh-request-id';
 assert.equal(newIntentId(hash,true,()=>fresh),fresh);
 assert.notEqual(fresh,hash);
});
