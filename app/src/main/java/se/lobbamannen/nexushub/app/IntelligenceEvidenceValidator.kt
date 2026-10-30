package se.lobbamannen.nexushub.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * An explicit, pure validation boundary between local Gemma output and saved evidence.
 *
 * The model never selects arbitrary paths or document versions. It may only refer to
 * candidate indices supplied by the verified local index at this exact run checkpoint.
 * A well-formed model response is not sufficient evidence of a correct relationship:
 * every accepted citation must be a literal contiguous span of the text shown to Gemma.
 */
internal object IntelligenceEvidenceValidator {
    private val sha = Regex("[a-f0-9]{40}")
    private val allowedKeyword = Regex("[\\p{L}\\p{N}][\\p{L}\\p{N} _+.-]{1,79}")

    fun parseClassification(raw: String): JSONObject {
        require(raw.length in 4..8000) { "Modellens klassificering är tom eller för lång" }
        val value = JSONObject(raw.trim())
        require(value.length() == 2 && value.has("topic") && value.has("keywords")) {
            "Klassificeringen innehåller oväntade eller saknade fält"
        }
        val topic = value.getString("topic").trim()
        require(topic.length in 2..120 && !topic.contains('<') && !topic.contains('>'))
        val entries = value.getJSONArray("keywords")
        require(entries.length() in 1..8) { "Modellen måste ge 1–8 sökord" }
        val keywords = JSONArray()
        val seen = HashSet<String>()
        for (i in 0 until entries.length()) {
            val keyword = entries.getString(i).trim()
            require(allowedKeyword.matches(keyword)) { "Ogiltigt sökord" }
            require(seen.add(keyword.lowercase())) { "Duplicerat sökord" }
            keywords.put(keyword)
        }
        return JSONObject().put("topic", topic).put("keywords", keywords)
    }

    /** Assumes every entry was obtained from the version-bound, verified replica. */
    fun validateMatches(raw: String, candidates: JSONArray, maxExcerptChars: Int = 700): JSONArray {
        require(raw.length in 2..32000)
        require(maxExcerptChars in 100..4000)
        require(candidates.length() in 0..20)
        val parsed = JSONObject(raw.trim())
        require(parsed.length() == 1 && parsed.has("matches")) {
            "Matchning måste bara innehålla fältet matches"
        }
        val matches = parsed.getJSONArray("matches")
        require(matches.length() <= 5) { "För många matchningar" }
        val verified = JSONArray()
        val used = HashSet<Int>()
        for (i in 0 until matches.length()) {
            val match = matches.getJSONObject(i)
            require(match.length() == 4 &&
                match.has("candidateIndex") && match.has("quote") &&
                match.has("reason") && match.has("confidence")) { "Oväntade matchfält" }
            val index = match.getInt("candidateIndex")
            require(index in 0 until candidates.length() && used.add(index)) {
                "Påhittad eller duplicerad kandidat"
            }
            val candidate = candidates.getJSONObject(index)
            val path = candidate.getString("path")
            val blob = candidate.getString("sha")
            val commit = candidate.getString("commit")
            require(path.length in 1..1000 &&
                !path.startsWith('/') && !path.contains('\\') &&
                !path.split('/').any { it in setOf("", ".", "..") } &&
                sha.matches(blob) && sha.matches(commit)) { "Ogiltig dokumentidentitet" }
            val excerpt = candidate.getString("excerpt").take(maxExcerptChars)
            val quote = match.getString("quote").trim()
            val reason = match.getString("reason").trim()
            val confidence = match.getDouble("confidence")
            require(quote.length in 12..250 && excerpt.contains(quote)) {
                "Citatet finns inte ordagrant i texten som modellen fick läsa"
            }
            require(reason.length in 10..300 && confidence.isFinite() &&
                confidence in 0.0..1.0) { "Motivering eller säkerhetsgrad är ogiltig" }
            verified.put(JSONObject()
                .put("path", path).put("blobSha", blob).put("repoCommit", commit)
                .put("quote", quote).put("reason", reason)
                .put("confidence", confidence).put("status", "proposal"))
        }
        return verified
    }

    /** Native llama.cpp explicitly distinguishes a normal stop from truncation. */
    fun requireComplete(finishReason: String) {
        require(finishReason in setOf("eog", "template_stop")) {
            "Modellsvar avbröts eller trunkerades: $finishReason"
        }
    }
}
