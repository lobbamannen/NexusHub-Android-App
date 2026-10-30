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
        SQLiteOpenHelper(context.applicationContext, "nexus_intelligence_reviews_v1.db", null, 2) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("""CREATE TABLE decisions(
                run_id TEXT NOT NULL, proposal_index INTEGER NOT NULL,
                decision TEXT NOT NULL, proposal_hash TEXT NOT NULL,
                source_path TEXT NOT NULL, blob_sha TEXT NOT NULL,
                repo_commit TEXT NOT NULL, quote TEXT NOT NULL,
                decided_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
                publication_sha TEXT NOT NULL DEFAULT '',publication_commit TEXT NOT NULL DEFAULT '',
                published_at TEXT NOT NULL DEFAULT '',
                PRIMARY KEY(run_id,proposal_index)
            )""")
            db.execSQL("CREATE INDEX decisions_state ON decisions(decision,decided_at DESC)")
        }
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            if(oldVersion==1 && newVersion==2) {
                db.execSQL("ALTER TABLE decisions ADD COLUMN publication_sha TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE decisions ADD COLUMN publication_commit TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE decisions ADD COLUMN published_at TEXT NOT NULL DEFAULT ''")
            } else error("Unsupported review schema migration")
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
        require(run.optString("syncState")!="stale" &&
            !run.getJSONObject("result").optBoolean("evidenceStale",false)) {
            "Inaktuellt analysunderlag; kör om analysen innan godkännande eller publicering."
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
        // Validate sources at approval time, independently of asynchronous
        // index-change invalidation. A source must still have the same blob.
        val indexStore=IntelligenceIndexStore(context)
        require(indexStore.hasVerifiedSource(item.getString("path"),item.getString("blobSha"))) {
            "Forskningskällan saknas eller har ändrats. Gör om analysen."
        }
        val originalPath=result.optString("sourcePath")
        if(originalPath.isNotBlank()) {
            require(indexStore.hasVerifiedSource(originalPath,result.optString("sourceSha"))) {
                "Originaldokumentet har ändrats eller tagits bort."
            }
        }
        return item
    }

    fun list(runId: String): JSONArray = synchronized(lock) {
        require(uuid.matches(runId))
        val out = JSONArray()
        helper.readableDatabase.rawQuery(
            """SELECT proposal_index,decision,proposal_hash,source_path,blob_sha,
                repo_commit,quote,decided_at,revision,publication_sha,publication_commit,published_at FROM decisions
                WHERE run_id=? ORDER BY proposal_index""",
            arrayOf(runId)
        ).use { rows ->
            while(rows.moveToNext()) out.put(JSONObject()
                .put("proposalIndex",rows.getInt(0)).put("decision",rows.getString(1))
                .put("proposalHash",rows.getString(2)).put("path",rows.getString(3))
                .put("blobSha",rows.getString(4)).put("repoCommit",rows.getString(5))
                .put("quote",rows.getString(6)).put("decidedAt",rows.getString(7))
                .put("revision",rows.getInt(8))
                .put("publicationSha",rows.getString(9))
                .put("publicationCommit",rows.getString(10))
                .put("publishedAt",rows.getString(11)))
        }
        out
    }


    /** A cross-run inbox derived entirely from saved proposals and durable decisions. */
    fun pending(limit:Int=30):JSONArray = synchronized(lock) {
        val out=JSONArray()
        val runStore=IntelligenceRunStore(context)
        var offset=0
        while(out.length()<limit.coerceIn(1,100)&&offset<=100000) {
          val runs=runStore.list(200,offset)
          if(runs.length()==0)break
          for(i in 0 until runs.length()) {
            if(out.length()>=limit.coerceIn(1,100))break
            val run=runs.getJSONObject(i)
            if(run.optString("state") !in setOf("local_completed","completed") ||
                run.optString("syncState")=="stale" ||
                run.optJSONObject("result")?.optBoolean("evidenceStale",false)==true)continue
            val proposals=run.optJSONObject("result")?.optJSONArray("proposals") ?: continue
            val decided=HashSet<Int>()
            val decisions=list(run.getString("id"))
            for(j in 0 until decisions.length())decided.add(decisions.getJSONObject(j).getInt("proposalIndex"))
            for(j in 0 until proposals.length()) {
                if(out.length()>=limit.coerceIn(1,100))break
                if(j in decided)continue
                val p=proposals.getJSONObject(j)
                if(p.optString("status")!="proposal")continue
                out.put(JSONObject()
                    .put("runId",run.getString("id"))
                    .put("workflow",run.getString("workflow"))
                    .put("proposalIndex",j)
                    .put("path",p.optString("path"))
                    .put("quote",p.optString("quote").take(250))
                    .put("confidence",p.optDouble("confidence",0.0)))
            }
          }
          offset+=runs.length()
          if(runs.length()<200)break
        }
        out
    }

    /** Call only after a user-initiated GitHub PUT and independently verified GET. */
    fun recordPublication(runId:String,index:Int,proposalHash:String,
                          registrySha:String,registryCommit:String):JSONObject = synchronized(lock) {
        require(hash.matches(proposalHash))
        require(sha.matches(registrySha) && sha.matches(registryCommit))
        val source=proposal(runId,index)
        require(digest(source.toString())==proposalHash) { "Förslaget har ändrats" }
        val now=Instant.now().toString()
        val db=helper.writableDatabase
        var changed=false
        db.beginTransaction()
        try {
            val row=db.rawQuery(
                """SELECT decision,proposal_hash,publication_sha,publication_commit
                    FROM decisions WHERE run_id=? AND proposal_index=?""",
                arrayOf(runId,index.toString())
            ).use { c -> if(c.moveToFirst()) listOf(c.getString(0),c.getString(1),c.getString(2),c.getString(3)) else null }
            require(row!=null && row[0]=="approved" && row[1]==proposalHash) {
                "Kopplingen måste godkännas lokalt före GitHub-publicering"
            }
            if(row[2].isNotEmpty()) {
                require(row[2]==registrySha) {
                    "En tidigare publicering har en annan registerversion; läs om GitHub"
                }
            } else {
                val values=ContentValues().apply {
                    put("publication_sha",registrySha);put("publication_commit",registryCommit)
                    put("published_at",now)
                }
                check(db.update("decisions",values,
                    "run_id=? AND proposal_index=? AND decision='approved' AND publication_sha=''",
                    arrayOf(runId,index.toString()))==1)
                changed=true
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        if(changed)try {
            ActivityJournal(context).append(JSONObject()
                .put("id","intelligence:published:"+runId+":"+index+":"+registrySha)
                .put("at",now).put("category","documents")
                .put("action","intelligence_relation_published")
                .put("status","succeeded").put("source","github")
                .put("title","Godkänd dokumentkoppling verifierad i GitHub")
                .put("objectType","intelligence_run").put("objectId",runId)
                .put("operationId","publish:"+runId+":"+index)
                .put("details",JSONObject().put("proposalIndex",index)
                    .put("registrySha",registrySha).put("registryCommit",registryCommit)))
        }catch(_:Exception){}
        JSONObject().put("runId",runId).put("proposalIndex",index)
            .put("publicationSha",registrySha).put("changed",changed)
            .put("syncState","github_verified")
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
                "SELECT decision,proposal_hash,publication_sha FROM decisions WHERE run_id=? AND proposal_index=?",
                arrayOf(runId,index.toString())
            ).use { c -> if(c.moveToFirst()) Triple(c.getString(0),c.getString(1),c.getString(2)) else null }
            require(current==null || current.second==proposalHash) {
                "Förslaget har ändrats sedan förra beslutet; en ny granskning krävs"
            }
            require(current==null || current.third.isEmpty() || decision=="approved") {
                "Publicerad relation måste återkallas via GitHub innan avvisning"
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
