package se.lobbamannen.nexushub.app.battery
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import se.lobbamannen.nexushub.app.NexusTelemetry
import se.lobbamannen.nexushub.battery.*

object BatteryTelemetry {
 fun event(stage:String,s:BatterySnapshot?=null,outcome:String="success",phonePercent:Int?=null) {
  try{val p=JSONObject().put("stage",stage).put("outcome",outcome)
   if(s!=null)p.put("snapshot_id",s.id).put("watch_percent",s.percent.toString()).put("charging",s.status==2).put("measured_at",s.measuredAt)
   if(phonePercent!=null)p.put("phone_percent",phonePercent.toString())
   NexusTelemetry.capture("battery_flow",p)
  }catch(_:Exception){}
 }
 @Synchronized fun journal(c:Context,node:String,raw:ByteArray?) {
  if(raw==null || raw.size>24000)return
  val store=BatteryStore(c);if(node!=store.node())return
  try{
   val j=JSONObject(String(raw,Charsets.UTF_8));if(j.optInt("v")!=1)return
   val entries=j.optJSONArray("events") ?: return;val seen=store.prefs.getStringSet("seenDiagnostics",emptySet()).orEmpty().toMutableSet()
   val enabled=NexusTelemetry.status().optBoolean("enabled");val since=NexusTelemetry.enabledSince()
   for(i in 0 until minOf(entries.length(),24)) {
    val e=entries.optJSONObject(i) ?: continue;val id=e.optString("eventId");if(!BatteryProtocol.UUID.matches(id) || id in seen)continue
    seen.add(id);val at=e.optLong("at");if(!eligibleDiagnostic(at,since,enabled) || at>System.currentTimeMillis()+600000)continue
    val stage=e.optString("stage");val outcome=e.optString("outcome");if(stage !in listOf("read","publish") || outcome !in listOf("success","failed"))continue
    val snapshot=BatterySnapshot(e.optString("snapshotId"),e.optInt("percent",-1),e.optInt("status",1),0,e.optLong("measuredAt"))
    if(!snapshot.valid(System.currentTimeMillis()))continue
    event("watch_$stage",snapshot,outcome)
   }
   store.prefs.edit().putStringSet("seenDiagnostics",seen.takeLastSet(96)).apply()
  }catch(_:Exception){}
 }
 private fun Set<String>.takeLastSet(n:Int)=toList().takeLast(n).toSet()
}
