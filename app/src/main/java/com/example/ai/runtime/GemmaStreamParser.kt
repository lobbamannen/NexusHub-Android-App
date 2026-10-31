package com.example.ai.runtime

/**
 * Stateful streaming parser for Gemma 4 output.
 *
 * The local GGUF may emit internal reasoning/channel markers even when thinking is normally
 * disabled. Those markers may be split across native token callbacks, so filtering each callback
 * independently is not sufficient. This parser keeps cross-callback state and exposes only the
 * user-facing answer through [onAnswerDelta].
 *
 * Visible text discovered during one [feed] call is emitted as one delta. This preserves useful
 * native callback/chunk granularity instead of turning telemetry and Compose updates into one
 * callback per character.
 */
class GemmaStreamParser(
    private val onAnswerDelta: (String) -> Unit,
    private val onReasoningDelta: ((String) -> Unit)? = null
) {
    private var inReasoning = false
    private val tagBuffer = StringBuilder()
    private val reasoningBuilder = StringBuilder()
    private val answerBuilder = StringBuilder()

    private val reasoningStartTags = listOf(
        "<|channel>thought",
        "<think>",
        "<thought>"
    )
    private val reasoningEndTags = listOf(
        "<channel|>",
        "</think>",
        "</thought>"
    )

    @Synchronized
    fun feed(chunk: String) {
        if (chunk.isEmpty()) return

        val answerDelta = StringBuilder()
        val reasoningDelta = StringBuilder()

        for (ch in chunk) {
            tagBuffer.append(ch)
            val pending = tagBuffer.toString()

            if (!inReasoning) {
                if (reasoningStartTags.any { pending == it }) {
                    inReasoning = true
                    tagBuffer.clear()
                    continue
                }

                if (reasoningStartTags.any { it.startsWith(pending) }) {
                    continue
                }

                answerBuilder.append(pending)
                answerDelta.append(pending)
                tagBuffer.clear()
            } else {
                if (reasoningEndTags.any { pending == it }) {
                    inReasoning = false
                    tagBuffer.clear()
                    continue
                }

                if (reasoningEndTags.any { it.startsWith(pending) }) {
                    continue
                }

                reasoningBuilder.append(pending)
                reasoningDelta.append(pending)
                tagBuffer.clear()
            }
        }

        if (answerDelta.isNotEmpty()) onAnswerDelta(answerDelta.toString())
        if (reasoningDelta.isNotEmpty()) onReasoningDelta?.invoke(reasoningDelta.toString())
    }

    @Synchronized
    fun flush() {
        if (tagBuffer.isEmpty()) return
        val remaining = tagBuffer.toString()
        tagBuffer.clear()
        if (inReasoning) {
            reasoningBuilder.append(remaining)
            onReasoningDelta?.invoke(remaining)
        } else {
            answerBuilder.append(remaining)
            onAnswerDelta(remaining)
        }
    }

    @Synchronized
    fun finalAnswer(): String = answerBuilder.toString()

    @Synchronized
    fun reasoningContent(): String = reasoningBuilder.toString()

    companion object {
        private val COMPLETE_REASONING_BLOCKS = listOf(
            Regex("(?s)<\\|channel>thought.*?<channel\\|>"),
            Regex("(?s)<thought>.*?</thought>"),
            Regex("(?s)<think>.*?</think>")
        )

        /**
         * Fallback cleanup for the non-streamed native return value. It is intentionally limited to
         * known Gemma reasoning/control markers instead of guessing at arbitrary model text.
         */
        fun cleanVisibleAnswer(raw: String): String {
            var text = raw
            COMPLETE_REASONING_BLOCKS.forEach { regex -> text = text.replace(regex, "") }

            // If an unterminated reasoning block remains, do not expose its contents.
            listOf("<|channel>thought", "<thought>", "<think>").forEach { start ->
                val index = text.indexOf(start)
                if (index >= 0) text = text.substring(0, index)
            }

            return text
                .replace("<|channel>", "")
                .replace("<channel|>", "")
                .replace("<turn|>", "")
                .replace("<|turn>", "")
                .replace("<end_of_turn>", "")
                .replace("<start_of_turn>", "")
                .replace("<|endoftext|>", "")
                .replace("<eos>", "")
                .replace("<bos>", "")
                .trim()
        }
    }
}
