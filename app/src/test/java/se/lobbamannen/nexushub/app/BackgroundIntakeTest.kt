package se.lobbamannen.nexushub.app

import android.app.Application
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.UUID
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(application=Application::class,sdk=[34])
class BackgroundIntakeTest {
    private fun input(id:String=UUID.randomUUID().toString())=JSONObject().put("id",id).put("text","").put("createdAt","2026-10-30T11:00:00.000Z").put("files",JSONArray().put(JSONObject().put("id",UUID.randomUUID().toString()).put("name","../Räddad.md").put("mime","text/markdown").put("base64",Base64.encodeToString("original\r\n".toByteArray(),Base64.NO_WRAP))))
    @Test fun stageSurvivesNewStoreAndPreservesOriginalBytes(){val c=RuntimeEnvironment.getApplication();val item=input();val store=BackgroundIntakeStore(c);store.stage(item);val second=BackgroundIntakeStore(c);val original=second.payload(item.getString("id"));assertEquals("original\r\n",String(Base64.decode(original.getJSONArray("files").getJSONObject(0).getString("base64"),Base64.DEFAULT)));assertEquals("pending",second.job(item.getString("id"))!!.getString("state"))}
    @Test fun repeatedStageCannotReplaceAnExistingOperation(){val c=RuntimeEnvironment.getApplication();val store=BackgroundIntakeStore(c);val item=input();store.stage(item);assertEquals(1,(0 until store.jobs().length()).count{store.jobs().getJSONObject(it).getString("id")==item.getString("id")});item.getJSONArray("files").getJSONObject(0).put("base64",Base64.encodeToString("changed".toByteArray(),Base64.NO_WRAP));try{store.stage(item);fail("existing intent must be immutable")}catch(_:IllegalArgumentException){} }
    @Test fun cancelledOperationCannotBeResurrected(){val store=BackgroundIntakeStore(RuntimeEnvironment.getApplication());val item=input();store.stage(item);assertTrue(store.cancel(item.getString("id")));assertEquals("cancelled",store.job(item.getString("id"))!!.getString("state"));try{store.stage(item);fail("cancelled must not enqueue")}catch(_:IllegalArgumentException){}}
    @Test fun metadataUsesExistingJavascriptEncodingAndHashes(){val item=input("11111111-1111-4111-8111-111111111111");val f=item.getJSONArray("files").getJSONObject(0);f.put("id","22222222-2222-4222-8222-222222222222");val prepared=BackgroundIntakeProtocol.prepare(item);val meta=prepared.last();assertTrue(meta.path.endsWith("/metadata.json"));assertTrue(String(meta.bytes).contains("\"schemaVersion\": 1,"));assertTrue(String(meta.bytes).contains("22222222-2222-4222-8222-222222222222-_Räddad.md"));assertEquals("95d09f2b10159347eece71399a7e2e907ea3df4f",BackgroundIntakeProtocol.hash("hello world".toByteArray()));assertEquals("\n",String(meta.bytes).takeLast(1))}
    @Test fun invalidIdentifiersAndMismatchedHashesAreRejected(){val item=input("../../escape");try{BackgroundIntakeProtocol.prepare(item);fail("invalid ID")}catch(_:IllegalArgumentException){};val second=input();second.getJSONArray("files").getJSONObject(0).put("sha","0000000000000000000000000000000000000000");try{BackgroundIntakeProtocol.prepare(second);fail("hash mismatch")}catch(_:IllegalArgumentException){}}

