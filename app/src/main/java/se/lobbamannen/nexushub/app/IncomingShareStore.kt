package se.lobbamannen.nexushub.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.util.UUID

/** Original streams are copied into private persistent storage while their grants are valid. */
class IncomingShareStore(private val context: Context, private val disk: Disk = Disk()) {
    /** File-system boundaries allow deterministic ENOSPC/rename failures in receipt tests. */
    open class Disk {
        open fun availableBytes(directory: File): Long = android.os.StatFs(directory.path).availableBytes
        open fun writeChunk(output: FileOutputStream, bytes: ByteArray, count: Int) { output.write(bytes, 0, count) }
        open fun writeMetadata(target: File, metadata: JSONObject) {
            val atomic = AtomicFile(target)
            val output = atomic.startWrite()
            try {
                output.write(metadata.toString().toByteArray(Charsets.UTF_8))
                atomic.finishWrite(output)
            } catch (error: Exception) { atomic.failWrite(output); throw error }
        }
    }
    private val root = File(context.filesDir, "incoming-v1").apply { mkdirs() }
    companion object {
        private const val METADATA_RESERVE = 1024L * 1024
        private const val MAX_FILE_BYTES = 64L * 1024 * 1024
        private const val MAX_PACKAGE_BYTES = 128L * 1024 * 1024
        // Only legacy WebView JSON paths use Base64. Background GitHub uploads stream the original files.
        private const val MAX_BRIDGE_BYTES = 10L * 1024 * 1024
    }
    @Synchronized fun encodedSize(id:String,fileId:String):Long {
        require(uuid.matches(id) && uuid.matches(fileId))
        val file=File(File(root,id),fileId)
        require(file.isFile) { "Delad originalfil saknas." }
        return file.length()
    }
    @Synchronized fun markImportError(id:String,message:String,retryable:Boolean=false) {
        require(uuid.matches(id))
        val directory=File(root,id)
        val metadata=recover(directory)
        metadata.put("importError",message.take(300)).put("importRetryable",retryable)
        disk.writeMetadata(File(directory,"metadata.json"),metadata)
    }

    /** Retire only a queue-staging error after the durable job has been verified. */
    @Synchronized fun clearStagingError(id:String) {
        require(uuid.matches(id))
        val directory=File(root,id)
        val metadata=recover(directory)
        if(!metadata.optBoolean("importRetryable")||metadata.optBoolean("recoveryRequired"))return
        val files=metadata.getJSONArray("files")
        if((0 until files.length()).any { files.getJSONObject(it).has("error") })return
        metadata.remove("importError")
        metadata.remove("importRetryable")
        disk.writeMetadata(File(directory,"metadata.json"),metadata)
    }

