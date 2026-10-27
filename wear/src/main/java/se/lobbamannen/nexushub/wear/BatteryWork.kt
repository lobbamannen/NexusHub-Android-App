package se.lobbamannen.nexushub.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.*
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.*
import org.json.JSONArray
import org.json.JSONObject
import se.lobbamannen.nexushub.battery.*
import java.util.UUID
import java.util.concurrent.TimeUnit

object BatteryWork {
 fun prefs(c:Context)=c.getSharedPreferences("nexus_battery_wear_v1",Context.MODE_PRIVATE)
 fun schedule(c:Context,minutes:Int=BatteryProtocol.interval(prefs(c).getInt("interval",30))) {
  prefs(c).edit().putBoolean("started",true).putInt("interval",BatteryProtocol.interval(minutes)).apply()
  WorkManager.getInstance(c).enqueueUniquePeriodicWork(BatteryProtocol.WORK,ExistingPeriodicWorkPolicy.UPDATE,PeriodicWorkRequestBuilder<BatteryPublishWorker>(BatteryProtocol.interval(minutes).toLong(),TimeUnit.MINUTES).setInputData(workDataOf("trigger" to "periodic")).build())
 }
 fun now(c:Context,trigger:String="manual") {
  WorkManager.getInstance(c).enqueueUniqueWork("nexus-battery-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<BatteryPublishWorker>().setInputData(workDataOf("trigger" to trigger)).build())
 }
 @Synchronized fun log(c:Context,stage:String,s:BatterySnapshot?,outcome:String="success") {
  val p=prefs(c);val old=try{JSONArray(p.getString("journal","[]"))}catch(_:Exception){JSONArray()};val next=JSONArray()
  for(i in maxOf(0,old.length()-23) until old.length())next.put(old.getJSONObject(i))
  next.put(JSONObject().put("eventId",UUID.randomUUID().toString()).put("snapshotId",s?.id ?: UUID.randomUUID().toString()).put("stage",stage).put("outcome",outcome).put("percent",s?.percent ?: -1).put("status",s?.status ?: 1).put("at",System.currentTimeMillis()).put("measuredAt",s?.measuredAt ?: 0))
  check(p.edit().putString("journal",next.toString()).commit())
 }
 fun configure(c:Context) {
  val buffer=Tasks.await(Wearable.getDataClient(c).dataItems,15,TimeUnit.SECONDS)
  try{for(item in buffer)if(item.uri.path==BatteryProtocol.CONFIG)applyConfig(c,item.data)}finally{buffer.release()}
 }
 fun applyConfig(c:Context,bytes:ByteArray?) {
  if(bytes==null || bytes.size>1024)return
  try{val j=JSONObject(String(bytes,Charsets.UTF_8));if(j.optInt("v")!=1)return;val n=j.optInt("interval");if(n !in listOf(15,30,60))return;if(n!=prefs(c).getInt("interval",0))schedule(c,n)}catch(_:Exception){}
 }
}
class BatteryPublishWorker(c:Context,p:WorkerParameters):Worker(c,p) {
 override fun doWork():Result {
  val c=applicationContext;val snapshot=LocalBattery.read(c)
  if(snapshot==null){BatteryWork.log(c,"read",null,"failed");return Result.retry()}
  return try {
   BatteryWork.log(c,"read",snapshot)
   val request=PutDataRequest.create(BatteryProtocol.SNAPSHOT).setData(snapshot.encode().toByteArray(Charsets.UTF_8))
   // Only actual user requests are urgent; periodic sync is batched by Play services.
   if(inputData.getString("trigger")!="periodic")request.setUrgent()
   Tasks.await(Wearable.getDataClient(c).putDataItem(request),20,TimeUnit.SECONDS)
   BatteryWork.log(c,"publish",snapshot)
   BatteryWork.prefs(c).edit().putString("snapshot",snapshot.encode()).putString("error","").apply()
   val journal=JSONObject().put("v",1).put("sentAt",System.currentTimeMillis()).put("events",JSONArray(BatteryWork.prefs(c).getString("journal","[]")))
   val diagnostic=PutDataRequest.create(BatteryProtocol.JOURNAL).setData(journal.toString().toByteArray(Charsets.UTF_8))
   if(inputData.getString("trigger")!="periodic")diagnostic.setUrgent()
   Tasks.await(Wearable.getDataClient(c).putDataItem(diagnostic),20,TimeUnit.SECONDS)
   Result.success()
  }catch(_:Exception){BatteryWork.log(c,"publish",snapshot,"failed");BatteryWork.prefs(c).edit().putString("error","Kunde inte synkronisera. Nytt försök görs senare.").apply();if(runAttemptCount<3)Result.retry() else Result.failure()}
 }
}
class BatteryListener:WearableListenerService() {
 override fun onMessageReceived(event:MessageEvent) {
  if(event.path!=BatteryProtocol.REQUEST || event.data.size>512)return
  try{if(JSONObject(String(event.data,Charsets.UTF_8)).optInt("v")!=1)return}catch(_:Exception){return}
  val p=BatteryWork.prefs(this);val now=System.currentTimeMillis();if(now-p.getLong("lastRequest",0)<10000)return
  p.edit().putLong("lastRequest",now).apply();BatteryWork.schedule(this);BatteryWork.now(this,"request")
 }
 override fun onDataChanged(events:DataEventBuffer){for(e in events)if(e.type==DataEvent.TYPE_CHANGED && e.dataItem.uri.path==BatteryProtocol.CONFIG)BatteryWork.applyConfig(this,e.dataItem.data)}
}
class BatteryBootReceiver:BroadcastReceiver() {
 override fun onReceive(c:Context,i:Intent){if(i.action in listOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED) && BatteryWork.prefs(c).getBoolean("started",false)){BatteryWork.schedule(c);BatteryWork.now(c,"boot")}}
}
