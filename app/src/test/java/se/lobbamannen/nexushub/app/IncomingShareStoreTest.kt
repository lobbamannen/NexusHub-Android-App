package se.lobbamannen.nexushub.app

import android.app.Application
import android.content.Intent
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(application=Application::class,sdk=[34])
class IncomingShareStoreTest {
    private val context get()=RuntimeEnvironment.getApplication()
    private fun share(bytes:ByteArray):Intent {
        val uri=Uri.parse("content://incoming-test/"+UUID.randomUUID())
        shadowOf(context.contentResolver).registerInputStream(uri,ByteArrayInputStream(bytes))
        return Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM,uri)
    }
    private fun received(store:IncomingShareStore,before:Set<String>):JSONObject {
        val all=JSONArray(store.list())
        return (0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id") !in before}
    }
    private fun ids(store:IncomingShareStore):Set<String> {
        val all=JSONArray(store.list()); return (0 until all.length()).map{all.getJSONObject(it).getString("id")}.toSet()
    }
    @Test fun finalMetadataEnospcLeavesDiscoverableJournalAndCompleteOriginal() {
        val disk=object:IncomingShareStore.Disk() {
            var writes=0
            override fun availableBytes(directory:File)=1024L*1024*1024
            override fun writeMetadata(target:File,metadata:JSONObject) {
                writes++
                if(writes==4) {
                    val atomic=android.util.AtomicFile(target)
                    val out=atomic.startWrite()
                    out.write("{partial".toByteArray())
                    atomic.failWrite(out)
                    throw IOException("ENOSPC final metadata")
                }
                super.writeMetadata(target,metadata)
            }
        }
        val store=IncomingShareStore(context,disk); val before=ids(store)
        val bytes="intact original åäö".toByteArray()
        assertTrue(store.receive(share(bytes)))
        val recovered=received(IncomingShareStore(context),before)
        assertTrue(recovered.getBoolean("recoveryRequired"))
        assertTrue(recovered.getString("importError").isNotBlank())
        val file=recovered.getJSONArray("files").getJSONObject(0)
        assertEquals("complete",file.getString("state"))
        assertArrayEquals(bytes,store.localFile(recovered.getString("id"),file.getString("id")).readBytes())
    }
    @Test fun journalFailureNeverConsumesTheGrantedStream() {
        var reads=0
        val uri=Uri.parse("content://incoming-test/"+UUID.randomUUID())
        shadowOf(context.contentResolver).registerInputStream(uri,object:ByteArrayInputStream("original".toByteArray()) {
            override fun read(bytes:ByteArray,offset:Int,length:Int):Int { reads++; return super.read(bytes,offset,length) }
        })
        val store=IncomingShareStore(context,object:IncomingShareStore.Disk() {
            override fun writeMetadata(target:File,metadata:JSONObject) { throw IOException("ENOSPC journal") }
        })
        val before=ids(store)
        try { store.receive(Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM,uri)); fail("Journal failure must surface") }
        catch(_:IOException) {}
        assertEquals(0,reads)
        assertTrue(received(IncomingShareStore(context),before).getBoolean("recoveryRequired"))
    }
    @Test fun midStreamEnospcPreservesPartialOriginalAndRecordsFileError() {
        val disk=object:IncomingShareStore.Disk() {
            override fun availableBytes(directory:File)=1024L*1024*1024
            override fun writeChunk(output:FileOutputStream,bytes:ByteArray,count:Int) {
                output.write(bytes,0,3); output.fd.sync(); throw IOException("ENOSPC data")
            }
        }
        val store=IncomingShareStore(context,disk); val before=ids(store)
        assertTrue(store.receive(share("original".toByteArray())))
        val item=received(IncomingShareStore(context),before); val file=item.getJSONArray("files").getJSONObject(0)
        assertTrue(file.getString("error").contains("ENOSPC"))
        assertEquals(3L,file.getLong("partialBytes"))
        assertEquals("ori",store.localFile(item.getString("id"),file.getString("id")).readText())
        assertFalse(file.has("sha"))
    }
    @Test fun freeSpaceBudgetRejectsCopyBeforeConsumingOriginal() {
        val disk=object:IncomingShareStore.Disk() { override fun availableBytes(directory:File)=1L }
        val store=IncomingShareStore(context,disk); val before=ids(store)
        assertTrue(store.receive(share("original".toByteArray())))
        val item=received(store,before); val file=item.getJSONArray("files").getJSONObject(0)
        assertTrue(file.has("error")); assertEquals(0L,file.getLong("partialBytes"))
        assertFalse(File(context.filesDir,"incoming-v1/"+item.getString("id")+"/"+file.getString("id")).exists())
    }
    @Test fun legacyOrphanDirectoryIsVisibleWithoutFinalMetadataAndNeverDeleted() {
        val id=UUID.randomUUID().toString(); val fid=UUID.randomUUID().toString()
        val directory=File(context.filesDir,"incoming-v1/$id").apply{mkdirs()}
        val original=File(directory,fid).apply{writeText("retained")}
        val store=IncomingShareStore(context); val all=JSONArray(store.list())
        val item=(0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id")==id}
        assertTrue(item.getBoolean("recoveryRequired")); assertEquals(fid,item.getJSONArray("files").getJSONObject(0).getString("id"))
        assertEquals("retained",original.readText())
    }
    @Test fun backgroundStagingDiskErrorIsVisibleAndRetryableWhileSourceIsRetained() {
        val store=IncomingShareStore(context,object:IncomingShareStore.Disk(){override fun availableBytes(directory:File)=1024L*1024*1024})
        val before=ids(store); assertTrue(store.receive(share("safe original".toByteArray())))
        val item=received(store,before); val id=item.getString("id"); val fid=item.getJSONArray("files").getJSONObject(0).getString("id")
        val root=File(context.filesDir,"background-intake-v1").apply{mkdirs()}
        File(root,id).writeText("simulate unavailable queue directory")
        BackgroundIntake.importShares(context)
        val updated=JSONArray(store.list()).let { all -> (0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id")==id} }
        assertTrue(updated.getString("importError").contains("bakgrundsuppladdningen"))
        assertTrue(updated.getBoolean("importRetryable"))
        assertEquals("safe original",store.localFile(id,fid).readText())
    }
    @Test fun malformedFileMetadataCannotHideOtherInboxOriginals() {
        val id=UUID.randomUUID().toString(); val fid=UUID.randomUUID().toString()
        val directory=File(context.filesDir,"incoming-v1/$id").apply{mkdirs()}
        File(directory,fid).writeText("retained despite damaged journal")
        File(directory,"metadata.json").writeText(JSONObject().put("id",id).put("text","saved text")
            .put("state","ready").put("files",JSONArray().put("corrupted file entry")).toString())
        val all=JSONArray(IncomingShareStore(context).list())
        val item=(0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id")==id}
        assertTrue(item.getBoolean("recoveryRequired"))
        assertEquals("saved text",item.getString("text"))
        assertEquals(fid,item.getJSONArray("files").getJSONObject(0).getString("id"))
        assertEquals("retained despite damaged journal",File(directory,fid).readText())
    }

    @Test fun verifiedStagingRetryClearsOnlyItsOldQueueErrorAndKeepsOriginals() {
        org.robolectric.shadows.ShadowStatFs.registerStats(context.filesDir.absolutePath,1000000,1000000,1000000)
        val store=IncomingShareStore(context,object:IncomingShareStore.Disk(){override fun availableBytes(directory:File)=1024L*1024*1024})
        val before=ids(store);assertTrue(store.receive(share("retry original".toByteArray())))
        val item=received(store,before);val id=item.getString("id");val fid=item.getJSONArray("files").getJSONObject(0).getString("id")
        store.markImportError(id,"old queue disk failure",retryable=true)
        val scheduled=mutableListOf<String>()
        BackgroundIntake.importShares(context) { _,jobId -> scheduled.add(jobId) }
        val updated=JSONArray(store.list()).let{all->(0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id")==id}}
        assertFalse(updated.has("importError"));assertFalse(updated.has("importRetryable"))
        assertEquals(listOf(id),scheduled)
        assertEquals("retry original",store.localFile(id,fid).readText())
        // A job persisted before error cleanup is verified by manifest on the next retry.
        store.markImportError(id,"cleanup was interrupted",retryable=true)
        BackgroundIntake.importShares(context) { _,_ -> }
        val verified=JSONArray(store.list()).let{all->(0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id")==id}}
        assertFalse(verified.has("importError"))
        assertEquals("pending",BackgroundIntakeStore(context).job(id)!!.getString("state"))
    }
    @Test fun clearingAQueueErrorNeverHidesFileCopyFailure() {
        val store=IncomingShareStore(context,object:IncomingShareStore.Disk(){override fun availableBytes(directory:File)=1L})
        val before=ids(store);assertTrue(store.receive(share("unreceived original".toByteArray())))
        val item=received(store,before);val id=item.getString("id")
        store.markImportError(id,"queue failed too",retryable=true)
        store.clearStagingError(id)
        val updated=JSONArray(store.list()).let{all->(0 until all.length()).map{all.getJSONObject(it)}.single{it.getString("id")==id}}
        assertEquals("queue failed too",updated.getString("importError"))
        assertTrue(updated.getJSONArray("files").getJSONObject(0).has("error"))
    }

}
