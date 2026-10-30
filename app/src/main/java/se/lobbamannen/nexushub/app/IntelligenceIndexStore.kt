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
        "nexus_intelligence_index_v1.db",null,2) {
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
        }
        override fun onUpgrade(db:SQLiteDatabase,old:Int,new:Int) {
            if(old==1 && new==2) {
                db.execSQL("""CREATE TABLE staging_documents(
                    path TEXT PRIMARY KEY,blob_sha TEXT NOT NULL,repo_commit TEXT NOT NULL,
                    title TEXT NOT NULL,body TEXT NOT NULL
                )""")
                db.execSQL("DELETE FROM meta WHERE key='working'")
            } else error("Unsupported index schema migration")
        }
    }
    companion object {
        private val lock=Any()
        private val commitPattern=Regex("[0-9a-f]{40}")
        private val cleanTerm=Regex("[\\p{L}\\p{N}]{2,40}")
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
        write {db ->
            check(meta(db,"working")==commit)
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
        return status()
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
