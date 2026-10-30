package se.lobbamannen.nexushub.app

import org.json.JSONObject

/**
 * Single Gemma 4 E2B profile: existing on-device settings always take priority.
 * Defaults reflect the NPU configuration confirmed on the Galaxy S26 Ultra.
 */
internal object GemmaConfig {
    const val BACKGROUND_GRACE_MS = 30_000L
    private val engineKeys = listOf(
        "backend", "threads", "batchThreads", "contextSize", "batch",
        "microbatch", "q8Kv", "flashAttention", "mlock", "gpuLayers", "audit"
    )
    fun defaults(): JSONObject = JSONObject()
        .put("backend", "NPU_HEXAGON").put("threads", 4).put("batchThreads", 6)
        .put("contextSize", 32768).put("batch", 512).put("microbatch", 256)
        .put("q8Kv", false).put("flashAttention", false).put("mlock", true)
        .put("gpuLayers", 999).put("temperature", 0.2).put("topP", 0.95)
        .put("topK", 64).put("minP", 0.0).put("repeatPenalty", 1.0)
        .put("seed", -1).put("maxOutputTokens", 2000)
        .put("thinking", false).put("audit", false).put("warmModel", true)

    fun load(savedJson: String?): JSONObject {
        val current = defaults()
        if (!savedJson.isNullOrBlank()) {
            val saved = JSONObject(savedJson)
            val keys = saved.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                if (current.has(key)) current.put(key, saved.get(key))
            }
        }
        return current
    }

    fun updateAndValidate(previous: JSONObject, changes: JSONObject): JSONObject {
        val current = JSONObject(previous.toString())
        require(changes.keys().asSequence().all { current.has(it) }) { "Okänd inställning" }
        val keys = changes.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            current.put(key, changes.get(key))
        }
        require(current.getString("backend") in setOf("AUTO", "CPU", "GPU_OPENCL", "NPU_HEXAGON"))
        for ((key, lo, hi) in listOf(
            Triple("threads", 1, 12), Triple("batchThreads", 1, 12),
            Triple("contextSize", 1024, 65536), Triple("batch", 64, 2048),
            Triple("microbatch", 32, 1024), Triple("gpuLayers", 0, 999),
            Triple("topK", 1, 256), Triple("maxOutputTokens", 16, 4096)
        )) {
            val value = current.getInt(key)
            require(value in lo..hi) { "$key utanför tillåtet intervall" }
        }
        require(current.getInt("microbatch") <= current.getInt("batch"))
        require(current.getInt("maxOutputTokens") + 16 < current.getInt("contextSize"))
        for ((key, lo, hi) in listOf(
            Triple("temperature", 0.0, 2.0), Triple("topP", 0.01, 1.0),
            Triple("minP", 0.0, 1.0), Triple("repeatPenalty", 1.0, 2.0)
        )) {
            val value = current.getDouble(key)
            require(value.isFinite() && value >= lo && value <= hi) { "$key är ogiltig" }
        }
        for (key in listOf("q8Kv", "flashAttention", "mlock", "thinking", "audit", "warmModel"))
            require(current.get(key) is Boolean) { "$key måste vara boolean" }
        return current
    }

    /** Sampler/output changes never invalidate the native warm engine. */
    fun engineSignature(profile: JSONObject, modelSha256: String): String = buildString {
        append(modelSha256)
        for (key in engineKeys) append('|').append(key).append('=').append(profile.get(key))
    }
}
