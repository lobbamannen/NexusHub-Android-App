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
import org.json.JSONArray
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


    private fun config(): JSONObject =
        GemmaConfig.load(prefs.getString("config", null))
    fun profile(): JSONObject = synchronized(mutex) { JSONObject(config().toString()) }

    fun saveProfile(input: JSONObject): JSONObject {
        check(!processing && !importing) { "Modellen arbetar. Vänta på säker gräns." }
        return synchronized(mutex) {
            check(!processing && !importing) { "Inställningar kan inte ändras medan modellen arbetar." }
            val next = GemmaConfig.updateAndValidate(config(), input)
            val newEngineSignature = GemmaConfig.engineSignature(
                next, prefs.getString("sha256", "").orEmpty())
            check(prefs.edit().putString("config", next.toString()).commit()) {
                "Inställningarna kunde inte sparas."
            }
            // Only native initialization changes force a cold reload.
            // A disabled warm policy also unloads any currently active engine.
            if (loadedSignature != null &&
                (loadedSignature != newEngineSignature || !next.getBoolean("warmModel"))) {
                if (LlamaNative.isLoaded && LlamaNative.isEngineInitialized()) LlamaNative.releaseEngine()
                loadedSignature = null
            }
            JSONObject(next.toString())
        }
    }

    fun status(): JSONObject {
        val p = config()
        return JSONObject().put("nativeLoaded", LlamaNative.isLoaded)
            .put("importing", importing).put("processing", processing)
            .put("imported", model.isFile && model.length() > 100L * 1024 * 1024)
            .put("fileBytes", if (model.isFile) model.length() else 0L)
            .put("filename", prefs.getString("sourceName", "") ?: "")
            .put("sha256", prefs.getString("sha256", "") ?: "")
            .put("copyBytes", copied).put("copyTotal", total)
            .put("warm", loadedSignature != null && !processing &&
                loadedSignature == GemmaConfig.engineSignature(
                    p, prefs.getString("sha256", "").orEmpty()) &&
                LlamaNative.isLoaded && LlamaNative.isEngineInitialized())
            .put("config", p)
            .put("lastTelemetry", JSONObject(prefs.getString("telemetry", "{}") ?: "{}"))
    }

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

    fun infer(task:String,maxTokens:Int?=null):JSONObject =
        generate(JSONArray().put(JSONObject().put("role","user").put("content",task)),maxTokens)
    fun chat(messages:JSONArray):JSONObject = generate(messages,null)

    /** Strict multi-turn conversation with the same global model profile. */
    private fun generate(messages:JSONArray,maxTokens:Int?):JSONObject = synchronized(mutex) {
        require(messages.length() in 1..13) { "För lång chatthistorik." }
        val roles=ArrayList<String>()
        val contents=ArrayList<String>()
        var totalChars=0
        for(i in 0 until messages.length()) {
            val item=messages.getJSONObject(i)
            require(item.length()==2 && item.has("role") && item.has("content")) { "Ogiltigt chattmeddelande." }
            val role=item.getString("role")
            require(role==(if(i%2==0)"user" else "assistant")) { "Fel turordning i chatten." }
            val body=item.getString("content").trim()
            require(body.isNotEmpty() && body.length<=12000) { "Meddelandet är för långt eller tomt." }
            roles.add(role);contents.add(body);totalChars+=body.length
        }
        require(roles.last()=="user" && totalChars<=30000) { "Chattunderlaget är för stort." }
        check(!processing && !importing) { "Gemma arbetar redan" }
        check(model.isFile && model.length()>100L*1024*1024) { "Importera Gemma 4 E2B först." }
        check(LlamaNative.isLoaded) { "Native llama.cpp saknas i APK:n" }
        processing=true
        try {
            val p=config()
            val signature=GemmaConfig.engineSignature(p,prefs.getString("sha256","").orEmpty())
            val warmAtStart=loadedSignature==signature && LlamaNative.isEngineInitialized()
            val loadStart=android.os.SystemClock.elapsedRealtime()
            if(!warmAtStart) {
                val importedHash=prefs.getString("sha256","").orEmpty()
                require(Regex("[a-f0-9]{64}").matches(importedHash)) { "Importen saknar giltig SHA-256-identitet." }
                check(GgufInspector.sha256(model)==importedHash) { "Modellens bytes avviker från verifierad import. Importera igen." }
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
                val initialized=JSONObject(LlamaNative.getLatestTelemetryJson())
                val appliedContext=initialized.optInt("active_ctx_size",-1)
                check(appliedContext==p.getInt("contextSize")) {
                    "Begärd kontext ${p.getInt("contextSize")} men runtime rapporterade ${appliedContext}. Ingen tyst nedskalning tillåts."
                }
                loadedSignature=signature
            }
            val loadThisTurnMs=if(warmAtStart) 0L else android.os.SystemClock.elapsedRealtime()-loadStart
            // An explicitly selected accelerator is a strict precondition.
            // Verify freshly loaded and warm engines before generating any token.
            val selected=p.getString("backend")
            fun verifyBackend(telemetry:JSONObject) {
                val actual=telemetry.optString("backend_active")
                val fallback=telemetry.optBoolean("fallback_occurred",false)
                val offloaded=telemetry.optInt("actual_gpu_layers",-1)
                if(selected=="NPU_HEXAGON")require(!fallback && offloaded>0 &&
                    (actual.contains("HTP",true)||actual.contains("Hexagon",true))) {
                    "NPU-only nekades: aktiv=$actual, offload=$offloaded, fallback="+
                        telemetry.optString("fallback_reason","okänd orsak")
                }
                if(selected=="GPU_OPENCL")require(!fallback && offloaded>0 &&
                    actual.contains("OpenCL",true)) {
                    "GPU-only nekades: aktiv=$actual, offload=$offloaded, fallback="+
                        telemetry.optString("fallback_reason","okänd orsak")
                }
            }
            verifyBackend(JSONObject(LlamaNative.getLatestTelemetryJson()))
            LlamaNative.resetStop()
            LlamaNative.resetTurnTelemetry()
            // Independent audit for every turn, including warm-engine inferencing.
            LlamaNative.resetHtpExecutionAudit(p.getBoolean("audit"))
            val formatted=LlamaNative.applyChatTemplateExt(roles.toTypedArray(),contents.toTypedArray(),
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
            val fallback=telemetry.optBoolean("fallback_occurred",false)
            val offloaded=telemetry.optInt("actual_gpu_layers",-1)
            // Preserve the post-generation gate for a backend lost mid-turn.
            verifyBackend(telemetry)
            val reason=telemetry.optString("finish_reason","unknown")
            check(reason !in setOf("error","cancelled","in_progress")) { "Generering avslutades inte normalt: $reason" }
            val result=JSONObject().put("text",parser.finalAnswer())
                .put("finishReason",reason).put("promptTokens",promptTokens)
                .put("backend",actual).put("requestedBackend",p.getString("backend"))
                .put("fallbackOccurred",fallback)
                .put("fallbackReason",telemetry.optString("fallback_reason",""))
                .put("offloadedLayers",offloaded)
                .put("npuExecutionVerified",false)
                .put("telemetry",normalTelemetry(telemetry).apply {
                    put("sessionStartState",if(warmAtStart)"WARM" else "COLD")
                    put("modelLoadThisRequestMs",loadThisTurnMs)
                }).put("modelSha256",prefs.getString("sha256",""))
            if(p.getBoolean("audit") && selected in setOf("AUTO","NPU_HEXAGON")) {
                try {
                    val raw=LlamaNative.getHtpExecutionAuditJson(actual,
                        telemetry.optInt("requested_gpu_layers",0),offloaded,
                        telemetry.optInt("total_offloadable_layers",0),
                        telemetry.optInt("output_tokens",0),reason)
                    if(raw.length<=262144)result.put("htpExecutionAudit",JSONObject(raw))
                    else result.put("auditError","Audit överskrider 256 KiB. Exportera separat.")
                } catch(e:Exception) {
                    result.put("auditError",e.message?.take(180) ?: "Audit kunde inte läsas")
                }
            }
            prefs.edit().putString("telemetry",result.getJSONObject("telemetry").toString()).apply()
            if(!p.getBoolean("warmModel")) { LlamaNative.releaseEngine(); loadedSignature=null }
            result
        } catch(e:Exception) {
            // Any failure invalidates the warm engine so the next invocation reloads safely.
            if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized())LlamaNative.releaseEngine()
            loadedSignature=null
            throw e
        } finally { processing=false }
    }

    /** Jarvis-style summary; deep HTP audit and raw token/node lists stay internal. */
    private fun normalTelemetry(raw:JSONObject):JSONObject {
        val keys=listOf("llama_commit","backend_requested","backend_active","device_active",
            "backend_evidence","requested_gpu_layers","actual_gpu_layers","total_offloadable_layers",
            "fallback_occurred","fallback_reason","opencl_load_error","hexagon_load_error",
            "active_ctx_size","active_threads","active_batch_threads","model_load_time_ms",
            "prefill_time_ms","decode_time_ms","ttft_ms","total_time_ms","prompt_tokens",
            "output_tokens","prefill_evaluated_tokens","decode_evaluated_tokens",
            "prefill_tok_per_sec","decode_tok_per_sec","total_tok_per_sec","finish_reason",
            "error","sampler_temperature","sampler_top_p","sampler_top_k","sampler_min_p",
            "sampler_repeat_penalty","sampler_seed","sampler_mode")
        val result=JSONObject()
        for(key in keys)if(raw.has(key))result.put(key,raw.get(key))
        return result
    }

    fun cancel() {
        if(LlamaNative.isLoaded)LlamaNative.requestStop()
    }

    /**
     * Recheck the lifecycle predicate UNDER the same lock as native release.
     * A foreground transition during an in-flight generation must not
     * accidentally unload a model after the user has returned.
     */
    fun unloadIfIdle(allowed: () -> Boolean): Boolean = synchronized(mutex) {
        if (processing || importing || !allowed()) return@synchronized false
        if (LlamaNative.isLoaded && LlamaNative.isEngineInitialized()) LlamaNative.releaseEngine()
        loadedSignature = null
        true
    }

    fun unload()=synchronized(mutex) {
        check(!processing && !importing)
        if(LlamaNative.isLoaded && LlamaNative.isEngineInitialized())LlamaNative.releaseEngine()
        loadedSignature=null
    }
}
