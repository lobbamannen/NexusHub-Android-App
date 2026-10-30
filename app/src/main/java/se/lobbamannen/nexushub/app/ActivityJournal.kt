package se.lobbamannen.nexushub.app

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.format.DateTimeFormatterBuilder
import java.util.Locale

/** Private, permanent domain-operation journal. It is never sent to analytics. */
class ActivityJournal(context:Context) {
 private class Database(context:Context):SQLiteOpenHelper(context.applicationContext,"nexus_activity_v1.db",null,1){
  override fun onCreate(db:SQLiteDatabase){
   db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY,at TEXT NOT NULL,category TEXT NOT NULL,status TEXT NOT NULL,search TEXT NOT NULL,event_json TEXT NOT NULL)")
   db.execSQL("CREATE INDEX activity_time ON events(at DESC,id DESC)");db.execSQL("CREATE INDEX activity_category ON events(category,at DESC)");db.execSQL("CREATE INDEX activity_status ON events(status,at DESC)")
  }
  override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int)=Unit
 }
 companion object {
  private var shared:Database?=null
  private var owner:Context?=null
  @Synchronized private fun database(context:Context):Database {
   val app=context.applicationContext
   if(owner!==app){shared?.close();shared=Database(app);owner=app}
   return checkNotNull(shared)
  }
 }
 private val helper=database(context)
 private val categories=setOf("inbox","ideas","todos","media","stories","calendar","documents","connections","economy","sync","settings","system")
 private val statuses=setOf("local","pending","succeeded","failed","conflict","cancelled")
 private val forbidden=Regex("""^(?:.*(?:authorization|token|password|secret|credential|api[_-]?key|private[_-]?key|signing[_-]?key).*|key|body|text|content|base64|original|payload)$""",RegexOption.IGNORE_CASE)
 private val navigation=Regex("""(?:^|[._-])(?:navigation|navigate|page|screen|click|view)(?:[._-]|$)""",RegexOption.IGNORE_CASE)
 private val credential=Regex("""(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{10,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/\-]+""",RegexOption.IGNORE_CASE)
 private val controls=Regex("""[\x00-\x08\x0b\x0c\x0e-\x1f]""")
 private fun safe(value:Any?,max:Int)=value?.takeUnless{it===JSONObject.NULL}?.toString().orEmpty().replace(credential,"[hemlighet dold]").replace(controls,"").take(max)
 private fun clean(value:Any?,depth:Int=0):Any? {
  if(depth>5)return "[detaljer begränsade]"
  return when(value){
   null,JSONObject.NULL->JSONObject.NULL
   is String->safe(value,1000)
   is Boolean,is Number->value
   is JSONArray->JSONArray().also{out->for(i in 0 until minOf(value.length(),100))out.put(clean(value.opt(i),depth+1))}
   is JSONObject->JSONObject().also{out->value.keys().asSequence().filterNot{forbidden.matches(it)}.take(60).forEach{key->out.put(safe(key,80),clean(value.opt(key),depth+1))}}
   else->JSONObject.NULL
  }
 }
 private fun time(value:String)=DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.parse(value))
 private fun normalize(input:JSONObject):JSONObject {
  val id=safe(input.opt("id"),200);require(id.isNotEmpty()&&id==input.optString("id"))
  val action=safe(input.opt("action"),100);require(action.isNotBlank()&&!navigation.containsMatchIn(action))
  val category=input.getString("category");val status=input.getString("status");require(category in categories&&status in statuses)
  val out=JSONObject().put("id",id).put("at",time(input.getString("at"))).put("category",category).put("action",action).put("status",status).put("source",safe(input.optString("source","app"),60))
  for((key,max)in listOf("objectType" to 80,"objectId" to 300,"title" to 300,"path" to 1600,"operationId" to 200))if(input.has(key)&&!input.isNull(key))out.put(key,safe(input.opt(key),max))
  if(input.opt("details") is JSONObject||input.opt("details") is JSONArray)out.put("details",clean(input.opt("details")))
  if(out.toString().length>24000)out.put("details",JSONObject().put("omitted",true).put("reason","Detaljerna översteg loggens storleksgräns. Händelsens identitet och resultat är bevarade."));return out
 }
 @Synchronized fun append(input:JSONObject):Boolean=try {
  val event=normalize(input);val value=event.toString();val row=ContentValues().apply{put("id",event.getString("id"));put("at",event.getString("at"));put("category",event.getString("category"));put("status",event.getString("status"));put("search",value.lowercase(Locale.forLanguageTag("sv-SE")));put("event_json",value)}
  val db=helper.writableDatabase
  val inserted=db.insertWithOnConflict("events",null,row,SQLiteDatabase.CONFLICT_IGNORE)
  check(inserted!=-1L||db.rawQuery("SELECT 1 FROM events WHERE id=?",arrayOf(event.getString("id"))).use{it.moveToFirst()})
  // An existing ID is already durably accepted; never replace its first contents.
  true
 }catch(_:Exception){false}

 @Synchronized fun query(input:JSONObject):JSONObject {
  val limit=input.optInt("limit",50).coerceIn(1,200);val clauses=mutableListOf<String>();val args=mutableListOf<String>()
  for(key in listOf("category","status")){val value=input.optString(key);if(value.isNotEmpty()){require(value in if(key=="category")categories else statuses);clauses.add("$key=?");args.add(value)}}
  if(input.optString("from").isNotEmpty()){clauses.add("at>=?");args.add(time(input.getString("from")))}
  if(input.optString("toExclusive").isNotEmpty()){clauses.add("at<?");args.add(time(input.getString("toExclusive")))}
  val search=input.optString("search").take(300).lowercase(Locale.forLanguageTag("sv-SE"))
  if(search.isNotEmpty()){clauses.add("search LIKE ? ESCAPE '\\'");args.add("%"+search.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%")}
  val db=helper.readableDatabase
  val where=if(clauses.isEmpty())"" else " WHERE "+clauses.joinToString(" AND ")
  val total=db.rawQuery("SELECT COUNT(*) FROM events"+where,args.toTypedArray()).use{it.moveToFirst();it.getInt(0)}
  if(input.optString("cursor").isNotEmpty()){
   val cursor=JSONArray(input.getString("cursor"));require(cursor.length()==2);val at=cursor.getString(0);require(time(at)==at);val id=cursor.getString(1);require(id.length<=200)
   clauses.add("(at<? OR (at=? AND id<?))");args.add(at);args.add(at);args.add(id)
  }
  val pageWhere=if(clauses.isEmpty())"" else " WHERE "+clauses.joinToString(" AND ")
  val items=JSONArray();var more=false
  db.rawQuery("SELECT event_json FROM events"+pageWhere+" ORDER BY at DESC,id DESC LIMIT "+(limit+1),args.toTypedArray()).use{cursor->while(cursor.moveToNext()){if(items.length()<limit)items.put(JSONObject(cursor.getString(0)))else more=true}}
  val next=if(more){val last=items.getJSONObject(items.length()-1);JSONArray().put(last.getString("at")).put(last.getString("id")).toString()}else JSONObject.NULL
  return JSONObject().put("items",items).put("nextCursor",next).put("total",total)
 }
 @Synchronized fun export():String {
  val items=JSONArray();var cursor:String?=null
  do{val q=JSONObject().put("limit",200);if(cursor!=null)q.put("cursor",cursor);val page=query(q);val rows=page.getJSONArray("items");for(i in 0 until rows.length())items.put(rows.getJSONObject(i));cursor=if(page.isNull("nextCursor"))null else page.getString("nextCursor")}while(cursor!=null)
  return JSONObject().put("schemaVersion",1).put("exportedAt",Instant.now().toString()).put("items",items).toString()
 }
}
