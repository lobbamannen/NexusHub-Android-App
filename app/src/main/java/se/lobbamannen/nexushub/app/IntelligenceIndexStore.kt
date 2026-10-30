package se.lobbamannen.nexushub.app

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

/**
 * Disposable, derived full-text index of the existing verified Databas replica.
 * The browser replica remains authoritative for file bytes; this index never syncs or writes GitHub.
 * Every indexed record is tied to an exact Git blob SHA and a completed inventory commit.
 */
class IntelligenceIndexStore(context: Context) {
    private class Helper(context: Context):SQLiteOpenHelper(context.applicationContext,
        "nexus_intelligence_index_v1.db",null,1) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            db.execSQL("""CREATE TABLE documents(
                docid INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,blob_sha TEXT NOT NULL,repo_commit TEXT NOT NULL,
                title TEXT NOT NULL,body TEXT NOT NULL
            )""")
            db.execSQL("CREATE VIRTUAL TABLE documents_fts USING fts4(title,body,tokenize=unicode61)")
        }
        override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int) {
            error("Index migration must be explicit")
        }
    }
    companion object {
        private val lock=Any()
        private val commitPattern=Regex("[0-9a-f]{40}")
        private val cleanTerm=Regex("[\\p{L}\\p{N}]{2,40}")
        private val validPath=Regex("[A-Za-z0-9_./ åäöÅÄÖ()&+,-]{1,1000}")
        fun eligible(path:String):Boolean =
            Regex("(?i)\\.(md|txt|json|csv)$").containsMatchIn(path) &&
            !path.split('/').any {it==".."||it=="."||it.isEmpty()}
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
            setMeta(db,"working",commit)
            setMeta(db,"ready","false")
        }
        return status()
    }
    /** Never ingest unverified URLs; the source must come from replicaReader.file. */
    fun upsert(commit:String,path:String,sha:String,title:String,body:String):Boolean {
        require(commitPattern.matches(commit)&&commitPattern.matches(sha))
        require(path.length in 1..1000&&!path.startsWith('/')&&!path.contains('\\')&&
            !path.split('/').any{it in setOf("","..",".")})
        require(eligible(path)&&title.length<=300 && body.length<=120000)
        return write { db ->
            require(meta(db,"working")==commit && meta(db,"ready")=="false") {
                "Indexets inventering har ändrats"
            }
            val existing=db.rawQuery("SELECT docid FROM documents WHERE path=?",arrayOf(path)).use{
                if(it.moveToFirst())it.getLong(0)else null
            }
            if(existing!=null)db.delete("documents_fts","docid=?",arrayOf(existing.toString()))
            val values=ContentValues().apply {
                put("path",path);put("blob_sha",sha);put("repo_commit",commit)
                put("title",title);put("body",body)
            }
            val id=if(existing!=null){
                check(db.update("documents",values,"docid=?",arrayOf(existing.toString()))==1)
                existing
            }else db.insertOrThrow("documents",null,values)
            db.execSQL("INSERT INTO documents_fts(docid,title,body) VALUES(?,?,?)",
                arrayOf(id,title,body))
            true
        }
    }
    fun finish(commit:String,expected:Int):JSONObject {
        require(commitPattern.matches(commit)&&expected in 0..200000)
        write {db ->
            check(meta(db,"working")==commit)
            val count=db.rawQuery("SELECT count(*) FROM documents WHERE repo_commit=?",arrayOf(commit))
                .use{it.moveToFirst();it.getInt(0)}
            check(count==expected) { "Endast $count av $expected textfiler är indexerade." }
            val obsolete=mutableListOf<Long>()
            db.rawQuery("SELECT docid FROM documents WHERE repo_commit<>?",arrayOf(commit)).use{
                while(it.moveToNext())obsolete.add(it.getLong(0))
            }
            for(id in obsolete) {
                db.delete("documents_fts","docid=?",arrayOf(id.toString()))
                db.delete("documents","docid=?",arrayOf(id.toString()))
            }
            setMeta(db,"completed",commit)
            setMeta(db,"ready","true")
            setMeta(db,"working","")
        }
        return status()
    }
    fun status():JSONObject=synchronized(lock) {
        val db=helper.readableDatabase
        val completed=meta(db,"completed").orEmpty()
        val ready=meta(db,"ready")=="true"
        val rows=db.rawQuery("SELECT count(*) FROM documents",null).use{it.moveToFirst();it.getInt(0)}
        JSONObject().put("ready",ready).put("commit",if(ready)completed else "")
            .put("indexedFiles",rows).put("indexing",meta(db,"working").orEmpty().isNotBlank())
    }
    fun search(terms:List<String>,limit:Int=8):JSONArray=synchronized(lock) {
        val db=helper.readableDatabase
        require(meta(db,"ready")=="true") { "Fulltextindex är inte färdigt" }
        val selected=terms.flatMap {it.lowercase().split(Regex("[^\\p{L}\\p{N}]+"))}
            .filter{cleanTerm.matches(it)}.distinct().take(8)
        if(selected.isEmpty())return@synchronized JSONArray()
        val expression=selected.joinToString(" OR "){"\"$it\""}
        val rows=JSONArray()
        val sql="""SELECT d.path,d.blob_sha,d.repo_commit,d.title,substr(d.body,1,4000)
            FROM documents_fts f JOIN documents d ON d.docid=f.docid
            WHERE documents_fts MATCH ? AND d.repo_commit=?
            ORDER BY length(d.body) ASC LIMIT ${limit.coerceIn(1,20)}"""
        db.rawQuery(sql,arrayOf(expression,meta(db,"completed").orEmpty())).use{c->
            while(c.moveToNext())rows.put(JSONObject()
                .put("path",c.getString(0)).put("sha",c.getString(1))
                .put("commit",c.getString(2)).put("title",c.getString(3))
                .put("excerpt",c.getString(4)))
        }
        rows
    }
}
