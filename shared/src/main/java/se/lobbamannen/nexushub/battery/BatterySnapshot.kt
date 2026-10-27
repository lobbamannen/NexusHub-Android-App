package se.lobbamannen.nexushub.battery

import org.json.JSONObject

object BatteryProtocol {
 const val SNAPSHOT="/nexushub/battery/v1/snapshot"
 const val REQUEST="/nexushub/battery/v1/request"
 const val CONFIG="/nexushub/battery/v1/config"
 const val JOURNAL="/nexushub/battery/v1/journal"
 const val CAPABILITY="nexushub_battery_watch_v1"
 const val WORK="nexushub-battery-periodic-v1"
 val UUID=Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
 fun interval(value:Int)=if(value in listOf(15,30,60))value else 30
}

data class BatterySnapshot(val id:String,val percent:Int,val status:Int,val plugged:Int,val measuredAt:Long,val requestId:String="") {
 fun valid(now:Long)=(requestId.isEmpty() || BatteryProtocol.UUID.matches(requestId)) && BatteryProtocol.UUID.matches(id) && percent in 0..100 && status in 1..5 && plugged in listOf(0,1,2,4,8) && measuredAt in 1..(now+600000)
 fun freshness(now:Long,intervalMinutes:Int):String {val age=(now-measuredAt).coerceAtLeast(0);return if(age<=(BatteryProtocol.interval(intervalMinutes)+10)*60000L)"fresh" else if(age<7200000L)"delayed" else "stale"}
 fun encode()=JSONObject().put("v",1).put("id",id).put("percent",percent).put("status",status).put("plugged",plugged).put("measuredAt",measuredAt).put("requestId",requestId).toString()
 companion object {
  fun decode(raw:String,now:Long):BatterySnapshot?=try {
   if(raw.toByteArray().size>2048)null else {
    val j=JSONObject(raw)
    fun number(key:String):Long {val n=j.get(key);require(n is Number && n.toDouble()==n.toLong().toDouble());return n.toLong()}
    require(number("v")==1L);val p=number("percent");val s=number("status");val plugged=number("plugged")
    require(p in 0..100 && s in 1..5 && plugged in listOf(0L,1L,2L,4L,8L))
    BatterySnapshot(j.getString("id"),p.toInt(),s.toInt(),plugged.toInt(),number("measuredAt"),j.optString("requestId","")).takeIf{it.valid(now)}
   }
  }catch(_:Exception){null}
 }
}
fun supersedes(candidate:BatterySnapshot,current:BatterySnapshot?)=current==null || (candidate.id!=current.id && candidate.measuredAt>current.measuredAt)
fun eligibleDiagnostic(at:Long,enabledAt:Long,enabled:Boolean)=enabled && at>=enabledAt
