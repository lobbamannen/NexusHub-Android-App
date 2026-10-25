import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEntry, escapeLike, validateRelation, MAX_FILE_SIZE} from '../lib/domain.mjs';
test('bevarar hela dokumenttexten och normaliserar metadata',()=>{
 const body='Åäö\n'.repeat(10000);const result=validateEntry({title:'  Titel  ',body,module:'databas',category:'AI',tags:['a','a','b']});
 assert.equal(result.body,body);assert.equal(result.title,'Titel');assert.deepEqual(result.tags,['a','b']);
});
test('avvisar tom titel och otillåtna moduler',()=>{
 assert.throws(()=>validateEntry({title:' ',body:'a'}));assert.throws(()=>validateEntry({title:'a',module:'bad'}));
});
test('sökning behandlar jokertecken som text',()=>assert.equal(escapeLike('a%b_c\\d'),'a\\%b\\_c\\\\d'));
test('relationer behöver två olika poster och en giltig typ',()=>{
 assert.throws(()=>validateRelation({sourceId:'x',targetId:'x',type:'relaterar'}));
 assert.equal(validateRelation({sourceId:'x',targetId:'y',type:'citerar'}).type,'citerar');
});
test('uppladdningar har en explicit skyddsgräns',()=>assert.equal(MAX_FILE_SIZE,25*1024*1024));
