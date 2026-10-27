package se.lobbamannen.nexushub.app.battery
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import se.lobbamannen.nexushub.battery.*
import java.text.SimpleDateFormat
import java.util.*

class BatteryStore(c:Context) {
 val prefs=c.getSharedPreferences("nexus_battery_phone_v1",Context.MODE_PRIVATE)
 fun snapshot()=BatterySnapshot.decode(prefs.getString("snapshot","") ?: "",System.currentTimeMillis())
 fun interval()=BatteryProtocol.interval(prefs.getInt("interval",30))
 fun node()=prefs.getString("node","").orEmpty()
 @Synchronized fun accept(node:String,s:BatterySnapshot):Boolean {
  if(node!=node() || !s.valid(System.currentTimeMillis()) || !supersedes(s,snapshot()))return false
  check(prefs.edit().putString("snapshot",s.encode()).putLong("receivedAt",System.currentTimeMillis()).putString("error","").putLong("requestAt",0).commit());return true
 }
 fun select(node:String){if(node!=node())check(prefs.edit().putString("node",node).remove("snapshot").remove("seenDiagnostics").putLong("requestAt",0).putString("error","").commit())}
 @Synchronized fun log(stage:String,message:String){val old=journal();val next=JSONArray();for(i in maxOf(0,old.length()-19) until old.length())next.put(old.getJSONObject(i));next.put(JSONObject().put("at",System.currentTimeMillis()).put("stage",stage).put("message",message.take(120)));check(prefs.edit().putString("journal",next.toString()).commit())}
 fun journal()=try{JSONArray(prefs.getString("journal","[]"))}catch(_:Exception){JSONArray()}
 fun label(time:Long)=if(time<=0)"Ingen mätning" else SimpleDateFormat("HH:mm",Locale("sv","SE")).format(Date(time))
 fun requestStatus():String {val at=prefs.getLong("requestAt",0);return if(at==0L)"idle" else if(System.currentTimeMillis()-at>60000)"timeout" else "pending"}
}
