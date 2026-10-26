package se.lobbamannen.nexushub.app

import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.provider.CalendarContract as C
import org.json.JSONArray
import org.json.JSONObject
import java.time.*
import java.util.concurrent.ConcurrentHashMap

/** No provider payload is written to disk. Handles only occurrence IDs issued by this adapter. */
class PhoneCalendar(private val activity: Activity) {
    private data class Occurrence(val event: Long, val begin: Long, val end: Long)
    private val issued = ConcurrentHashMap<String, Occurrence>()
    @Volatile var revision = 0L
    fun invalidate() { revision++; issued.clear() }
    fun sources(): JSONArray {
        val out = JSONArray()
        activity.contentResolver.query(C.Calendars.CONTENT_URI, arrayOf("_id", "calendar_displayName", "calendar_color", "visible"), null, null, "_id ASC")?.use { c ->
            while(c.moveToNext()) out.put(JSONObject().put("id",c.getLong(0).toString()).put("label",c.getString(1) ?: "Kalender").put("color", color(c.getInt(2))).put("visible",c.getInt(3)!=0))
        }
        return out
    }
    private fun color(n:Int) = String.format("#%06X", n and 0xffffff)
    fun range(p:JSONObject):JSONObject {
        val from=LocalDate.parse(p.getString("from")); val to=LocalDate.parse(p.getString("toExclusive")); val zone=ZoneId.of(p.getString("zone"))
        require(to.isAfter(from) && java.time.temporal.ChronoUnit.DAYS.between(from,to)<=62) { "Datumintervallet får vara högst 62 dagar" }
        val ids=p.getJSONArray("sourceIds"); require(ids.length()<=100)
        val selected=(0 until ids.length()).map { ids.getString(it).also { id -> require(id.matches(Regex("[0-9]+"))) } }
        val start=from.atStartOfDay(zone).toInstant().toEpochMilli(); val end=to.atStartOfDay(zone).toInstant().toEpochMilli()
        val queryRevision=revision
        val signature= "$from|$to|$zone|${selected.sorted()}|$queryRevision"
        val cursor=p.optString("cursor"); val offset=if(cursor.isBlank()) 0 else { val parts=cursor.split(":"); require(parts.size==2 && parts[0]==signature.hashCode().toString()); parts[1].toInt().also { require(it>=0) } }
        val result=JSONArray(); var more=false; var index=0
        if(selected.isNotEmpty()) {
            val uri=C.Instances.CONTENT_URI.buildUpon().also { ContentUris.appendId(it,start); ContentUris.appendId(it,end) }.build()
            val projection=arrayOf("event_id","begin","end","allDay","title","calendar_id","calendar_displayName","calendar_color","eventTimezone","originalInstanceTime")
            val selection="calendar_id IN (${selected.joinToString(","){"?"}}) AND (eventStatus IS NULL OR eventStatus != 2) AND (selfAttendeeStatus IS NULL OR selfAttendeeStatus != 2) AND begin < ? AND end > ?"
            activity.contentResolver.query(uri,projection,selection,(selected+listOf(end.toString(),start.toString())).toTypedArray(),"begin ASC, event_id ASC, end ASC")?.use { c ->
                while(c.moveToNext()) {
                    if(index++<offset) continue
                    if(result.length()>=250) { more=true; break }
                    val event=c.getLong(0); val begin=c.getLong(1); val finish=c.getLong(2)
                    val original=if(c.isNull(9)) begin else c.getLong(9)
                    val id="$event:$original:$begin"; issued[id]=Occurrence(event,begin,finish)
                    val temporal=if(c.getInt(3)!=0) JSONObject().put("kind","allDay").put("startDate",Instant.ofEpochMilli(begin).atZone(ZoneOffset.UTC).toLocalDate()).put("endDateExclusive",Instant.ofEpochMilli(finish).atZone(ZoneOffset.UTC).toLocalDate()) else JSONObject().put("kind","timed").put("startsAt",Instant.ofEpochMilli(begin)).put("endsAt",Instant.ofEpochMilli(finish)).put("originalZone",c.getString(8))
                    result.put(JSONObject().put("version",1).put("id",id).put("source","phone").put("sourceId",c.getLong(5).toString()).put("sourceLabel",c.getString(6)).put("sourceColor",color(c.getInt(7))).put("title",c.getString(4) ?: "").put("temporal",temporal).put("editableInNexus",false))
                }
            }
        }
        check(revision==queryRevision) { "Kalendern ändrades under läsningen. Uppdatera vyn." }
        return JSONObject().put("events",result).put("revision",revision).put("complete",!more).put("generatedAt",Instant.now()).also { if(more) it.put("nextCursor","${signature.hashCode()}:${offset+result.length()}") }
    }
    fun details(id:String):JSONObject {
        val item=issued[id] ?: error("Händelsen behöver hämtas igen")
        val out=JSONObject().put("description",JSONObject.NULL).put("location",JSONObject.NULL)
        activity.contentResolver.query(ContentUris.withAppendedId(C.Events.CONTENT_URI,item.event),arrayOf("description","eventLocation"),null,null,null)?.use { c -> if(c.moveToFirst()) { out.put("description",c.getString(0) ?: JSONObject.NULL); out.put("location",c.getString(1) ?: JSONObject.NULL) } }
        return out
    }
    fun open(id:String) { val item=issued[id] ?: error("Händelsen behöver hämtas igen"); activity.startActivity(Intent(Intent.ACTION_VIEW,ContentUris.withAppendedId(C.Events.CONTENT_URI,item.event)).putExtra(C.EXTRA_EVENT_BEGIN_TIME,item.begin).putExtra(C.EXTRA_EVENT_END_TIME,item.end)) }
    fun insert(p:JSONObject) {
        val t=p.getJSONObject("temporal"); val kind=t.getString("kind");require(kind in setOf("allDay","timed","releaseDate"))
        val all=kind!="timed"
        val begin=if(all) LocalDate.parse(t.getString(if(kind=="releaseDate")"date" else "startDate")).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else Instant.parse(t.getString("startsAt")).toEpochMilli()
        val end=if(kind=="releaseDate")LocalDate.parse(t.getString("date")).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else if(all) LocalDate.parse(t.getString("endDateExclusive")).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() else Instant.parse(t.getString("endsAt")).toEpochMilli()
        require(end>begin)
        activity.startActivity(Intent(Intent.ACTION_INSERT,C.Events.CONTENT_URI).putExtra(C.Events.TITLE,p.getString("title").take(500)).putExtra(C.Events.DESCRIPTION,p.optString("notes").take(10000)).putExtra(C.EXTRA_EVENT_BEGIN_TIME,begin).putExtra(C.EXTRA_EVENT_END_TIME,end).putExtra(C.Events.ALL_DAY,all))
    }
}
