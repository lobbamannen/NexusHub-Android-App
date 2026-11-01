import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {startUiTestServer} from '../scripts/ui-test-server.mjs';

test('UI server refuses an occupied port even when the old server returns valid pages',async()=>{
 const other=http.createServer((_req,res)=>res.end('old checkout'));
 other.listen(0,'127.0.0.1');await once(other,'listening');
 try {
  await assert.rejects(startUiTestServer({port:other.address().port,path:'/tests/ui/pulse-preview.html',timeoutMs:5000}),/Vite|server/i);
 } finally {other.close();await once(other,'close');}
});
test('UI server verifies its own run and stops after successful use',async()=>{
 const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
 const port=reservation.address().port;reservation.close();await once(reservation,'close');
 const server=await startUiTestServer({port,path:'/tests/ui/pulse-preview.html'});
 try {assert.equal((await fetch(server.url)).status,200);}finally {await server.stop();}
 await assert.rejects(fetch(server.url));
});
