import test from 'node:test';
import assert from 'node:assert/strict';
const {resolvedIdeaDraft}=await import('../lib/idea-resolution.mjs').catch(()=>({}));
const id='12345678-1234-4234-8234-123456789abc';
const local={sha:'a'.repeat(40),idea:{schemaVersion:1,id,text:'Min extra detalj',status:'investigating',createdAt:'2026-10-25T16:00:00.000Z',updatedAt:'2026-10-26T10:00:00.000Z'}};
const remote={sha:'b'.repeat(40),idea:{...local.idea,text:'Research från GitHub',status:'new'}};
test('resolution retains both texts and targets the reviewed remote revision',()=>{
 assert.equal(typeof resolvedIdeaDraft,'function');
 const before=JSON.stringify({local,remote}),result=resolvedIdeaDraft(local,remote,'merge','2026-10-26T12:00:00.000Z');
 assert.ok(result.idea.text.includes('Min extra detalj'));assert.ok(result.idea.text.includes('Research från GitHub'));
 assert.equal(result.sha,'b'.repeat(40));assert.equal(result.idea.id,id);assert.equal(result.idea.status,'investigating');assert.equal(JSON.stringify({local,remote}),before);
});
test('choosing either version preserves its exact text; excessive merges never truncate',()=>{
 assert.equal(typeof resolvedIdeaDraft,'function');
 assert.equal(resolvedIdeaDraft(local,remote,'local','2026-10-26T12:00:00.000Z').idea.text,'Min extra detalj');
 assert.deepEqual(resolvedIdeaDraft(local,remote,'github','2026-10-26T12:00:00.000Z'),remote);
 assert.equal(resolvedIdeaDraft(local,{...remote,idea:{...remote.idea,text:local.idea.text}},'merge','2026-10-26T12:00:00.000Z').idea.text,local.idea.text);
 assert.throws(()=>resolvedIdeaDraft({...local,idea:{...local.idea,text:'x'.repeat(30000)}},{...remote,idea:{...remote.idea,text:'y'.repeat(30000)}},'merge','2026-10-26T12:00:00.000Z'),/50 000/);
 assert.throws(()=>resolvedIdeaDraft(local,{...remote,idea:{...remote.idea,id:'12345678-1234-4234-8234-123456789abd'}},'local','2026-10-26T12:00:00.000Z'));
});
