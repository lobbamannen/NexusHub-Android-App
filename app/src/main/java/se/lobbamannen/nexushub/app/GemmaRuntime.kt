package se.lobbamannen.nexushub.app

import android.content.ComponentCallbacks2
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Application-wide Gemma lifecycle and entry point, inspired by Jarvis/Cortex.
 * Does not start document analysis, enqueue AI work or preload the model.
 * Existing llama.cpp + Hexagon code stays in the already phone-verified engine.
 */
class GemmaRuntime private constructor(context: Context) {
    private val native = IntelligenceRuntime.get(context.applicationContext)
    private val handler = Handler(Looper.getMainLooper())
    private val releaseExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var inBackground = false
    @Volatile private var graceExpired = false
    @Volatile private var memoryPressure = false

    private val releaseAfterGrace = Runnable {
        if (inBackground) {
            graceExpired = true
            scheduleIdleRelease()
        }
    }

    companion object {
        @Volatile private var instance: GemmaRuntime? = null
        fun get(context: Context): GemmaRuntime =
            instance ?: synchronized(this) {
                instance ?: GemmaRuntime(context.applicationContext).also { instance = it }
            }
    }

    fun onForeground() {
        inBackground = false
        graceExpired = false
        handler.removeCallbacks(releaseAfterGrace)
    }

    /** Reuse a warm model for up to 30 s if Android backgrounds the app. */
    fun onBackground() {
        inBackground = true
        graceExpired = false
        handler.removeCallbacks(releaseAfterGrace)
        handler.postDelayed(releaseAfterGrace, GemmaConfig.BACKGROUND_GRACE_MS)
    }

    /**
     * UI_HIDDEN (20) is not a low-memory signal; don't bypass background grace.
     * A running generation completes before the serialized release is attempted.
     */
    fun onTrimMemory(level: Int) {
        val isPressure =
            level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW ||
            level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL ||
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND
        if (!isPressure) return
        memoryPressure = true
        scheduleIdleRelease()
    }

    private fun scheduleIdleRelease() {
        releaseExecutor.execute {
            if (memoryPressure || (inBackground && graceExpired)) {
                try {
                    native.unload() // synchronized with generation/import, never interrupts a turn
                    memoryPressure = false
                } catch (_: IllegalStateException) {
                    // Import is in progress: defer until a later lifecycle event.
                }
            }
        }
    }

    fun status(): JSONObject = native.status()
        .put("appBackgrounded", inBackground)
        .put("backgroundGraceExpired", graceExpired)

    fun saveProfile(changes: JSONObject): JSONObject = native.saveProfile(changes)
    fun importModel(uri: Uri): JSONObject = native.import(uri)
    fun deleteModel(): JSONObject = native.delete()
    fun unload(): Unit = native.unload()
    fun cancel(): Unit = native.cancel()
    fun chat(messages: JSONArray): JSONObject = native.chat(messages)
    /** Explicit future caller API; no automatic ideas/document trigger is installed. */
    fun runExplicitTask(prompt: String, maxTokens: Int? = null): JSONObject =
        native.infer(prompt, maxTokens)
}
