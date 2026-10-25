import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackDispatcher} from '../lib/back-navigation.mjs';

test('native back handles only the uppermost layer and preserves lower layers',()=>{
 const back=createBackDispatcher(),seen=[];
 back.register(10,()=>{seen.push('module');return true;});
 const closeReader=back.register(100,()=>{seen.push('reader');return true;});
 const closeDialog=back.register(150,()=>{seen.push('dialog');return true;});
 assert.equal(back.back(),true);assert.deepEqual(seen,['dialog']);
 closeDialog();back.back();assert.deepEqual(seen,['dialog','reader']);
 closeReader();back.back();assert.deepEqual(seen,['dialog','reader','module']);
});
test('inactive layers fall through; an in-progress save consumes back',()=>{
 const back=createBackDispatcher();let left=false;
 back.register(10,()=>{left=true;return true;});
 back.register(100,()=>false);
 const saving=back.register(120,()=>true);
 back.back();assert.equal(left,false);
 saving();back.back();assert.equal(left,true);
});
test('unmounted layers cannot consume later back presses and empty home is safe',()=>{
 const back=createBackDispatcher();let count=0;
 const remove=back.register(100,()=>{count++;return true;});
 remove();remove();assert.equal(back.back(),false);assert.equal(count,0);
});
