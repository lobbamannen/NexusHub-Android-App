package se.lobbamannen.nexushub.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant

/**
 * Decisions on locally generated relationship proposals.
 * An approval is NOT a GitHub write, semantic proof or an automatic mutation.
 * Every decision is bound to the exact immutable source and model proposal bytes.
 */
class IntelligenceReviewStore(private val context: Context) {
    private class Helper(context: Context) :
        SQLiteOpenHelper(context.applicationContext, "nexus_intelligence_reviews_v1.db", null, 1) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("""CREATE TABLE decisions(
                run_id TEXT NOT NULL, proposal_index INTEGER NOT NULL,
                decision TEXT NOT NULL, proposal_hash TEXT NOT NULL,
                source_path TEXT NOT NULL, blob_sha TEXT NOT NULL,
                repo_commit TEXT NOT NULL, quote TEXT NOT NULL,
                decided_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY(run_id,proposal_index)
            )""")
            db.execSQL("CREATE INDEX decisions_state ON decisions(decision,decided_at DESC)")
        }
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            error("Review history requires explicit migration; never discard decisions")
        }
    }
    companion object {
        private val lock = Any()
        private val uuid = Regex("[a-fA-F0-9-]{36}")
        private val sha = Regex("[a-f0-9]{40}")
        private val hash = Regex("[a-f0-9]{64}")
        private fun digest(value: String): String =
            MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
    }
    private val helper = Helper(context)

    private fun proposal(runId: String, index: Int): JSONObject {
        require(uuid.matches(runId) && index in 0..100)
        val run = IntelligenceRunStore(context).get(runId) ?: error("Körningen saknas")
        require(run.getString("state") in setOf("local_completed","completed")) {
            "Analysen måste vara färdig innan ett beslut kan registreras"
        }
        val result = run.getJSONObject("result")
        val proposals = result.getJSONArray("proposals")
        require(index < proposals.length()) { "Förslaget finns inte" }
        val item = proposals.getJSONObject(index)
        require(item.getString("status") == "proposal")
        require(sha.matches(item.getString("blobSha")))
        require(sha.matches(item.getString("repoCommit")))
        require(item.getString("path").length in 1..1000)
        require(item.getString("quote").length in 12..250)
        return item
    }

    fun list(runId: String): JSONArray = synchronized(lock) {
        require(uuid.matches(runId))
        val out = JSONArray()
        helper.readableDatabase.rawQuery(
            """SELECT proposal_index,decision,proposal_hash,source_path,blob_sha,
                repo_commit,quote,decided_at,revision FROM decisions
                WHERE run_id=? ORDER BY proposal_index""",
            arrayOf(runId)
        ).use { rows ->
            while(rows.moveToNext()) out.put(JSONObject()
                .put("proposalIndex",rows.getInt(0)).put("decision",rows.getString(1))
                .put("proposalHash",rows.getString(2)).put("path",rows.getString(3))
                .put("blobSha",rows.getString(4)).put("repoCommit",rows.getString(5))
                .put("quote",rows.getString(6)).put("decidedAt",rows.getString(7))
                .put("revision",rows.getInt(8)))
        }
        out
    }

    fun decide(runId: String, index: Int, decision: String): JSONObject = synchronized(lock) {
        require(decision == "approved" || decision == "rejected")
        val source = proposal(runId,index)
        val proposalHash=digest(source.toString())
        require(hash.matches(proposalHash))
        val db=helper.writableDatabase
        val now=Instant.now().toString()
        var changed=false
        db.beginTransaction()
        try {
            val current=db.rawQuery(
                "SELECT decision,proposal_hash FROM decisions WHERE run_id=? AND proposal_index=?",
                arrayOf(runId,index.toString())
            ).use { c -> if(c.moveToFirst()) c.getString(0) to c.getString(1) else null }
            require(current==null || current.second==proposalHash) {
                "Förslaget har ändrats sedan förra beslutet; en ny granskning krävs"
            }
            if(current?.first != decision) {
                val values=ContentValues().apply {
                    put("run_id",runId);put("proposal_index",index);put("decision",decision)
                    put("proposal_hash",proposalHash);put("source_path",source.getString("path"))
                    put("blob_sha",source.getString("blobSha"))
                    put("repo_commit",source.getString("repoCommit"))
                    put("quote",source.getString("quote"));put("decided_at",now)
                    put("revision",if(current==null)1 else {
                        db.rawQuery(
                            "SELECT revision FROM decisions WHERE run_id=? AND proposal_index=?",
                            arrayOf(runId,index.toString())
                        ).use { c -> c.moveToFirst(); c.getInt(0)+1 }
                    })
                }
                check(db.insertWithOnConflict("decisions",null,values,SQLiteDatabase.CONFLICT_REPLACE)!=-1L)
                changed=true
            }
            db.setTransactionSuccessful()
        } finally {db.endTransaction()}
        if(changed)try {
            ActivityJournal(context).append(JSONObject()
                .put("id","intelligence:review:"+runId+":"+index+":"+now)
                .put("at",now).put("category","system").put("action","intelligence_review")
                .put("status","succeeded").put("source","native")
                .put("title",if(decision=="approved")"Relationsförslag godkänt lokalt" else "Relationsförslag avvisat")
                .put("objectType","intelligence_run").put("objectId",runId)
                .put("operationId","review:"+runId+":"+index)
                .put("details",JSONObject().put("decision",decision).put("proposalIndex",index)
                    .put("path",source.getString("path")).put("repoCommit",source.getString("repoCommit"))))
        }catch(_:Exception){ /* Durable decision is independent of the activity journal. */ }
        JSONObject().put("runId",runId).put("proposalIndex",index)
            .put("decision",decision).put("proposalHash",proposalHash)
            .put("changed",changed).put("syncState","local_only")
    }
}
