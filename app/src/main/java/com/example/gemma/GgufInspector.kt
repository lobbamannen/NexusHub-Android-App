package com.example.gemma

import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest

/** Bounded GGUF v3 inspection of the supported Gemma 4 Q2/Q4 target variants. */
data class GgufInventory(
    val sha256: String,
    val fileBytes: Long,
    val modifiedMillis: Long,
    val architecture: String,
    val tensorCount: Int,
    val parameterCount: Long,
    val qtypes: Map<String, Int>,
    val templateSha256: String,
    val templateText: String,
    val metadata: Map<String, String>,
    val tensors: List<GgufTensor>
)

data class GgufTensor(val name: String, val type: String, val parameters: Long, val bytes: Long)

object GgufInspector {
    private data class Quant(val name: String, val block: Long, val bytes: Long)

    // GGML type ids and block sizes used by the supported Unsloth Gemma targets.
    // UD-Q2_K_XL mobile-QAT uses TQ2_0/Q4_0, while UD-Q4_K_XL dynamic quants may
    // mix Q4_K/Q5_K/Q6_K/IQ4_XS with the usual F16/F32/Q8_0 tensors.
    private val quants = mapOf(
        0 to Quant("F32", 1, 4),
        1 to Quant("F16", 1, 2),
        2 to Quant("Q4_0", 32, 18),
        3 to Quant("Q4_1", 32, 20),
        6 to Quant("Q5_0", 32, 22),
        7 to Quant("Q5_1", 32, 24),
        8 to Quant("Q8_0", 32, 34),
        10 to Quant("Q2_K", 256, 84),
        11 to Quant("Q3_K", 256, 110),
        12 to Quant("Q4_K", 256, 144),
        13 to Quant("Q5_K", 256, 176),
        14 to Quant("Q6_K", 256, 210),
        20 to Quant("IQ4_NL", 32, 18),
        23 to Quant("IQ4_XS", 256, 136),
        30 to Quant("BF16", 1, 2),
        35 to Quant("TQ2_0", 256, 66)
    )

    private const val MAX_STRING = 16L * 1024 * 1024
    private const val MAX_DIRECTORY = 128L * 1024 * 1024

    fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered(256 * 1024).use { input ->
            val buffer = ByteArray(256 * 1024)
            while (true) {
                if (Thread.currentThread().isInterrupted) throw InterruptedException("Model verification cancelled")
                val n = input.read(buffer)
                if (n < 0) break
                md.update(buffer, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    fun inspect(file: File, modelId: GemmaModelId, digest: String? = null): GgufInventory {
        val length = file.length()
        val modified = file.lastModified()
        RandomAccessFile(file, "r").use { f ->
            fun u32(): Long = Integer.reverseBytes(f.readInt()).toLong() and 0xffffffffL
            fun u64(): Long = java.lang.Long.reverseBytes(f.readLong()).also { require(it >= 0) { "GGUF integer overflow" } }
            fun skip(n: Long) {
                require(n >= 0 && n <= length - f.filePointer && n <= MAX_DIRECTORY - f.filePointer) { "Truncated or oversized GGUF directory" }
                f.seek(f.filePointer + n)
            }
            fun string(read: Boolean = true): String {
                val n = u64()
                require(n <= MAX_STRING && n <= length - f.filePointer && n <= MAX_DIRECTORY - f.filePointer) { "Invalid GGUF string size" }
                if (!read) { skip(n); return "" }
                return ByteArray(n.toInt()).also(f::readFully).toString(Charsets.UTF_8)
            }
            fun value(type: Int, retain: Boolean): String {
                return when (type) {
                    0 -> f.readUnsignedByte().toString()
                    1 -> f.readByte().toString()
                    2 -> (java.lang.Short.reverseBytes(f.readShort()).toInt() and 65535).toString()
                    3 -> java.lang.Short.reverseBytes(f.readShort()).toString()
                    4 -> u32().toString()
                    5 -> u32().toInt().toString()
                    6 -> java.lang.Float.intBitsToFloat(u32().toInt()).toString()
                    7 -> f.readUnsignedByte().also { require(it in 0..1) }.let { (it == 1).toString() }
                    8 -> string(retain)
                    9 -> {
                        val elementType = u32().toInt()
                        val count = u64()
                        require(count <= 2_000_000 && elementType != 9) { "Invalid GGUF array" }
                        if (elementType == 8) repeat(count.toInt()) { string(false) }
                        else {
                            val width = when (elementType) { 0, 1, 7 -> 1; 2, 3 -> 2; 4, 5, 6 -> 4; 10, 11, 12 -> 8; else -> error("Unknown GGUF value type") }
                            skip(Math.multiplyExact(count, width.toLong()))
                        }
                        "array[$count]"
                    }
                    10 -> u64().toString()
                    11 -> java.lang.Long.reverseBytes(f.readLong()).toString()
                    12 -> java.lang.Double.longBitsToDouble(java.lang.Long.reverseBytes(f.readLong())).toString()
                    else -> error("Unknown GGUF value type $type")
                }
            }

            require(u32() == 0x46554747L && u32() == 3L) { "Expected GGUF v3" }
            val tensorCount = u64().also { require(it in 1..100_000) }.toInt()
            val metadataCount = u64().also { require(it in 1..100_000) }.toInt()
            val metadata = linkedMapOf<String, String>()
            val keys = HashSet<String>()
            repeat(metadataCount) {
                val key = string()
                require(keys.add(key)) { "Duplicate GGUF metadata key $key" }
                val retain = key.startsWith("general.") || key.startsWith("gemma4.") ||
                    key == "tokenizer.chat_template" || key.endsWith("_token_id")
                val result = value(u32().toInt(), retain)
                if (retain) metadata[key] = result
                require(f.filePointer <= MAX_DIRECTORY) { "GGUF directory exceeds limit" }
            }
            require(metadata["general.architecture"] == "gemma4") { "File is not a Gemma 4 model" }
            val expectedLayers = if (modelId == GemmaModelId.E2B) 35 else 42
            val expectedHidden = if (modelId == GemmaModelId.E2B) 1536 else 2560
            require(metadata["gemma4.block_count"]?.toIntOrNull() == expectedLayers &&
                metadata["gemma4.embedding_length"]?.toIntOrNull() == expectedHidden) {
                "GGUF architecture does not match ${modelId.displayName}; renaming a file does not change its identity"
            }
            val expectedKv = if (modelId == GemmaModelId.E2B) 1 else 2
            metadata["gemma4.attention.head_count_kv"]?.let { value ->
                require(value.toIntOrNull() == expectedKv || value.startsWith("array[")) { "Unexpected KV-head configuration" }
            }
            val template = metadata["tokenizer.chat_template"] ?: error("GGUF has no embedded chat template")
            require(template.isNotBlank() && !template.startsWith("array[")) { "Invalid chat template" }
            val alignment = metadata["general.alignment"]?.toLongOrNull() ?: 32L
            require(alignment in 1..4096 && (alignment and (alignment - 1)) == 0L) { "Invalid GGUF alignment" }
            val qtypes = linkedMapOf<String, Int>()
            val names = HashSet<String>()
            val ranges = ArrayList<Pair<Long, Long>>()
            val tensors = ArrayList<GgufTensor>()
            var total = 0L
            repeat(tensorCount) {
                val name = string()
                require(names.add(name)) { "Duplicate tensor $name" }
                val dims = u32().also { require(it in 1..4) }.toInt()
                var elements = 1L
                var row = 0L
                repeat(dims) { index ->
                    val dim = u64().also { require(it > 0) }
                    if (index == 0) row = dim
                    elements = Math.multiplyExact(elements, dim)
                }
                val type = u32().toInt()
                val quant = quants[type] ?: error(
                    "Unexpected tensor qtype $type in ${modelId.displayName}; this build accepts the tensor types used by the supported UD-Q2_K_XL and UD-Q4_K_XL targets"
                )
                require(row % quant.block == 0L) { "Invalid quantized tensor row $name" }
                val bytes = Math.multiplyExact(elements / quant.block, quant.bytes)
                val offset = u64()
                require(offset % alignment == 0L) { "Unaligned tensor $name" }
                ranges += offset to Math.addExact(offset, bytes)
                total = Math.addExact(total, elements)
                qtypes[quant.name] = (qtypes[quant.name] ?: 0) + 1
                tensors += GgufTensor(name, quant.name, elements, bytes)
            }
            require(f.filePointer <= MAX_DIRECTORY)
            val dataStart = Math.multiplyExact((Math.addExact(f.filePointer, alignment - 1) / alignment), alignment)
            var end = 0L
            ranges.sortedBy { it.first }.forEach { (start, next) ->
                require(start >= end && next <= length - dataStart) { "Truncated or overlapping GGUF tensor data" }
                end = next
            }
            require(qtypes.isNotEmpty()) { "GGUF contains no supported tensors" }
            require("token_embd.weight" in names && "per_layer_token_embd.weight" in names) { "Missing Gemma per-layer embeddings" }
            val sha = digest ?: sha256(file)
            require(file.length() == length && file.lastModified() == modified) { "Model changed during verification" }
            val templateHash = MessageDigest.getInstance("SHA-256").digest(template.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
            return GgufInventory(sha, length, modified, "gemma4", tensorCount, total, qtypes, templateHash, template, metadata - "tokenizer.chat_template", tensors)
        }
    }
}
