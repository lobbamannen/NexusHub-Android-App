package com.example.gemma

/** Budget the fully rendered prompt with the loaded model's tokenizer, preserving whole turns. */
object GemmaPromptBudget {
    data class Fitted<T>(val history: List<T>, val prompt: String, val tokens: Int)

    fun <T> fit(
        history: List<T>, isUser: (T) -> Boolean, contextSize: Int, reservedOutput: Int,
        render: (List<T>) -> String, count: (String) -> Int
    ): Fitted<T> {
        val retained = history.toMutableList()
        while (retained.isNotEmpty() && !isUser(retained.first())) retained.removeAt(0)
        while (true) {
            val prompt = render(retained)
            val tokens = count(prompt)
            require(tokens >= 0) { "Could not measure Gemma prompt tokens" }
            if (tokens.toLong() + reservedOutput + 16 <= contextSize) return Fitted(retained.toList(), prompt, tokens)
            require(retained.isNotEmpty()) {
                "Current message and system prompt require $tokens tokens, plus $reservedOutput output tokens; context is $contextSize. Shorten the message or increase context."
            }
            retained.removeAt(0)
            while (retained.isNotEmpty() && !isUser(retained.first())) retained.removeAt(0)
        }
    }
}
