package se.lobbamannen.nexushub.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** A single common client for chat and future explicitly enabled features. */
class GemmaClient private constructor(context: Context) {
    private val runtime = GemmaRuntime.get(context)
    companion object {
        @Volatile private var instance: GemmaClient? = null
        fun get(context: Context): GemmaClient =
            instance ?: synchronized(this) {
                instance ?: GemmaClient(context.applicationContext).also { instance = it }
            }
    }
    fun chat(messages: JSONArray): JSONObject = runtime.chat(messages)
    fun runExplicitTask(prompt: String, maxTokens: Int? = null): JSONObject =
        runtime.runExplicitTask(prompt, maxTokens)
}
