package se.lobbamannen.nexushub.app.battery
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import se.lobbamannen.nexushub.battery.*
import java.text.SimpleDateFormat
import java.util.*

class BatteryStore(c:Context) {
 private val app=c.applicationContext
 companion object {private val lock=Any()}
 val prefs=c.getSharedPreferences("nexus_battery_phone_v1",Context.MODE_PRIVATE)
 fun snapshot()=BatterySnapshot.decode(prefs.getString("snapshot","") ?: "",System.currentTimeMillis())
 fun configuration()=batteryConfiguration(prefs)
 fun interval()=configuration().interval
 fun paused()=configuration().quietHours().isPaused(System.currentTimeMillis(),java.time.ZoneId.systemDefault())
 fun configurationConfirmed()=node().isNotBlank() && prefs.getString("configurationAckNode","")==node() && prefs.getString("configurationAck","")==configuration().encode()
 fun updateConfiguration(config:BatteryConfiguration)=synchronized(lock){saveBatteryConfiguration(prefs,config.copy(revision=maxOf(System.currentTimeMillis(),configuration().revision+1)))}
 fun clearRequest()=synchronized(lock){check(prefs.edit().putLong("requestAt",0).putString("requestId","").putString("error","").commit())}
 fun node()=prefs.getString("node","").orEmpty()
 fun accept(node:String,s:BatterySnapshot):Boolean = synchronized(lock) {
  if(node!=node() || !s.valid(System.currentTimeMillis()) || !supersedes(s,snapshot()))return@synchronized false
  check(prefs.edit().putString("snapshot",s.encode()).putLong("receivedAt",System.currentTimeMillis()).putString("error","").apply{if(s.requestId.isNotBlank() && s.requestId==prefs.getString("requestId","")){putLong("requestAt",0);putString("requestId","")}}.commit());true
 }
 fun select(node:String)=synchronized(lock){if(node!=node())check(prefs.edit().putString("node",node).remove("configurationAck").remove("configurationAckNode").remove("snapshot").putLong("requestAt",0).putString("requestId","").putString("error","").commit())}
 fun log(stage:String,message:String)=synchronized(lock){val old=journal();val next=JSONArray();for(i in maxOf(0,old.length()-19) until old.length())next.put(old.getJSONObject(i));next.put(JSONObject().put("at",System.currentTimeMillis()).put("stage",stage).put("message",message.take(120)));check(prefs.edit().putString("journal",next.toString()).commit());se.lobbamannen.nexushub.app.recordNativeActivity(app,"system","battery_"+stage,if(stage in setOf("failure","timeout"))"failed" else if(stage=="request")"pending" else "succeeded",message.take(120))}
 fun beginRequest(node:String):String=synchronized(lock){
  if(node!=node())return@synchronized ""
  val id=UUID.randomUUID().toString();check(prefs.edit().putString("requestId",id).putLong("requestAt",System.currentTimeMillis()).putString("error","").commit());id
 }
 fun timeout(id:String):Boolean=synchronized(lock){
  if(id.isBlank() || id!=prefs.getString("requestId","") || requestStatus()!="timeout")return@synchronized false
  check(prefs.edit().putString("error","Klockan har inte svarat ännu. Senaste mätningen visas.").putLong("requestAt",0).putString("requestId","").commit());true
 }
 fun unavailable(message:String)=synchronized(lock){check(prefs.edit().putString("error",message).commit())}
 fun journal()=try{JSONArray(prefs.getString("journal","[]"))}catch(_:Exception){JSONArray()}
 fun label(time:Long)=if(time<=0)"Ingen mätning" else SimpleDateFormat("HH:mm",Locale("sv","SE")).format(Date(time))
 fun requestStatus():String {val at=prefs.getLong("requestAt",0);return if(at==0L)"idle" else if(System.currentTimeMillis()-at>60000)"timeout" else "pending"}
}
