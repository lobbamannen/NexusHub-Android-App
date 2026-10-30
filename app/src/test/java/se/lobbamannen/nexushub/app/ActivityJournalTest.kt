package se.lobbamannen.nexushub.app

import android.app.Application
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application=Application::class,sdk=[34])
class ActivityJournalTest {
 private fun event(id:String)=JSONObject().put("id",id).put("at","2026-10-30T12:00:00.000Z").put("category","inbox").put("action","document.added").put("status","succeeded").put("source","app").put("title","Forskningsrapport")
 @Test fun immutableDeduplicationSurvivesNewJournalInstance(){
  val context=RuntimeEnvironment.getApplication();context.deleteDatabase("nexus_activity_v1.db")
  val journal=ActivityJournal(context);assertTrue(journal.append(event("a")));assertTrue(journal.append(event("a").put("title","Replacement")))
  val page=ActivityJournal(context).query(JSONObject());assertEquals(1,page.getInt("total"));assertEquals("Forskningsrapport",page.getJSONArray("items").getJSONObject(0).getString("title"))
 }
 @Test fun stablePaginationAndLiteralSearchCannotInjectSql(){
  val context=RuntimeEnvironment.getApplication();context.deleteDatabase("nexus_activity_v1.db");val journal=ActivityJournal(context)
  for(id in listOf("a","b","c"))assertTrue(journal.append(event(id)))
  val first=journal.query(JSONObject().put("limit",2));assertEquals("c",first.getJSONArray("items").getJSONObject(0).getString("id"))
  val second=journal.query(JSONObject().put("limit",2).put("cursor",first.getString("nextCursor")));assertEquals("a",second.getJSONArray("items").getJSONObject(0).getString("id"));assertTrue(second.isNull("nextCursor"));assertEquals(3,second.getInt("total"))
  assertEquals(0,journal.query(JSONObject().put("search","%' OR 1=1 --")).getInt("total"));assertEquals(3,journal.query(JSONObject()).getInt("total"))
 }
 @Test fun secretFieldsAndBodiesAreExcludedButStateChangesRemain(){
  val context=RuntimeEnvironment.getApplication();context.deleteDatabase("nexus_activity_v1.db");val journal=ActivityJournal(context)
  assertTrue(journal.append(event("private").put("details",JSONObject().put("token","secret").put("body","report").put("after",JSONObject().put("read",true)).put("nested",JSONObject().put("authorization","Bearer secret")))))
  val details=journal.query(JSONObject()).getJSONArray("items").getJSONObject(0).getJSONObject("details");assertFalse(details.has("token"));assertFalse(details.has("body"));assertTrue(details.getJSONObject("after").getBoolean("read"));assertFalse(details.getJSONObject("nested").has("authorization"))
  assertFalse(journal.append(event("navigation").put("action","page.view")))
 }
 @Test fun bearerAndCamelCaseCredentialsAreRemovedWithoutCorruptingWords(){
  val context=RuntimeEnvironment.getApplication();context.deleteDatabase("nexus_activity_v1.db");val journal=ActivityJournal(context)
  val details=JSONObject().put("githubToken","private").put("api_key","private").put("nested",JSONObject().put("clientSecret","private").put("safe","yes"))
  assertTrue(journal.append(event("redaction").put("title","Before Bearer abcdefghijklmnopqrstuvwxyz after").put("details",details)))
  val stored=journal.query(JSONObject()).getJSONArray("items").getJSONObject(0)
  assertEquals("Before [hemlighet dold] after",stored.getString("title"));assertFalse(stored.toString().contains("private"));assertEquals("yes",stored.getJSONObject("details").getJSONObject("nested").getString("safe"))
 }
 @Test fun dateAndStatusFiltersNormalizeInstants(){
  val context=RuntimeEnvironment.getApplication();context.deleteDatabase("nexus_activity_v1.db");val journal=ActivityJournal(context)
  assertTrue(journal.append(event("before").put("at","2026-10-29T23:59:59Z")))
  assertTrue(journal.append(event("inside").put("at","2026-10-30T12:00:00+00:00").put("status","failed")))
  assertTrue(journal.append(event("after").put("at","2026-10-31T00:00:00Z")))
  val page=journal.query(JSONObject().put("from","2026-10-30T00:00:00Z").put("toExclusive","2026-10-31T00:00:00Z").put("status","failed"))
  assertEquals(1,page.getInt("total"));assertEquals("inside",page.getJSONArray("items").getJSONObject(0).getString("id"))
 }

}