    @Synchronized fun localFile(id:String,fileId:String):File {
        require(uuid.matches(id)&&uuid.matches(fileId)) { "Ogiltig originalidentitet." }
        val file=File(File(root,id),fileId)
        require(file.isFile) { "Det lokala originalet saknas." }
        return file
    }
    private val uuid = Regex("^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")
    @Suppress("DEPRECATION")
    fun receive(intent: Intent): Boolean {
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return false
        val id = UUID.randomUUID().toString()
        val directory = File(root, id).apply { mkdirs() }
        val uris = linkedSetOf<Uri>()
        if (intent.action == Intent.ACTION_SEND_MULTIPLE) uris.addAll(intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList())
        else intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.add(it) }
        intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) } }
        val text = listOfNotNull(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()).distinct().joinToString("\n\n")
        if (text.isBlank() && uris.isEmpty()) { directory.delete(); return false }
        val files = JSONArray()
        uris.forEach { _ -> files.put(JSONObject().put("id",UUID.randomUUID().toString())
            .put("name","dokument").put("mime","application/octet-stream").put("state","pending")) }
        val metadata = JSONObject().put("id",id).put("text",text)
            .put("createdAt",Instant.now().toString()).put("state","receiving").put("files",files)
        val target=File(directory,"metadata.json")
        // A durable receipt and all original IDs exist before consuming any stream grant.
        disk.writeMetadata(target,metadata)
        var packageBytes=0L
        for ((index,uri) in uris.withIndex()) {
            val entry=files.getJSONObject(index)
            val saved=File(directory,entry.getString("id"))
            try {
                require(uri.scheme == "content") { "Endast delade content-filer stöds." }
                var declared=-1L
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                    if(cursor.moveToFirst()) {
                        val nameColumn=cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val sizeColumn=cursor.getColumnIndex(OpenableColumns.SIZE)
                        if(nameColumn>=0&&!cursor.isNull(nameColumn))entry.put("name",cursor.getString(nameColumn).take(180))
                        if(sizeColumn>=0&&!cursor.isNull(sizeColumn))declared=cursor.getLong(sizeColumn)
                    }
                }
                entry.put("mime",context.contentResolver.getType(uri)?:"application/octet-stream").put("state","copying")
                disk.writeMetadata(target,metadata)
                val limit=minOf(MAX_FILE_BYTES,MAX_PACKAGE_BYTES-packageBytes)
                require(limit>0 && (declared<0 || declared<=limit)) { "Filen eller delningspaketet är för stort. Max 64 MiB per fil och 128 MiB totalt." }
                require(disk.availableBytes(directory)>METADATA_RESERVE+maxOf(0L,declared)) { "Otillräckligt ledigt utrymme. Originalet kan delas igen efter att utrymme frigjorts." }
                var copied=0L
                context.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(saved).use { output ->
                        val buffer=ByteArray(64*1024)
                        while(true) {
                            val n=input.read(buffer)
                            if(n<0)break
                            if(n==0)continue
                            require(copied+n<=limit) { "Filen eller delningspaketet är för stort." }
                            require(disk.availableBytes(directory)>=METADATA_RESERVE+n) { "Lagringsutrymmet tog slut under mottagningen." }
                            disk.writeChunk(output,buffer,n)
                            copied+=n
                        }
                        output.fd.sync()
                    }
                } ?: error("Den delade filen kunde inte öppnas.")
                require(declared<0 || copied==declared) { "Ofullständig delad fil." }
                entry.put("bytes",copied).put("sha",BackgroundIntakeProtocol.hashFile(saved)).put("state","complete")
            } catch (error: Exception) {
                // A partially written original is evidence and must remain available for recovery.
                entry.put("state","failed").put("partialBytes",if(saved.isFile)saved.length() else 0L)
                    .put("error",error.message?:"Filen kunde inte sparas lokalt.")
            }
            packageBytes+=if(saved.isFile)saved.length() else 0L
            try { disk.writeMetadata(target,metadata) }
            catch (error: Exception) {
                // The earlier journal still identifies the package and every file. Stop copying.
                metadata.put("importError",error.message?:"Mottagningens metadata kunde inte säkras.")
                return true
            }
        }
        metadata.put("state",if((0 until files.length()).any{files.getJSONObject(it).has("error")})"partial" else "ready")
        try { disk.writeMetadata(target,metadata) } catch (_: Exception) { /* recover() exposes the durable receiving journal. */ }
        return true
    }

    /** Also discovers interrupted pre-journal versions and failed final metadata writes. */
    private fun recover(directory: File): JSONObject {
        var metadata:JSONObject?=null
        for(name in listOf("metadata.json","metadata.tmp")) {
            try { metadata=AtomicFile(File(directory,name)).openRead().bufferedReader().use{JSONObject(it.readText())}; break }
            catch (_: Exception) { /* Try the old temporary format, then inventory originals. */ }
        }
        val result=metadata?:JSONObject().put("id",directory.name).put("text","")
            .put("createdAt",Instant.ofEpochMilli(directory.lastModified()).toString()).put("files",JSONArray())
        // Corrupt metadata must not hide the entire inbox or authorize an upload.
        result.put("id",directory.name)
        var malformed=false
        val recorded=result.optJSONArray("files")?:JSONArray().also{malformed=true}
        val files=JSONArray()
        for(i in 0 until recorded.length()) {
            val entry=recorded.optJSONObject(i)
            if(entry!=null&&uuid.matches(entry.optString("id")))files.put(entry)
            else malformed=true
        }
        result.put("files",files)
        val known=(0 until files.length()).map{files.getJSONObject(it).optString("id")}.toSet()
        directory.listFiles()?.filter{it.isFile&&uuid.matches(it.name)&&it.name !in known}?.forEach { original ->
            files.put(JSONObject().put("id",original.name).put("name","Återfunnet original")
                .put("mime","application/octet-stream").put("partialBytes",original.length())
                .put("error","Originalet återfanns utan fullständiga metadata. Behålls för återställning."))
        }
        var incomplete=metadata==null || malformed || result.optString("state")=="receiving"
        for(i in 0 until files.length()) {
            val entry=files.getJSONObject(i)
            if(entry.optString("state") in setOf("pending","copying")) {
                incomplete=true
                entry.put("partialBytes",File(directory,entry.getString("id")).length())
                    .put("error","Mottagningen avbröts innan filen kunde verifieras. Originaldelen behålls.")
            }
        }
        if(incomplete)result.put("recoveryRequired",true).put("importError","Mottagningen avbröts eller metadata kunde inte säkras. Sparade original behålls för återställning.")
        return result
    }
    @Synchronized fun list(): String {
        val items=JSONArray()
        root.listFiles()?.filter { it.isDirectory && uuid.matches(it.name) }?.forEach { items.put(recover(it)) }
        return items.toString()
    }
    @Synchronized fun read(id: String, fileId: String): String {
        if (!uuid.matches(id) || !uuid.matches(fileId)) return ""
        return try {
            val file=localFile(id,fileId)
            require(file.length()<=MAX_BRIDGE_BYTES) { "Stora filer ska läsas via den strömmande native-kön." }
            Base64.encodeToString(file.readBytes(),Base64.NO_WRAP)
        } catch (_: Exception) { "" }
    }
    @Synchronized fun remove(id: String): Boolean = uuid.matches(id) && File(root, id).deleteRecursively()
}
