package se.lobbamannen.nexushub.app
import android.app.Activity
import android.app.Application
import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.provider.CalendarContract
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowContentResolver
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(application=Application::class,sdk=[34])
class PhoneCalendarLocationTest {
 class LocalCalendar:ContentProvider(){
  override fun onCreate()=true
  override fun query(uri:Uri,projection:Array<out String>?,selection:String?,selectionArgs:Array<out String>?,sortOrder:String?):Cursor {
   val cols=projection!!
   val values=mapOf<String,Any>("event_id" to 1L,"begin" to Instant.parse("2026-11-11T09:30:00Z").toEpochMilli(),"end" to Instant.parse("2026-11-11T10:30:00Z").toEpochMilli(),"allDay" to 0,"title" to "Testmöte","calendar_id" to 1L,"calendar_displayName" to "Lokal testkalender","calendar_color" to 0xff4466,"eventTimezone" to "Europe/Stockholm","eventLocation" to "Testlokal")
   return MatrixCursor(cols).apply{addRow(cols.map{values[it]}.toTypedArray())}
  }
  override fun getType(uri:Uri):String?=null
  override fun insert(uri:Uri,values:ContentValues?):Uri?=null
  override fun delete(uri:Uri,selection:String?,selectionArgs:Array<out String>?)=0
  override fun update(uri:Uri,values:ContentValues?,selection:String?,selectionArgs:Array<out String>?)=0
 }
 @Test fun rangeIncludesLocalLocationWithoutExtraDetailQuery(){
  ShadowContentResolver.registerProviderInternal(CalendarContract.AUTHORITY,LocalCalendar())
  val activity=Robolectric.buildActivity(Activity::class.java).setup().get()
  val result=PhoneCalendar(activity).range(JSONObject().put("from","2026-11-01").put("toExclusive","2026-12-01").put("zone","Europe/Stockholm").put("sourceIds",JSONArray().put("1")))
  val event=result.getJSONArray("events").getJSONObject(0)
  assertEquals("Testlokal",event.getString("location"));assertEquals("Testmöte",event.getString("title"));assertTrue(result.getBoolean("complete"))
 }
}
