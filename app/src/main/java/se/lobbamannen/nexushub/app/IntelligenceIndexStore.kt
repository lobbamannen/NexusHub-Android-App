package se.lobbamannen.nexushub.app

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Atomic, version-bound FTS4 index of NexusHub's already hash-verified offline replica.
 * Staging is never searchable; interrupted syncs retain the previous completed generation.
 * Commit switch, FTS rebuild and change accounting happen in one SQLite transaction.
 */
class IntelligenceIndexStore(context: Context) {
    private class Helper(context: Context):SQLiteOpenHelper(context.applicationContext,
        "nexus_intelligence_index_v1.db",null,3) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            db.execSQL("""CREATE TABLE documents(
                docid INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,blob_sha TEXT NOT NULL,repo_commit TEXT NOT NULL,
                title TEXT NOT NULL,body TEXT NOT NULL
            )""")
            db.execSQL("CREATE VIRTUAL TABLE documents_fts USING fts4(title,body,tokenize=unicode61)")
            db.execSQL("""CREATE TABLE staging_documents(
                path TEXT PRIMARY KEY,blob_sha TEXT NOT NULL,repo_commit TEXT NOT NULL,
                title TEXT NOT NULL,body TEXT NOT NULL
            )""")
            db.execSQL("""CREATE TABLE pending_analysis(
                path TEXT PRIMARY KEY,blob_sha TEXT NOT NULL,
                failures INTEGER NOT NULL DEFAULT 0
            )""")
        }
        override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int) {
            if(old==1 && new>=2) {
                db.execSQL("""CREATE TABLE staging_documents(
                    path TEXT PRIMARY KEY,blob_sha TEXT NOT NULL,repo_commit TEXT NOT NULL,
                    title TEXT NOT NULL,body TEXT NOT NULL
                )""")
                db.execSQL("DELETE FROM meta WHERE key='working'")
            }
            if(old<3 && new>=3) {
                db.execSQL("""CREATE TABLE pending_analysis(
                    path TEXT PRIMARY KEY,blob_sha TEXT NOT NULL,
                    failures INTEGER NOT NULL DEFAULT 0
                )""")
            }
            require(new==3 && old in 1..2) { "Unsupported index schema migration" }
        }
    }
    companion object {
        private val lock=Any()
        private val commitPattern=Regex("[0-9a-f]{40}")
        private val cleanTerm=Regex("[\\p{L}\\p{N}]{2,40}")
        fun eligible(path:String):Boolean =
            Regex("(?i)\\.(md|txt|json|csv)$").containsMatchIn(path) &&
            !path.split('/').any {it==".."||it=="."||it.isEmpty()}
        fun researchDocument(path:String):Boolean =
            eligible(path) && (path.startsWith("NexusHub inkorg/") ||
                path.startsWith("Research/")) &&
            !path.substringAfterLast('/').lowercase().let {
                it=="metadata.json" || it=="delad-text.txt" || it==".gitkeep"
            }
    }
    private val helper=Helper(context)
    private fun meta(db:SQLiteDatabase,key:String):String?=db.rawQuery(
        "SELECT value FROM meta WHERE key=?",arrayOf(key)).use{if(it.moveToFirst())it.getString(0)else null}
    private fun setMeta(db:SQLiteDatabase,key:String,value:String){
        db.execSQL("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)",arrayOf(key,value))
    }
    private inline fun <T> write(block:(SQLiteDatabase)->T):T=synchronized(lock){
        val db=helper.writableDatabase
        db.beginTransaction()
        try {val result=block(db);db.setTransactionSuccessful();result}
        finally {db.endTransaction()}
    }
    fun begin(commit:String):JSONObject {
        require(commitPattern.matches(commit))
        write {db ->
            db.delete("staging_documents",null,null)
            setMeta(db,"working",commit)
            // The previous completed generation stays searchable until finish succeeds.
        }
        return status()
    }
    /** Only the bridge, after replicaReader.file hash verification, may submit bytes. */
    fun upsert(commit:String,path:String,sha:String,title:String,body:String):Boolean {
        require(commitPattern.matches(commit)&&commitPattern.matches(sha))
        require(path.length in 1..1000&&!path.startsWith('/')&&!path.contains('\\')&&
            !path.split('/').any{it in setOf("","..",".")})
        require(eligible(path)&&title.length<=300 && body.length<=120000)
        return write {db ->
            require(meta(db,"working")==commit) { "Stagingen har bytt version" }
            val values=ContentValues().apply {
                put("path",path);put("blob_sha",sha);put("repo_commit",commit)
                put("title",title);put("body",body)
            }
            check(db.insertWithOnConflict("staging_documents",null,values,
                SQLiteDatabase.CONFLICT_REPLACE)!=-1L)
            true
        }
    }
    fun finish(commit:String,expected:Int):JSONObject {
        require(commitPattern.matches(commit)&&expected in 0..200000)
        var previousCommit=""
        val changedPaths=JSONArray()
        write {db ->
            check(meta(db,"working")==commit)
            previousCommit=meta(db,"completed").orEmpty()
            val count=db.rawQuery(
                "SELECT count(*) FROM staging_documents WHERE repo_commit=?",arrayOf(commit))
                .use{it.moveToFirst();it.getInt(0)}
            check(count==expected) { "Endast $count av $expected textfiler är färdiga." }
            fun count(sql:String):Int=db.rawQuery(sql,null).use{it.moveToFirst();it.getInt(0)}
            val added=count("""SELECT count(*) FROM staging_documents n
                LEFT JOIN documents o ON o.path=n.path WHERE o.path IS NULL""")
            val modified=count("""SELECT count(*) FROM staging_documents n
                JOIN documents o ON o.path=n.path WHERE n.blob_sha<>o.blob_sha""")
            val deleted=count("""SELECT count(*) FROM documents o
                LEFT JOIN staging_documents n ON o.path=n.path WHERE n.path IS NULL""")
            // Durable work queue: a bounded notification receipt must never cause
            // documents beyond the receipt cap to disappear from proactive analysis.
            db.execSQL("""DELETE FROM pending_analysis
                WHERE path NOT IN (SELECT path FROM staging_documents)
                OR blob_sha != (SELECT blob_sha FROM staging_documents n
                    WHERE n.path=pending_analysis.path)""")
            if(previousCommit.isNotBlank()) {
                db.execSQL("""INSERT OR REPLACE INTO pending_analysis(path,blob_sha,failures)
                    SELECT n.path,n.blob_sha,0 FROM staging_documents n
                    LEFT JOIN documents o ON o.path=n.path
                    WHERE (o.path IS NULL OR o.blob_sha<>n.blob_sha)
                    AND (n.path LIKE 'NexusHub inkorg/%' OR n.path LIKE 'Research/%')
                    AND (lower(n.path) LIKE '%.md' OR lower(n.path) LIKE '%.txt'
                        OR lower(n.path) LIKE '%.json' OR lower(n.path) LIKE '%.csv')
                    AND lower(n.path) NOT LIKE '%/metadata.json'
                    AND lower(n.path) NOT LIKE '%/delad-text.txt'""")
            }
            // Bounded UI receipt only; the complete queue persists in SQLite.
            db.rawQuery("""SELECT n.path FROM staging_documents n
                LEFT JOIN documents o ON o.path=n.path
                WHERE o.path IS NULL OR n.blob_sha<>o.blob_sha
                ORDER BY n.path LIMIT 50""",null).use { rows ->
                while(rows.moveToNext()) changedPaths.put(rows.getString(0))
            }
            db.delete("documents_fts",null,null)
            db.delete("documents",null,null)
            db.execSQL("""INSERT INTO documents(path,blob_sha,repo_commit,title,body)
                SELECT path,blob_sha,repo_commit,title,body FROM staging_documents ORDER BY path""")
            db.execSQL("""INSERT INTO documents_fts(docid,title,body)
                SELECT docid,title,body FROM documents""")
            db.delete("staging_documents",null,null)
            setMeta(db,"completed",commit)
            setMeta(db,"ready","true")
            setMeta(db,"working","")
            setMeta(db,"lastAdded",added.toString())
            setMeta(db,"lastModified",modified.toString())
            setMeta(db,"lastDeleted",deleted.toString())
        }
        return status().put("previousCommit",previousCommit).put("changedPaths",changedPaths)
    }
    fun status():JSONObject=synchronized(lock) {
        val db=helper.readableDatabase
        val completed=meta(db,"completed").orEmpty()
        val ready=meta(db,"ready")=="true"
        val rows=db.rawQuery("SELECT count(*) FROM documents",null).use{it.moveToFirst();it.getInt(0)}
        val added=meta(db,"lastAdded")?.toIntOrNull()?:0
        val modified=meta(db,"lastModified")?.toIntOrNull()?:0
        val deleted=meta(db,"lastDeleted")?.toIntOrNull()?:0
        JSONObject().put("ready",ready).put("commit",if(ready)completed else "")
            .put("indexedFiles",rows).put("indexing",meta(db,"working").orEmpty().isNotBlank())
            .put("added",added).put("modified",modified).put("deleted",deleted)
            .put("changeCount",added+modified+deleted)
            .put("pendingAnalysis",db.rawQuery("SELECT count(*) FROM pending_analysis",null)
                .use{it.moveToFirst();it.getInt(0)})
    }
    /** Oldest eligible document awaiting a durable analysis run. */
    fun nextPending():JSONObject?=synchronized(lock) {
        val db=helper.readableDatabase
        db.rawQuery("""SELECT p.path,p.blob_sha FROM pending_analysis p
            WHERE p.failures<3 ORDER BY p.failures ASC,p.path ASC LIMIT 1""",null).use {c->
            if(!c.moveToFirst())null else JSONObject()
                .put("path",c.getString(0)).put("sha",c.getString(1))
        }
    }
    fun acknowledgePending(path:String,sha:String) {
        write{db->db.delete("pending_analysis","path=? AND blob_sha=?",arrayOf(path,sha))}
    }
    fun failPending(path:String,sha:String) {
        write{db->db.execSQL("""UPDATE pending_analysis SET failures=failures+1
            WHERE path=? AND blob_sha=?""",arrayOf(path,sha))}
    }
    fun document(path:String):JSONObject=synchronized(lock) {
        require(path.length in 1..1000 && eligible(path) && !path.startsWith('/') &&
            !path.contains('\\') && !path.split('/').any { it in setOf("",".","..") })
        val db=helper.readableDatabase
        require(meta(db,"ready")=="true") { "Verifierat sökindex saknas" }
        val commit=meta(db,"completed").orEmpty()
        db.rawQuery("""SELECT path,blob_sha,repo_commit,title,body FROM documents
            WHERE path=? AND repo_commit=?""",arrayOf(path,commit)).use {c->
            require(c.moveToFirst()) { "Dokumentet saknas i den verifierade versionen" }
            JSONObject().put("path",c.getString(0)).put("sha",c.getString(1))
                .put("commit",c.getString(2)).put("title",c.getString(3))
                .put("body",c.getString(4))
        }
    }
    fun search(terms:List<String>,limit:Int=8):JSONArray=synchronized(lock) {
        val db=helper.readableDatabase
        require(meta(db,"ready")=="true") { "Fulltextindex är inte färdigt" }
        val selected=terms.flatMap {it.lowercase().split(Regex("[^\\p{L}\\p{N}]+"))}
            .filter{cleanTerm.matches(it)}.distinct().take(8)
        if(selected.isEmpty())return@synchronized JSONArray()
        val expression=selected.joinToString(" OR "){"\"$it\""}
        // Rank FTS4 matches by corpus-adjusted term frequency, with a substantial
        // title boost. A match in a long document must outrank unrelated short files.
        val ranked=ArrayList<Pair<Double,JSONObject>>()
        val sql="""SELECT d.path,d.blob_sha,d.repo_commit,d.title,d.body,
                matchinfo(documents_fts,'pcx'),offsets(documents_fts)
            FROM documents_fts f JOIN documents d ON d.docid=f.docid
            WHERE documents_fts MATCH ? AND d.repo_commit=? LIMIT 3000"""
        db.rawQuery(sql,arrayOf(expression,meta(db,"completed").orEmpty())).use{c->
            while(c.moveToNext()){
                val body=c.getString(4)
                val stats=java.nio.ByteBuffer.wrap(c.getBlob(5))
                    .order(java.nio.ByteOrder.LITTLE_ENDIAN)
                val phrases=stats.int
                val columns=stats.int
                var score=0.0
                for(phrase in 0 until phrases)for(col in 0 until columns){
                    val hits=stats.int
                    stats.int // total corpus hits
                    val documentsWithHits=stats.int
                    if(hits>0)score+=(if(col==0)8.0 else 1.0) *
                        (1.0+kotlin.math.ln(1.0+hits.toDouble())) /
                        (1.0+kotlin.math.ln(1.0+documentsWithHits.toDouble()))
                }
                // SQLite offsets are UTF-8 byte positions; the excerpt is the
                // contiguous original body text around the first body match.
                val offsets=c.getString(6).trim().split(Regex("\\s+"))
                var matchByte=-1
                var n=0
                while(n+3<offsets.size){
                    if(offsets[n]=="1"){
                        val at=offsets[n+2].toIntOrNull()?:-1
                        if(at>=0&&(matchByte<0||at<matchByte))matchByte=at
                    }
                    n+=4
                }
                val prefixChars=if(matchByte>=0){
                    val bytes=body.toByteArray(Charsets.UTF_8)
                    String(bytes,0,matchByte.coerceAtMost(bytes.size),Charsets.UTF_8).length
                } else 0
                val start=(prefixChars-150).coerceAtLeast(0)
                val end=(start+700).coerceAtMost(body.length)
                ranked.add(score to JSONObject()
                    .put("path",c.getString(0)).put("sha",c.getString(1))
                    .put("commit",c.getString(2)).put("title",c.getString(3))
                    .put("excerpt",body.substring(start,end)))
            }
        }
        val rows=JSONArray()
        ranked.sortedWith(compareByDescending<Pair<Double,JSONObject>>{it.first}
            .thenBy{it.second.getString("path")}).take(limit.coerceIn(1,20))
            .forEach{rows.put(it.second)}
        rows
    }
}
