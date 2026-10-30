package se.lobbamannen.nexushub.app

import android.content.Context
import android.net.Uri
import android.os.StatFs
import android.system.Os
import com.example.ai.runtime.GemmaStreamParser
import com.example.ai.runtime.LlamaNative
import com.example.ai.runtime.TokenCallback
import com.example.gemma.GemmaModelId
import com.example.gemma.GgufInspector
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/** The only local model engine in NexusHub. All heavyweight operations are serialized. */
class IntelligenceRuntime private constructor(private val app: Context) {
    companion object {
        @Volatile private var INSTANCE: IntelligenceRuntime? = null
        fun get(context: Context): IntelligenceRuntime =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: IntelligenceRuntime(context.applicationContext).also { INSTANCE = it }
            }
        private val mutex = Any()
        private const val FILENAME = "gemma-4-e2b-imported.gguf"
    }
    private val prefs = app.getSharedPreferences("nexus_intelligence_profile_v1",Context.MODE_PRIVATE)
    private val root = File(app.filesDir,"nexus-intelligence-model").apply { mkdirs() }
    private val model get() = File(root,FILENAME)
    @Volatile private var loadedSignature: String? = null
    @Volatile private var importing = false
    @Volatile private var processing = false
    @Volatile private var copied = 0L
    @Volatile private var total = -1L

    private fun defaults() = JSONObject()
        .put("backend","AUTO").put("threads",4).put("batchThreads",6)
        .put("contextSize",8192).put("batch",512).put("microbatch",256)
        .put("q8Kv",true).put("flashAttention",true).put("mlock",false)
        .put("gpuLayers",999).put("temperature",0.2).put("topP",0.95)
        .put("topK",64).put("minP",0.0).put("repeatPenalty",1.0)
        .put("seed",-1).put("maxOutputTokens",512).put("thinking",false)
        .put("audit",false).put("warmModel",true)

    private fun config(): JSONObject = JSONObject(prefs.getString("config",null) ?: defaults().toString())
    fun profile(): JSONObject = synchronized(mutex) { JSONObject(config().toString()) }

    fun saveProfile(input: JSONObject): JSONObject {
        check(!processing && !importing) { "Modellen arbetar. Vänta på säker gräns." }
        return synchronized(mutex) {
        check(!processing && !importing) { "Inställningar kan inte ändras medan modellen arbetar." }
        val current = defaults()
        require(input.keys().asSequence().all { current.has(it) }) { "Okänd inställning" }
        input.keys().forEach { key -> current.put(key,input.get(key)) }
        require(current.getString("backend") in setOf("AUTO","CPU","GPU_OPENCL","NPU_HEXAGON"))
        for((key,lo,hi) in listOf(
            Triple("threads",1,12),Triple("batchThreads",1,12),
            Triple("contextSize",1024,32768),Triple("batch",32,2048),
            Triple("microbatch",16,1024),Triple("gpuLayers",0,999),
            Triple("topK",1,256),Triple("maxOutputTokens",16,4096))) {
            val value = current.getInt(key)
            require(value in lo..hi) { "$key utanför tillåtet intervall" }
        }
        require(current.getInt("microbatch")<=current.getInt("batch"))
        require(current.getInt("maxOutputTokens")+16<current.getInt("contextSize"))
        for((key,lo,hi) in listOf(
            Triple("temperature",0.0,2.0),Triple("topP",0.01,1.0),
            Triple("minP",0.0,1.0),Triple("repeatPenalty",0.5,2.0))) {
            val v = current.getDouble(key)
            require(v.isFinite() && v>=lo && v<=hi) { "$key är ogiltig" }
        }
        for(key in listOf("q8Kv","flashAttention","mlock","thinking","audit","warmModel"))
            require(current.get(key) is Boolean) { "$key måste vara boolean" }
        prefs.edit().putString("config",current.toString()).commit().also { check(it) }
        // Reload required for engine-affecting parameters. Inactive engines are released safely.
        if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized()) LlamaNative.releaseEngine()
        loadedSignature = null
        JSONObject(current.toString())
        }
    }

    fun status(): JSONObject =
        JSONObject().put("nativeLoaded",LlamaNative.isLoaded)
            .put("importing",importing).put("processing",processing)
            .put("imported",model.isFile && model.length()>100L*1024*1024)
            .put("fileBytes",if(model.isFile)model.length() else 0L)
            .put("filename",prefs.getString("sourceName","") ?: "")
            .put("sha256",prefs.getString("sha256","") ?: "")
            .put("copyBytes",copied).put("copyTotal",total)
            .put("warm",loadedSignature!=null && LlamaNative.isLoaded && !processing)
            .put("config",config())
            .put("lastTelemetry",JSONObject(prefs.getString("telemetry","{}") ?: "{}"))

    /** Must run on a background thread. An interrupted import preserves the prior model. */
    fun import(uri: Uri): JSONObject {
        synchronized(mutex) { check(!processing && !importing); importing=true; copied=0L; total=-1L }
        var pending: File? = null
        try {
            synchronized(mutex) {
                if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized())LlamaNative.releaseEngine()
                loadedSignature=null
            }
            val cursor=app.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME,android.provider.OpenableColumns.SIZE),null,null,null)
            var name = ""
            cursor?.use { if(it.moveToFirst()) {
                name=it.getString(0) ?: ""
                if(!it.isNull(1))total=it.getLong(1)
            } }
            require(GemmaModelId.E2B.acceptsSourceFileName(name)) { "Välj Gemma 4 E2B GGUF (Q4_K_XL stöds)." }
            if(total>0)require(total>=100L*1024*1024) { "Modellfilen är för liten." }
            val free=StatFs(root.path).availableBytes
            require(free>(if(total>0)total else 3L*1024*1024*1024)+256L*1024*1024) {
                "Otillräckligt ledigt utrymme för modellimport."
            }
            pending=File(root,".import-${System.currentTimeMillis()}.tmp")
            val sha=MessageDigest.getInstance("SHA-256")
            app.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(pending!!).use { out ->
                    val buffer=ByteArray(256*1024)
                    while(true) {
                        if(Thread.currentThread().isInterrupted)throw InterruptedException("Import avbruten")
                        val n=input.read(buffer)
                        if(n<0)break
                        if(n==0)continue
                        out.write(buffer,0,n);sha.update(buffer,0,n);copied+=n
                        require(copied<=6L*1024*1024*1024) { "Modellen är större än tillåten import." }
                        require(total<0 || copied<=total) { "Filen är större än rapporterad storlek." }
                    }
                    out.fd.sync()
                }
            } ?: error("Filen kunde inte öppnas")
            require(total<0 || total==copied) { "Ofullständig import" }
            val digest=sha.digest().joinToString(""){"%02x".format(it)}
            val inventory=GgufInspector.inspect(pending!!,GemmaModelId.E2B,digest)
            Os.rename(pending!!.absolutePath,model.absolutePath)
            pending=null
            check(prefs.edit().putString("sha256",digest)
                .putString("sourceName",name).putString("qtypes",JSONObject(inventory.qtypes).toString()).commit())
            return status()
        } finally {
            pending?.delete()
            synchronized(mutex) { importing=false }
        }
    }

    fun delete(): JSONObject = synchronized(mutex) {
        check(!processing && !importing)
        if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized())LlamaNative.releaseEngine()
        loadedSignature=null
        check(!model.exists() || model.delete()) { "Modellfilen kunde inte tas bort" }
        prefs.edit().remove("sha256").remove("sourceName").remove("qtypes").commit()
        status()
    }

    /** Refuses silent fallback for explicit NPU tests. Native telemetry is mandatory. */
    fun infer(task: String, maxTokens: Int? = null): JSONObject = synchronized(mutex) {
        check(!processing && !importing) { "Gemma arbetar redan" }
        check(model.isFile && model.length()>100L*1024*1024) { "Importera Gemma 4 E2B först." }
        check(LlamaNative.isLoaded) { "Native llama.cpp saknas i APK:n" }
        require(task.length in 1..25000)
        processing=true
        try {
            val p=config()
            val signature=p.toString()+":"+prefs.getString("sha256","")
            if(loadedSignature!=signature || !LlamaNative.isEngineInitialized()) {
                if(LlamaNative.isEngineInitialized()) LlamaNative.releaseEngine()
                LlamaNative.resetStop()
                val nativeDir=app.applicationInfo.nativeLibraryDir
                LlamaNative.configureAcceleratorEnvironment(nativeDir)
                LlamaNative.setNativeLibraryDir(nativeDir)
                LlamaNative.configureHtpExecutionAudit(p.getBoolean("audit"),nativeDir)
                LlamaNative.resetHtpExecutionAudit(p.getBoolean("audit"))
                val backend=p.getString("backend")
                val gpu=if(backend=="CPU")0 else if(backend=="NPU_HEXAGON")0 else p.getInt("gpuLayers")
                val ok=LlamaNative.initEngineExt(model.absolutePath,p.getInt("contextSize"),
                    p.getInt("threads"),p.getInt("batchThreads"),false,p.getBoolean("q8Kv"),
                    p.getBoolean("flashAttention"),gpu,p.getInt("batch"),
                    p.getInt("microbatch"),p.getBoolean("mlock"),
                    backend=="NPU_HEXAGON" || backend=="AUTO",p.getBoolean("audit"))
                check(ok) { LlamaNative.getLastErrorMsg().ifBlank { "Kunde inte ladda modellen." } }
                loadedSignature=signature
            }
            LlamaNative.resetStop()
            LlamaNative.resetTurnTelemetry()
            val formatted=LlamaNative.applyChatTemplateExt(arrayOf("user"),arrayOf(task),
                true,p.getBoolean("thinking"))
                ?.takeIf { it.isNotBlank() } ?: error("Modellens chattemplate kunde inte användas.")
            val requested=maxTokens ?: p.getInt("maxOutputTokens")
            require(requested in 16..p.getInt("maxOutputTokens"))
            val promptTokens=LlamaNative.countTokens(formatted)
            require(promptTokens>0 && promptTokens+requested+16<=p.getInt("contextSize")) {
                "Prompt och reserverad utdata överskrider kontexten."
            }
            val parser=GemmaStreamParser({})
            LlamaNative.generateCompletionExt(formatted,TokenCallback { token->parser.feed(token) },
                requested,p.getDouble("temperature").toFloat(),p.getDouble("topP").toFloat(),
                p.getInt("topK"),p.getDouble("minP").toFloat(),
                p.getDouble("repeatPenalty").toFloat(),p.getLong("seed"))
            parser.flush()
            val telemetry=JSONObject(LlamaNative.getLatestTelemetryJson())
            val actual=telemetry.optString("backend_active")
            require(actual.isNotBlank()) { "Native runtime rapporterade ingen backend." }
            if(p.getString("backend")=="NPU_HEXAGON")require(actual.contains("HTP",true)||actual.contains("Hexagon",true)){
                "NPU-only misslyckades: aktiv backend är $actual."
            }
            val reason=telemetry.optString("finish_reason","unknown")
            check(reason !in setOf("error","cancelled","in_progress")) { "Generering avslutades inte normalt: $reason" }
            val result=JSONObject().put("text",parser.finalAnswer())
                .put("finishReason",reason).put("promptTokens",promptTokens)
                .put("backend",actual).put("requestedBackend",p.getString("backend"))
                .put("telemetry",telemetry).put("modelSha256",prefs.getString("sha256",""))
            prefs.edit().putString("telemetry",telemetry.toString()).apply()
            if(!p.getBoolean("warmModel")) { LlamaNative.releaseEngine(); loadedSignature=null }
            result
        } catch(e:Exception) {
            // Any failure invalidates the warm engine so the next invocation reloads safely.
            if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized())LlamaNative.releaseEngine()
            loadedSignature=null
            throw e
        } finally { processing=false }
    }

    fun cancel() {
        if(LlamaNative.isLoaded)LlamaNative.requestStop()
    }

    fun unload()=synchronized(mutex) {
        check(!processing && !importing)
        if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized())LlamaNative.releaseEngine()
        loadedSignature=null
    }
}