    @Test fun unicodeMetadataMatchesJavascriptByteForByte(){
        val item=input("11111111-1111-4111-8111-111111111111")
        item.getJSONArray("files").getJSONObject(0).put("id","22222222-2222-4222-8222-222222222222")
        item.put("sourceLabel","DeepSeek").put("text","Rapport \"citat\"\r\n😎\t\u0001\ud800")
        val entries=BackgroundIntakeProtocol.prepare(item)
        assertEquals("60ef7acfb9eb5d2d3909b1ec747f9f49bc85e732",entries.last().sha)
        assertTrue(String(entries.first{it.path.endsWith("delad-text.txt")}.bytes,Charsets.UTF_8).endsWith("\ufffd"))
    }
    @Test fun whitespaceFollowsJavascriptIncludingBom(){
        val item=input();item.put("text"," \ufeff\u00a0\n");item.put("sourceLabel","\ufeff DeepSeek \ufeff")
        val entries=BackgroundIntakeProtocol.prepare(item)
        assertFalse(entries.any{it.path.endsWith("delad-text.txt")})
        assertEquals("DeepSeek",JSONObject(String(entries.last().bytes)).getString("sourceLabel"))
    }
    @Test fun cancellationDoesNotWaitOnNetworkAndPreservesAcknowledgedReceipt(){
        val store=BackgroundIntakeStore(RuntimeEnvironment.getApplication());val item=input();val id=item.getString("id");store.stage(item)
        val entered=java.util.concurrent.CountDownLatch(1);val release=java.util.concurrent.CountDownLatch(1)
        val thread=Thread{val gate=BackgroundIntakeStore.transfer(id);gate.lock();try{entered.countDown();release.await()}finally{gate.unlock()}};thread.start();assertTrue(entered.await(2,java.util.concurrent.TimeUnit.SECONDS))
        try{val began=System.nanoTime();assertFalse(store.cancel(id));assertTrue((System.nanoTime()-began)/1000000<500);assertTrue(store.cancellationRequested(id));assertEquals("pending",store.job(id)!!.getString("state"))}finally{release.countDown();thread.join(2000)}
        store.update(id,"succeeded",receipt=JSONObject().put("commit","a".repeat(40)));assertTrue(store.cancel(id))
        assertEquals("a".repeat(40),store.job(id)!!.getJSONObject("receipt").getString("commit"))
        try{store.stage(item);fail("cancel tombstone must survive an app restart")}catch(_:IllegalArgumentException){}
    }
    @Test fun remotelyDeletedPackageIsExplicitlyIdentified(){
        val store=BackgroundIntakeStore(RuntimeEnvironment.getApplication());val item=input();val id=item.getString("id");store.stage(item)
        assertTrue(store.cancel(id,remoteDeleted=true));assertTrue(store.job(id)!!.getJSONObject("receipt").getBoolean("deleted"))
    }
    private class Server:BackgroundIntakeTransport {
        override fun uploadFileBlob(file:File,shouldCancel:()->Boolean):String {
            if(shouldCancel())throw BackgroundIntakeFailure("Cancelled",499)
            val body=JSONObject().put("content",Base64.encodeToString(file.readBytes(),Base64.NO_WRAP)).put("encoding","base64")
            return request("/git/blobs","POST",body)
        }
        var head="a".repeat(40);var files=JSONArray();var prepared=JSONArray();var history=false;var loseReply=false;var writes=0;var refWrites=0;var cancelled=false;var cancelAfterBlob=false
        override fun request(path:String,method:String,body:JSONObject?):String {
            if(method!="GET")writes++
            return when{
                path=="/git/ref/heads/main"->JSONObject().put("object",JSONObject().put("sha",head)).toString()
                path.startsWith("/git/commits/")->JSONObject().put("tree",JSONObject().put("sha","c".repeat(40))).toString()
                path.startsWith("/git/trees/")->JSONObject().put("truncated",false).put("tree",files).toString()
                path.startsWith("/commits?")->if(history)"[{}]" else "[]"
                path=="/git/blobs"->{if(cancelAfterBlob)cancelled=true;JSONObject().put("sha",BackgroundIntakeProtocol.hash(Base64.decode(body!!.getString("content"),Base64.DEFAULT))).toString()}
                path=="/git/trees"->{prepared=body!!.getJSONArray("tree");JSONObject().put("sha","d".repeat(40)).toString()}
                path=="/git/commits"->JSONObject().put("sha","b".repeat(40)).toString()
                path=="/git/refs/heads/main"->{assertFalse(body!!.getBoolean("force"));refWrites++;head=body.getString("sha");files=prepared;history=true;if(loseReply){loseReply=false;throw java.io.IOException("lost acknowledgement")};"{}"}
                else->error("Unexpected request $method $path")
            }
        }
    }
    @Test fun lostPublicationReplyReconcilesWithoutSecondWrite(){
        val server=Server();server.loseReply=true;val client=BackgroundIntakeGitHub(server);val item=input()
        try{client.upload(item);fail("first reply is lost")}catch(_:java.io.IOException){}
        val writes=server.writes;val receipt=client.upload(item)
        assertEquals(writes,server.writes);assertEquals(1,server.refWrites);assertEquals("b".repeat(40),receipt.getString("commit"));assertEquals(2,receipt.getJSONArray("entries").length())
    }
    @Test fun deletedHistoryNeverResurrectsAnOldUpload(){
        val server=Server();server.history=true
        assertTrue(BackgroundIntakeGitHub(server).upload(input()).getBoolean("deleted"));assertEquals(0,server.writes)
    }
    @Test fun foreignChangedPackageIsAConflictWithoutWriting(){
        val item=input();val server=Server();server.files=JSONArray().put(JSONObject().put("path",BackgroundIntakeProtocol.root+item.getString("id")+"/metadata.json").put("sha","0".repeat(40)).put("type","blob"))
        try{BackgroundIntakeGitHub(server).upload(item);fail("foreign package must not overwrite")}catch(e:BackgroundIntakeFailure){assertEquals(409,e.status)}
        assertEquals(0,server.writes)
    }
    @Test fun cancelledTransferDoesNotPublishItsPreparedBlobs(){
        val server=Server();server.cancelAfterBlob=true
        try{BackgroundIntakeGitHub(server).upload(input()){server.cancelled};fail("cancelled transfer must stop")}catch(e:BackgroundIntakeFailure){assertEquals(499,e.status)}
        assertEquals(0,server.refWrites)
    }

