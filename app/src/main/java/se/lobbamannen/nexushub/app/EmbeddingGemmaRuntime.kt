package se.lobbamannen.nexushub.app

import android.content.Context
import android.net.Uri
import android.os.StatFs
import android.system.Os
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.EmbeddingEngine
import com.google.ai.edge.litertlm.EmbeddingEngineConfig
import com.google.ai.edge.litertlm.InputData
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * Separate, lazy EmbeddingGemma 2 runtime. All calls are made by the single
 * native bridge worker; the generative Gemma runtime is unloaded first.
 * Only the derivable vectors leave this class, never original document bytes.
 */
class EmbeddingGemmaRuntime private constructor(private val context: Context) {
    companion object {
        @Volatile private var instance: EmbeddingGemmaRuntime? = null
        fun get(context: Context): EmbeddingGemmaRuntime =
            instance ?: synchronized(this) {
                instance ?: EmbeddingGemmaRuntime(context.applicationContext).also { instance = it }
            }
        const val PROFILE_VERSION = "eg2-text-270m-litertlm-0181-prompt-v1-256d-l2"
    }

    private val lock = Any()
    private val prefs = context.getSharedPreferences("nexus_embedding_gemma2_v1", Context.MODE_PRIVATE)
    private val dir = File(context.filesDir, "embedding-gemma2").apply { mkdirs() }
    private val file get() = File(dir, "embeddinggemma2.litertlm")
    @Volatile private var importing = false
    @Volatile private var processing = false
    @Volatile private var progress = 0L
    // Private model is atomically replaced during import. Hash once per unchanged
    // file identity rather than reading ~165 MB before every embedding batch.
    // Never cache failures, and invalidate on model replacement.
    private data class VerifiedFile(val inode: Long, val size: Long, val modifiedMs: Long, val digest: String)
    private var verifiedFile: VerifiedFile? = null

    private fun verifiedModelHash(expected: String): String {
        require(Regex("[0-9a-f]{64}").matches(expected)) {
            "Ingen verifierad modell-SHA finns registrerad."
        }
        val stat = Os.stat(file.absolutePath)
        val modified = file.lastModified()
        val cached = verifiedFile
        if (cached != null &&
            cached.inode == stat.st_ino &&
            cached.size == stat.st_size &&
            cached.modifiedMs == modified &&
            cached.digest == expected
        ) return expected
        val actual = sha256(file)
        require(actual == expected) { "Modellens SHA-256 matchar inte verifierad import." }
        val checked = Os.stat(file.absolutePath)
        require(stat.st_ino == checked.st_ino && stat.st_size == checked.st_size &&
            modified == file.lastModified()) {
            "Modellfilen ändrades under verifiering."
        }
        verifiedFile = VerifiedFile(stat.st_ino,stat.st_size,modified,actual)
        return actual
    }

