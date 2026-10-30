package se.lobbamannen.nexushub.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * Nexus Intelligence native run ledger, v1.
 * Does not execute AI or claim to resume work. The ledger is an immutable-id,
 * transactional foundation for the future WorkManager runner.
 *
 * No credentials, document bodies, or prompt text are stored here.
 */
class IntelligenceRunStore(context: Context) {
    private class Helper(context: Context) :
        SQLiteOpenHelper(context.applicationContext, "nexus_intelligence_v1.db", null, 1) {
        override fun onConfigure(db: SQLiteDatabase) {
            super.onConfigure(db)
            db.setForeignKeyConstraintsEnabled(true)
        }
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("""
                CREATE TABLE runs(
                  id TEXT PRIMARY KEY, workflow TEXT NOT NULL, workflow_version INTEGER NOT NULL,
                  trigger_id TEXT NOT NULL UNIQUE, object_id TEXT NOT NULL, object_version TEXT NOT NULL,
                  state TEXT NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                  last_error TEXT NOT NULL DEFAULT '', result_json TEXT NOT NULL DEFAULT '{}',
                  sync_state TEXT NOT NULL DEFAULT 'local', revision INTEGER NOT NULL DEFAULT 0
                )
            """.trimIndent())
            db.execSQL("""
                CREATE TABLE steps(
                  run_id TEXT NOT NULL, ordinal INTEGER NOT NULL, operation_id TEXT NOT NULL UNIQUE,
                  kind TEXT NOT NULL, state TEXT NOT NULL, started_at TEXT,
                  finished_at TEXT, attempt INTEGER NOT NULL DEFAULT 0,
                  output_json TEXT NOT NULL DEFAULT '{}', error TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY(run_id,ordinal), FOREIGN KEY(run_id) REFERENCES runs(id)
                )
            """.trimIndent())
            db.execSQL("CREATE INDEX runs_updated ON runs(updated_at DESC)")
            db.execSQL("CREATE INDEX runs_state ON runs(state,updated_at DESC)")
        }
        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            error("IntelligenceRunStore migration required; never drop run history")
        }
    }

    private val helper = Helper(context)
    private val journalContext = context.applicationContext

    companion object {
        val states = setOf("queued", "running", "cancelling", "paused", "waiting_network", "waiting_index",
            "waiting_approval", "waiting_model", "failed", "conflict", "cancelled",
            "local_completed", "sync_pending", "completed")
        private val transitions = mapOf(
            "queued" to setOf("running", "paused", "cancelled", "waiting_model", "waiting_index", "conflict"),
            "running" to setOf("paused", "waiting_network", "waiting_approval",
                "waiting_model", "waiting_index", "failed", "conflict", "cancelling", "local_completed", "queued"),
            "cancelling" to setOf("cancelled"),
            "paused" to setOf("queued", "cancelled"),
            "waiting_network" to setOf("queued", "cancelled", "conflict"),
            "waiting_model" to setOf("queued", "cancelled"),
            "waiting_index" to setOf("queued", "cancelled"),
            "waiting_approval" to setOf("queued", "cancelled"),
            "failed" to setOf("queued", "cancelled"),
            "conflict" to setOf("queued", "cancelled"),
            "local_completed" to setOf("sync_pending", "completed"),
            "sync_pending" to setOf("completed", "waiting_network", "conflict"),
            "cancelled" to emptySet(), "completed" to emptySet()
        )
        private val uuid = Regex("[0-9a-fA-F-]{36}")
        private val safeKey = Regex("[A-Za-z0-9_.:/-]{1,256}")
        private fun now() = Instant.now().toString()
        fun allowed(from: String, to: String): Boolean = transitions[from]?.contains(to) == true
    }

    private inline fun <T> transaction(block: (SQLiteDatabase) -> T): T =
        synchronized(helper) {
            val db = helper.writableDatabase
            db.beginTransaction()
            try { val result = block(db); db.setTransactionSuccessful(); result }
            finally { db.endTransaction() }
        }

    private fun event(runId: String, action: String, state: String) {
        val status = when(state) {
            "completed", "local_completed" -> "succeeded"
            "failed" -> "failed"
            "conflict" -> "conflict"
            "cancelled" -> "cancelled"
            else -> "pending"
        }
        try {
            ActivityJournal(journalContext).append(JSONObject()
                .put("id", "intelligence:$runId:$action:$state")
                .put("at", now()).put("category", "system").put("action", "intelligence_$action")
                .put("status", status).put("source", "native")
                .put("objectType", "intelligence_run").put("objectId", runId)
                .put("operationId", runId).put("title", "Nexus Intelligence")
                .put("details", JSONObject().put("runId", runId).put("state", state)))
        } catch (_: Exception) { /* Journal cannot roll back the durable run. */ }
    }

    fun enqueue(workflow: String, triggerId: String, objectId: String,
                objectVersion: String): JSONObject {
        require(workflow in setOf("idea_analysis", "document_analysis", "source_changed",
            "research_package", "manual_check"))
        require(safeKey.matches(triggerId) && safeKey.matches(objectId))
        require(objectVersion.length in 1..128)
        val id = UUID.randomUUID().toString()
        val created = transaction { db ->
            val old = db.rawQuery("SELECT id FROM runs WHERE trigger_id=?", arrayOf(triggerId)).use {
                if(it.moveToFirst())it.getString(0) else null
            }
            if(old != null) return@transaction old to false
            val values = ContentValues().apply {
                put("id", id); put("workflow", workflow); put("workflow_version", 1)
                put("trigger_id", triggerId); put("object_id", objectId)
                put("object_version", objectVersion); put("state", "queued")
                put("started_at", now()); put("updated_at", now())
            }
            check(db.insertOrThrow("runs", null, values) != -1L)
            id to true
        }
        if(created.second) event(created.first, "queued", "queued")
        return get(created.first) ?: error("Created run missing")
    }

    fun get(id: String): JSONObject? = synchronized(helper) {
        require(uuid.matches(id))
        val db = helper.readableDatabase
        val result = db.rawQuery("""
            SELECT id,workflow,workflow_version,trigger_id,object_id,object_version,
            state,started_at,updated_at,last_error,result_json,sync_state,revision
            FROM runs WHERE id=?
        """.trimIndent(),arrayOf(id)).use { cursor ->
            if(!cursor.moveToFirst())return@use null
            JSONObject().apply {
                val fields = listOf("id","workflow","workflowVersion","triggerId","objectId",
                    "objectVersion","state","startedAt","updatedAt","error","result",
                    "syncState","revision")
                fields.forEachIndexed { i, field ->
                    put(field, when(i) {
                        2,12 -> cursor.getInt(i)
                        10 -> JSONObject(cursor.getString(i))
                        else -> cursor.getString(i)
                    })
                }
            }
        } ?: return@synchronized null
        val steps = JSONArray()
        db.rawQuery("""
            SELECT ordinal,operation_id,kind,state,started_at,finished_at,attempt,output_json,error
            FROM steps WHERE run_id=? ORDER BY ordinal
        """.trimIndent(),arrayOf(id)).use { rows ->
            while(rows.moveToNext()) steps.put(JSONObject()
                .put("ordinal", rows.getInt(0)).put("operationId", rows.getString(1))
                .put("kind", rows.getString(2)).put("state", rows.getString(3))
                .put("startedAt", rows.getString(4) ?: JSONObject.NULL)
                .put("finishedAt", rows.getString(5) ?: JSONObject.NULL)
                .put("attempt", rows.getInt(6)).put("output", JSONObject(rows.getString(7)))
                .put("error", rows.getString(8)))
        }
        result.put("steps", steps)
    }

    fun list(limit: Int = 50): JSONArray = synchronized(helper) {
        val array = JSONArray()
        helper.readableDatabase.rawQuery(
            "SELECT id FROM runs ORDER BY updated_at DESC,id DESC LIMIT ${limit.coerceIn(1,200)}", null
        ).use { cursor -> while(cursor.moveToNext()) get(cursor.getString(0))?.let(array::put) }
        array
    }

    /** Compare-and-swap transition. Invalid, stale or terminal transitions are rejected. */
    fun transition(id: String, expected: String, next: String, error: String = ""): Boolean {
        require(uuid.matches(id) && expected in states && next in states)
        require(error.length <= 400)
        if(!allowed(expected,next))return false
        val changed = transaction { db ->
            val values = ContentValues().apply {
                put("state", next); put("updated_at", now()); put("last_error", error)
            }
            val updated = db.update("runs", values, "id=? AND state=?", arrayOf(id,expected)) == 1
            if(updated) db.execSQL("UPDATE runs SET revision=revision+1 WHERE id=?",arrayOf(id))
            updated
        }
        if(changed)event(id, "state",next)
        return changed
    }

    /** A result is locally committed; sync status remains explicit and cannot imply GitHub success. */
    fun saveLocalResult(id: String, verifiedResult: JSONObject): Boolean {
        require(uuid.matches(id) && verifiedResult.toString().length<=65536)
        return transaction { db ->
            val values=ContentValues().apply {
                put("result_json",verifiedResult.toString());put("sync_state","local")
                put("updated_at",now())
            }
            val written=db.update("runs",values,"id=? AND state='running'",arrayOf(id))==1
            if(written)db.execSQL("UPDATE runs SET revision=revision+1 WHERE id=?",arrayOf(id))
            written
        }
    }

    /** A step is registered once by its stable operation ID. Output must be already validated. */
    fun recordStep(id: String, ordinal: Int, operationId: String, kind: String,
                   state: String, verifiedOutput: JSONObject = JSONObject(), error: String = ""): Boolean {
        require(uuid.matches(id) && ordinal in 0..200)
        require(safeKey.matches(operationId) && kind in setOf("code","model","sync","approval"))
        require(state in setOf("succeeded","failed","cancelled","pending"))
        require(error.length <= 400 && verifiedOutput.toString().length <= 32000)
        val changed = transaction { db ->
            val runState = db.rawQuery("SELECT state FROM runs WHERE id=?",arrayOf(id)).use {
                if(it.moveToFirst())it.getString(0) else null
            }
            require(runState == "running" || runState == "local_completed")
            val values = ContentValues().apply {
                put("run_id",id); put("ordinal",ordinal); put("operation_id",operationId)
                put("kind",kind); put("state",state); put("started_at",now())
                put("finished_at",if(state=="pending")null else now())
                put("attempt",1); put("output_json",verifiedOutput.toString());put("error",error)
            }
            val result = db.insertWithOnConflict("steps",null,values,SQLiteDatabase.CONFLICT_IGNORE)
            if(result != -1L)db.execSQL("UPDATE runs SET updated_at=?,revision=revision+1 WHERE id=?",
                arrayOf(now(),id))
            result != -1L
        }
        if(changed)event(id,"step_$ordinal",if(state=="succeeded")"local_completed" else state)
        return changed
    }
}
