package com.example.ai.runtime

import android.util.Log

fun interface TokenCallback {
    fun onToken(token: String)
}

/** Single native llama.cpp engine shared by every Jarvis Gemma model. */
object LlamaNative {
    private const val TAG = "JarvisLlamaNative"
    @Volatile var isLoaded: Boolean = false
        private set

    init {
        val dependencies = listOf("ggml-base", "ggml-cpu", "ggml", "llama")
        dependencies.forEach { lib ->
            try { System.loadLibrary(lib); Log.i(TAG, "Pre-loaded lib$lib.so") }
            catch (t: Throwable) { Log.w(TAG, "Dependency pre-load failed: $lib", t) }
        }
        try { System.loadLibrary("llama_android"); isLoaded = true; Log.i(TAG, "libllama_android.so loaded") }
        catch (t: Throwable) { isLoaded = false; Log.e(TAG, "Could not load libllama_android.so: ${t.localizedMessage}", t) }
    }

    external fun configureAcceleratorEnvironment(dir: String)
    external fun getAcceleratorBootstrapDiagnosticsJson(): String
    external fun setNativeLibraryDir(dir: String)
    external fun requestStop()
    external fun resetStop()
    external fun resetTurnTelemetry()
    external fun countTokens(prompt: String): Int
    external fun configureHtpExecutionAudit(enabled: Boolean, nativeLibraryDir: String)
    external fun resetHtpExecutionAudit(enabled: Boolean)
    external fun getHtpExecutionAuditJson(activeBackend: String, requestedLayers: Int, assignedLayers: Int, totalLayers: Int, outputTokens: Int, finishReason: String): String
    external fun getOpenClExecutionAuditJson(): String
    external fun getCpuExecutionAuditJson(): String
    external fun installNativeCrashHandler(path: String)

    external fun initEngineExt(modelPath: String, contextSize: Int, threads: Int, threadsBatch: Int, unusedAffinity: Boolean = false, useQ80Kv: Boolean, flashAttention: Boolean, gpuLayers: Int, nBatch: Int = 512, nUbatch: Int = 128, useMlock: Boolean = false, useNpu: Boolean = false, auditBackend: Boolean = false): Boolean
    external fun generateCompletionExt(prompt: String, callback: TokenCallback?, maxGenTokens: Int = 512, temperature: Float = 1.0f, topP: Float = 0.95f, topK: Int = 64, minP: Float = 0f, repeatPenalty: Float = 1f, seed: Long = -1L): String
    external fun releaseEngine()
    external fun isEngineInitialized(): Boolean
    external fun getLastErrorMsg(): String
    external fun getLatestTelemetryJson(): String
    external fun getModelMetadataJson(): String
    external fun supportsThinking(): Boolean
    external fun getCurrentProcessMemoryJson(): String
    external fun applyChatTemplateExt(roles: Array<String>, contents: Array<String>, addAss: Boolean, enableThinking: Boolean): String?
}
