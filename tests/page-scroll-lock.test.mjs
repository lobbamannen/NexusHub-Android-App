import test from 'node:test';
import assert from 'node:assert/strict';
import {lockPageScroll} from '../lib/page-scroll-lock.mjs';
function page(value='',priority=''){
 const props=new Map(value?[['overflow',{value,priority}]]:[]);
 return {style:{getPropertyValue:key=>props.get(key)?.value||'',getPropertyPriority:key=>props.get(key)?.priority||'',setProperty:(key,value,priority='')=>props.set(key,{value,priority}),removeProperty:key=>props.delete(key)}};
}
test('menu-to-editor handoff stays locked only while an owner remains, independent of close order',()=>{
 const body=page();const menu=lockPageScroll(body),editor=lockPageScroll(body);
 menu();assert.equal(body.style.getPropertyValue('overflow'),'hidden');
 editor();assert.equal(body.style.getPropertyValue('overflow'),'');
});
test('nested dialogs closing from inner to outer restore the initial style exactly',()=>{
 const body=page('auto','important'),outer=lockPageScroll(body),inner=lockPageScroll(body);
 inner();assert.equal(body.style.getPropertyValue('overflow'),'hidden');outer();
 assert.equal(body.style.getPropertyValue('overflow'),'auto');assert.equal(body.style.getPropertyPriority('overflow'),'important');
});
test('cleanup is idempotent and reacquiring while an old panel closes does not release the new owner',()=>{
 const body=page(),first=lockPageScroll(body);first();first();
 const second=lockPageScroll(body);first();assert.equal(body.style.getPropertyValue('overflow'),'hidden');second();assert.equal(body.style.getPropertyValue('overflow'),'');
});
test('locks on different documents are independent and a missing document is harmless',()=>{
 const a=page(),b=page(),releaseA=lockPageScroll(a),releaseB=lockPageScroll(b);releaseA();assert.equal(b.style.getPropertyValue('overflow'),'hidden');releaseB();assert.doesNotThrow(()=>lockPageScroll(null)());
});
