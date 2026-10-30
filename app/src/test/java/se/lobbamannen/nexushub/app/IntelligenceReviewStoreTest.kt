package se.lobbamannen.nexushub.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
class IntelligenceReviewStoreTest {
    private val context: Context get()=org.robolectric.RuntimeEnvironment.getApplication()
    private val sha="a".repeat(40)
    private val commit="b".repeat(40)
    @Before fun clean(){
        context.deleteDatabase("nexus_intelligence_reviews_v1.db")
        context.deleteDatabase("nexus_intelligence_v1.db")
        context.deleteDatabase("nexus_intelligence_index_v1.db")
    }
    private fun run():String {
        // The existing review contract now uses a real hash-bound index entry,
        // just as the production approval path requires.
        val index=IntelligenceIndexStore(context)
        index.begin(commit)
        index.upsert(commit,"Research/sample.md",sha,"Verifierat källdokument",
            "Exakt ett långt citerat avsnitt. Detta källmaterial är lokalt indexerat.")
        index.finish(commit,1)
        val store=IntelligenceRunStore(context)
        val id=store.enqueue("idea_analysis","test:"+UUID.randomUUID(),
            UUID.randomUUID().toString(),sha).getString("id")
        assertTrue(store.transition(id,"queued","running"))
        val proposal=JSONObject().put("path","Research/sample.md")
            .put("blobSha",sha).put("repoCommit",commit)
            .put("quote","Exakt ett långt citerat avsnitt.")
            .put("reason","Relaterat ämne med källstöd")
            .put("confidence",0.7).put("status","proposal")
        assertTrue(store.saveLocalResult(id,JSONObject()
            .put("proposals",JSONArray().put(proposal)).put("topic","Samband")))
        assertTrue(store.transition(id,"running","local_completed"))
        return id
    }
    @Test fun durableReviewIsIdempotentAndAuditable() {
        val id=run()
        val reviews=IntelligenceReviewStore(context)
        assertEquals(1,reviews.pending().length())
        val first=reviews.decide(id,0,"approved")
        assertTrue(first.getBoolean("changed"))
        assertEquals(0,reviews.pending().length())
        val second=IntelligenceReviewStore(context).decide(id,0,"approved")
        assertFalse(second.getBoolean("changed"))
        assertEquals(first.getString("proposalHash"),second.getString("proposalHash"))
        assertEquals("approved",reviews.list(id).getJSONObject(0).getString("decision"))
    }
    @Test fun publicationReceiptRequiresLocalApprovalAndCannotBeRewritten() {
        val id=run()
        val reviews=IntelligenceReviewStore(context)
        val hash=reviews.decide(id,0,"approved").getString("proposalHash")
        val result=reviews.recordPublication(id,0,hash,sha,commit)
        assertEquals("github_verified",result.getString("syncState"))
        assertFalse(reviews.recordPublication(id,0,hash,sha,commit).getBoolean("changed"))
        try{reviews.decide(id,0,"rejected");fail("published relation cannot be silently rejected")}
        catch(_:IllegalArgumentException){}
    }
}