    fun status(): JSONObject = JSONObject()
        .put("installed", file.isFile && file.length() > 50L * 1024 * 1024)
        .put("importing", importing)
        .put("processing", processing)
        .put("copiedBytes", progress)
        .put("bytes", if (file.exists()) file.length() else 0)
        .put("modelSha256", prefs.getString("sha256", "") ?: "")
        .put("sourceName", prefs.getString("name", "") ?: "")
        .put("profileVersion", PROFILE_VERSION)
        .put("dimensions", 256)
        .put("backend", "CPU")

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered().use { input ->
            val block = ByteArray(128 * 1024)
            while (true) {
                val n = input.read(block)
                if (n < 0) break
                if (n > 0) digest.update(block, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun engine(path: String): EmbeddingEngine =
        EmbeddingEngine(EmbeddingEngineConfig(modelPath = path, backend = Backend.CPU()))

    private fun embedding(engine: EmbeddingEngine, input: String): FloatArray {
        val raw = engine.computeEmbedding(listOf(InputData.Text(input))).embedding
        check(raw.size == 768) { "Fel embeddingdimension: ${raw.size}" }
        val first = FloatArray(256) { raw[it].toFloat() }
        var norm = 0.0
        for (v in first) {
            check(v.isFinite()) { "Ogiltig embedding" }
            norm += v.toDouble() * v.toDouble()
        }
        check(norm > 1e-12 && norm.isFinite()) { "Nollvektor" }
        val scale = kotlin.math.sqrt(norm).toFloat()
        for (i in first.indices) first[i] /= scale
        return first
    }

    /** SAF import is verified by real document AND query inference before promotion. */
    fun importModel(uri: Uri): JSONObject = synchronized(lock) {
        check(!processing && !importing) { "Modellmotorn arbetar redan." }
        importing = true
        progress = 0L
        val pending = File(dir, ".pending-${System.nanoTime()}.litertlm")
        try {
            val name = context.contentResolver.query(
                uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null
            )?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "embeddinggemma2.litertlm"
            require(name.endsWith(".litertlm", true)) { "Välj EmbeddingGemma 2 text 270M i .litertlm-format." }
            check(StatFs(dir.absolutePath).availableBytes > 350L * 1024 * 1024) { "Otillräckligt ledigt utrymme." }
            context.contentResolver.openInputStream(uri)?.use { source ->
                FileOutputStream(pending).use { output ->
                    val block = ByteArray(128 * 1024)
                    while (true) {
                        val n = source.read(block)
                        if (n < 0) break
                        if (n > 0) {
                            output.write(block, 0, n)
                            progress += n
                            check(progress <= 500L * 1024 * 1024) { "Modellfilen är för stor." }
                        }
                    }
                    output.fd.sync()
                }
            } ?: error("Kan inte läsa vald modell.")
            check(progress >= 50L * 1024 * 1024) { "Ofullständig modellfil." }
            val digest = sha256(pending)
            engine(pending.absolutePath).use { test ->
                test.initialize()
                check(embedding(test, "task: search result | query: programmering").size == 256)
                check(embedding(test, "title: test | text: En teknisk rapport om programmering.").size == 256)
            }
            // The current verified model is not modified until the new one is runnable.
            verifiedFile = null
            Os.rename(pending.absolutePath, file.absolutePath)
            check(prefs.edit().putString("sha256", digest).putString("name", name).commit())
            status()
        } finally {
            pending.delete()
            importing = false
        }
    }

    /** Each request is bounded and immediately releases memory before Gemma 4 runs. */
    fun embed(payload: JSONObject): JSONObject = synchronized(lock) {
        check(!importing && !processing) { "EmbeddingGemma arbetar redan." }
        check(file.isFile && file.length() > 50L * 1024 * 1024) { "Importera EmbeddingGemma 2 först." }
        val hash = prefs.getString("sha256", "") ?: ""
        verifiedModelHash(hash)
        val items = payload.getJSONArray("items")
        require(items.length() in 1..8) { "Högst åtta textfönster per anrop." }
        processing = true
        try {
            val started = android.os.SystemClock.elapsedRealtime()
            val vectors = JSONArray()
            engine(file.absolutePath).use { e ->
                e.initialize()
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    val id = item.getString("id")
                    val text = item.getString("text").trim()
                    val task = item.getString("task")
                    require(id.length in 1..1024 && text.length in 1..3500 && task in listOf("query", "document")) {
                        "Felaktig eller för lång embeddingindata."
                    }
                    val formatted = if (task == "query") {
                        "task: search result | query: $text"
                    } else {
                        val title = item.optString("title", "none").replace('|', ' ').replace('\n', ' ').take(120).ifBlank { "none" }
                        "title: $title | text: $text"
                    }
                    val startedItem = android.os.SystemClock.elapsedRealtime()
                    val values = embedding(e, formatted)
                    val floats = JSONArray()
                    values.forEach { floats.put(it.toDouble()) }
                    vectors.put(JSONObject().put("id", id).put("values", floats)
                        .put("durationMs", android.os.SystemClock.elapsedRealtime() - startedItem))
                }
            }
            JSONObject().put("vectors", vectors)
                .put("modelSha256", hash)
                .put("profileVersion", PROFILE_VERSION)
                .put("totalMs", android.os.SystemClock.elapsedRealtime() - started)
        } finally {
            processing = false
        }
    }
}
