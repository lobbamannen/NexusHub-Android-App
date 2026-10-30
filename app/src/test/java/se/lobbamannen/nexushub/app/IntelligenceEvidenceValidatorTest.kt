package se.lobbamannen.nexushub.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class IntelligenceEvidenceValidatorTest {
    private val shaA = "a".repeat(40)
    private val shaB = "b".repeat(40)
    private val excerpt = "NexusHub kopplar verifierade idéer till lokalt sparade dokument. Tidsstämplar måste bevaras."
    private fun candidates() = JSONArray().put(JSONObject()
        .put("path","Research/NexusHub.md").put("sha",shaA)
        .put("commit",shaB).put("title","Forskningsrapport")
        .put("excerpt",excerpt))
    private fun match(index:Int=0,quote:String="NexusHub kopplar verifierade idéer",
                      confidence:Double=0.8) = JSONObject()
        .put("candidateIndex",index).put("quote",quote)
        .put("reason","Ämnet och innehållet hör ihop med citatet.")
        .put("confidence",confidence)
    private fun jsonMatch(match:JSONObject)=JSONObject().put("matches",JSONArray().put(match)).toString()

    @Test fun acceptsRealSourceIdentityAndExactLiteralQuote() {
        val results=IntelligenceEvidenceValidator.validateMatches(jsonMatch(match()),candidates())
        assertEquals(1,results.length())
        val proposal=results.getJSONObject(0)
        assertEquals("Research/NexusHub.md",proposal.getString("path"))
        assertEquals(shaA,proposal.getString("blobSha"))
        assertEquals(shaB,proposal.getString("repoCommit"))
        assertEquals("proposal",proposal.getString("status"))
    }

    @Test fun rejectsFabricatedCandidateAndCitation() {
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(jsonMatch(match(index=1)),candidates())
        }
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(jsonMatch(match(quote="En fullständigt påhittad verifierad text")),candidates())
        }
    }

    @Test fun quoteMustBeInActualVisibleExcerptNotHiddenTail() {
        val hidden="Unik verifieringssträng som bara finns långt efter de 700 tecknen."
        val candidate=candidates().getJSONObject(0)
            .put("excerpt","Z".repeat(800)+hidden)
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(jsonMatch(match(quote=hidden)),
                JSONArray().put(candidate))
        }
    }

    @Test fun forbidsDuplicateCandidateAndInvalidConfidence() {
        val twice=JSONObject().put("matches",JSONArray().put(match()).put(match())).toString()
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(twice,candidates())
        }
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(jsonMatch(match(confidence=1.1)),candidates())
        }
    }

    @Test fun forgedShaOrExtraFieldsAreRejected() {
        val bad=candidates().getJSONObject(0).put("sha","Q4_model_not_a_source_hash")
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(jsonMatch(match()),JSONArray().put(bad))
        }
        val extra=JSONObject(match().toString()).put("operation","delete")
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.validateMatches(jsonMatch(extra),candidates())
        }
    }

    @Test fun validClassificationIsNormalizedAndNeverAuthorizesOperations() {
        val verified=IntelligenceEvidenceValidator.parseClassification(
            """{"topic":" Lokala AI-modeller ","keywords":["Gemma 4","NPU"]}""")
        assertEquals("Lokala AI-modeller",verified.getString("topic"))
        assertEquals(2,verified.getJSONArray("keywords").length())
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.parseClassification(
                """{"topic":"Modeller","keywords":["NPU"],"tool":"github_delete"}""")
        }
        assertThrows(IllegalArgumentException::class.java) {
            IntelligenceEvidenceValidator.parseClassification(
                """{"topic":"Modeller","keywords":["../secrets"]}""")
        }
    }

    @Test fun tokenTruncationCannotBeReportedAsComplete() {
        for (ok in listOf("eog","template_stop"))IntelligenceEvidenceValidator.requireComplete(ok)
        for (invalid in listOf("length","context_limit","cancelled","error","in_progress","unknown")) {
            assertThrows(IllegalArgumentException::class.java) {
                IntelligenceEvidenceValidator.requireComplete(invalid)
            }
        }
    }
}
