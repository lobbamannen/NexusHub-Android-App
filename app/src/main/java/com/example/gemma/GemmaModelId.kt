package com.example.gemma

/**
 * Explicit local-model identities. Keep E2B and E4B separate, but allow the supported
 * target quant variants for each model.
 *
 * storageFileName is the stable app-private slot filename. canonicalFileName is kept as the
 * UI-facing compatibility property and resolves to the actual imported source filename when
 * known, so Q2/Q4/Q6 labels always follow the model currently installed in that slot.
 */
enum class GemmaModelId(
    val stableId: String,
    val displayName: String,
    val telemetryName: String,
    val storageFileName: String,
    val acceptedSourceFileNames: Set<String>,
    val conversationId: String,
    val conversationTitle: String
) {
    E2B(
        stableId = "gemma_4_e2b",
        displayName = "Gemma 4 E2B",
        telemetryName = "gemma-4-e2b-it-local",
        storageFileName = "gemma-4-E2B-it-qat-UD-Q2_K_XL.gguf",
        acceptedSourceFileNames = setOf(
            "gemma-4-E2B-it-qat-UD-Q2_K_XL.gguf",
            "gemma-4-E2B-it-qat-UD-Q4_K_XL.gguf",
            "gemma-4-E2B-it-Q6_K.gguf",
            "gemma-4-E2B-it-UD-Q6_K_XL.gguf"
        ),
        conversationId = "gemma_lab_e2b",
        conversationTitle = "Gemma 4 E2B Lab"
    ),
    E4B(
        stableId = "gemma_4_e4b",
        displayName = "Gemma 4 E4B",
        telemetryName = "gemma-4-e4b-it-local",
        storageFileName = "gemma-4-E4B-it-qat-UD-Q2_K_XL.gguf",
        acceptedSourceFileNames = setOf(
            "gemma-4-E4B-it-qat-UD-Q2_K_XL.gguf",
            "gemma-4-E4B-it-qat-UD-Q4_K_XL.gguf"
        ),
        conversationId = "gemma_lab_e4b",
        conversationTitle = "Gemma 4 E4B Lab"
    );

    val canonicalFileName: String
        get() = activeSourceFileNames[this] ?: storageFileName

    fun acceptsSourceFileName(fileName: String?): Boolean {
        val candidate = fileName?.trim().orEmpty()
        return candidate.isNotEmpty() && acceptedSourceFileNames.any { it.equals(candidate, ignoreCase = true) }
    }

    internal fun setActiveSourceFileName(fileName: String?) {
        val normalized = fileName?.trim()?.takeIf { acceptsSourceFileName(it) }
        if (normalized == null) activeSourceFileNames.remove(this) else activeSourceFileNames[this] = normalized
    }

    companion object {
        private val activeSourceFileNames = java.util.concurrent.ConcurrentHashMap<GemmaModelId, String>()

        fun fromConversationId(conversationId: String?): GemmaModelId? =
            entries.firstOrNull { it.conversationId == conversationId }

        fun isLabConversation(conversationId: String?): Boolean =
            fromConversationId(conversationId) != null
    }
}
