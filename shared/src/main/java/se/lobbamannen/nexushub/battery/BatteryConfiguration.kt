package se.lobbamannen.nexushub.battery

import org.json.JSONObject

data class BatteryConfiguration(val revision:Long=1,val interval:Int=30,val quietEnabled:Boolean=true,val quietStart:Int=1200,val quietEnd:Int=360) {
 fun quietHours()=BatteryQuietHours(quietEnabled,quietStart,quietEnd)
 fun encode()=JSONObject().put("v",2).put("revision",revision).put("interval",interval).put("quietEnabled",quietEnabled).put("quietStart",quietStart).put("quietEnd",quietEnd).toString()
 fun supersedes(current:BatteryConfiguration)=revision>current.revision || this==current
 companion object {
  fun decode(raw:ByteArray?):BatteryConfiguration?=try{
   require(raw!=null && raw.size<=1024)
   val j=JSONObject(String(raw,Charsets.UTF_8))
   fun number(key:String):Long {val n=j.get(key);require(n is Number && n.toDouble()==n.toLong().toDouble());return n.toLong()}
   require(number("v")==2L)
   val revision=number("revision");val interval=number("interval");val start=number("quietStart");val end=number("quietEnd");val enabled=j.get("quietEnabled")
   require(revision>0 && interval in listOf(15L,30L,60L) && enabled is Boolean && start in 0..1439 && end in 0..1439 && start!=end)
   BatteryConfiguration(revision,interval.toInt(),enabled,start.toInt(),end.toInt())
  }catch(_:Exception){null}
 }
}