    @Test fun nativeSharedFilesUseTheExistingQueueWithoutBase64Copies(){
        val context=RuntimeEnvironment.getApplication()
        val item=input();val id=item.getString("id")
        val file=item.getJSONArray("files").getJSONObject(0)
        val fid=file.getString("id")
        val bytes=Base64.decode(file.getString("base64"),Base64.DEFAULT)
        val oldMeta=BackgroundIntakeProtocol.prepare(item).last().sha
        val originalDir=File(context.filesDir,"incoming-v1/$id").apply{mkdirs()}
        File(originalDir,fid).writeBytes(bytes)
        file.remove("base64")
        file.put("sha",BackgroundIntakeProtocol.hash(bytes))
        val store=BackgroundIntakeStore(context)
        assertEquals("pending",store.stageShared(item,IncomingShareStore(context)).getString("state"))
        assertEquals(oldMeta,store.job(id)!!.getString("manifestSha"))
        assertEquals(bytes.toList(),File(store.fileDirectory(id),fid).readBytes().toList())
        val raw=store.payloadForUpload(id)
        assertFalse(raw.getJSONArray("files").getJSONObject(0).has("base64"))
        val entries=BackgroundIntakeProtocol.prepareLocal(raw,store.fileDirectory(id))
        assertEquals(oldMeta,entries.last().sha)
        assertTrue(entries.first().source?.isFile==true)
        val server=Server()
        val receipt=BackgroundIntakeGitHub(server).uploadFromFiles(raw,store.fileDirectory(id))
        assertEquals(oldMeta,receipt.getString("manifestSha"))
        assertEquals(1,server.refWrites)
        assertEquals("succeeded",store.update(id,"succeeded",receipt=receipt).getString("state"))
    }
    @Test fun zeroByteFilesAreDurableAndContentChecked(){
        val store=BackgroundIntakeStore(RuntimeEnvironment.getApplication());val item=input();val file=item.getJSONArray("files").getJSONObject(0)
        file.put("base64","").put("sha",BackgroundIntakeProtocol.hash(ByteArray(0)));store.stage(item)
        assertEquals("",store.payload(item.getString("id")).getJSONArray("files").getJSONObject(0).getString("base64"))
    }
    @Test fun anotherPackagesIdenticalDocumentDoesNotCreateAnExtraCopy(){
        val item=input();val server=Server();val first=BackgroundIntakeProtocol.prepare(item).first()
        server.files=JSONArray().put(JSONObject().put("path",BackgroundIntakeProtocol.root+"33333333-3333-4333-8333-333333333333/report.md").put("sha",first.sha).put("type","blob"))
        try{BackgroundIntakeGitHub(server).upload(item);fail("duplicate should remain a reviewable conflict")}catch(e:BackgroundIntakeFailure){assertEquals(409,e.status)}
        assertEquals(0,server.writes)
    }
}
