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
import java.security.MessageDigest

/** Original streams are copied into private persistent storage while their grants are valid. */
class IncomingShareStore(private val context: Context) {
    private val root = File(context.filesDir, "incoming-v1").apply { mkdirs() }
    companion object {
        private const val MAX_FILE_BYTES = 64L * 1024 * 1024
        private const val MAX_PACKAGE_BYTES = 128L * 1024 * 1024
    }
    @Synchronized fun encodedSize(id:String,fileId:String):Long {
        require(uuid.matches(id) && uuid.matches(fileId))
        val file=File(File(root,id),fileId)
        require(file.isFile) { "Delad originalfil saknas." }
        return file.length()
    }
    @Synchronized fun markImportError(id:String,message:String) {
        require(uuid.matches(id))
        val target=File(File(root,id),"metadata.json")
        val metadata=JSONObject(target.readText())
        metadata.put("importError",message.take(300))
        val atomic=AtomicFile(target)
        val output=atomic.startWrite()
        try { output.write(metadata.toString().toByteArray(Charsets.UTF_8));atomic.finishWrite(output) }
        catch(e:Exception) {atomic.failWrite(output);throw e}
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
        val files = JSONArray()
        var packageBytes=0L
        for (uri in uris) {
            val fileId = UUID.randomUUID().toString()
            val entry = JSONObject().put("id", fileId)
            try {
                require(uri.scheme == "content") { "Endast delade content-filer stöds." }
                var name = "dokument"
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
                }
                entry.put("name", name.take(180)).put("mime", context.contentResolver.getType(uri) ?: "application/octet-stream")
                context.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(File(directory, fileId)).use { output ->
                        val limit=minOf(MAX_FILE_BYTES,MAX_PACKAGE_BYTES-packageBytes)
                        require(limit>0) { "Paketet överskrider lagringsgränsen på 128 MiB." }
                        val buffer=ByteArray(64*1024)
                        var copied=0L
                        while(true) {
                            val n=input.read(buffer)
                            if(n<0)break
                            if(n==0)continue
                            copied+=n
                            require(copied<=limit) { "Filen eller delningspaketet är för stort. Max 64 MiB per fil." }
                            output.write(buffer,0,n)
                        }
                        output.fd.sync()
                        packageBytes+=copied
                    }
                } ?: error("Den delade filen kunde inte öppnas.")
                val saved = File(directory, fileId)
                val digest = MessageDigest.getInstance("SHA-1")
                digest.update("blob ${saved.length()}\u0000".toByteArray(Charsets.UTF_8))
                saved.inputStream().use { input -> val buffer = ByteArray(65536); var count = input.read(buffer); while (count >= 0) { if (count > 0) digest.update(buffer, 0, count); count = input.read(buffer) } }
                entry.put("sha", digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
            } catch (error: Exception) {
                File(directory, fileId).delete()
                entry.put("name", entry.optString("name", "dokument")).put("mime", "application/octet-stream").put("error", error.message ?: "Filen kunde inte sparas lokalt.")
            }
            files.put(entry)
        }
        if (text.isBlank() && files.length() == 0) { directory.deleteRecursively(); return false }
        val metadata = JSONObject().put("id", id).put("text", text).put("createdAt", Instant.now().toString()).put("files", files)
        val temporary = File(directory, "metadata.tmp")
        FileOutputStream(temporary).use { output -> output.write(metadata.toString().toByteArray(Charsets.UTF_8)); output.fd.sync() }
        check(temporary.renameTo(File(directory, "metadata.json"))) { "Mottagningen kunde inte säkras lokalt." }
        return true
    }
    @Synchronized fun list(): String {
        val items = JSONArray()
        root.listFiles()?.filter { uuid.matches(it.name) }?.forEach { directory ->
            val file = File(directory, "metadata.json")
            if (file.exists()) try { items.put(JSONObject(file.readText())) } catch (_: Exception) { /* Do not discard an unreadable original. */ }
        }
        return items.toString()
    }
    @Synchronized fun read(id: String, fileId: String): String {
        if (!uuid.matches(id) || !uuid.matches(fileId)) return ""
        return try { Base64.encodeToString(File(File(root, id), fileId).readBytes(), Base64.NO_WRAP) } catch (_: Exception) { "" }
    }
    @Synchronized fun remove(id: String): Boolean = uuid.matches(id) && File(root, id).deleteRecursively()
}
