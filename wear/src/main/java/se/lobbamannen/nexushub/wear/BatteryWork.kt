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
 fun configuration(c:Context)=batteryConfiguration(prefs(c),watch=true)
 fun paused(c:Context)=configuration(c).quietHours().isPaused(System.currentTimeMillis(),java.time.ZoneId.systemDefault())
 fun schedule(c:Context) {
  prefs(c).edit().putBoolean("started",true).apply()
  val work=WorkManager.getInstance(c);val config=configuration(c)
  val next=config.quietHours().nextTransition(System.currentTimeMillis(),java.time.ZoneId.systemDefault())
  if(next==0L)work.cancelUniqueWork("nexus-battery-quiet-transition")
  else work.enqueueUniqueWork("nexus-battery-quiet-transition",ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<BatteryPauseWorker>().setInitialDelay((next-System.currentTimeMillis()).coerceAtLeast(1),TimeUnit.MILLISECONDS).build())
  if(paused(c)){work.cancelUniqueWork(BatteryProtocol.WORK);work.cancelUniqueWork("nexus-battery-now");return}
  WorkManager.getInstance(c).enqueueUniquePeriodicWork(BatteryProtocol.WORK,ExistingPeriodicWorkPolicy.UPDATE,PeriodicWorkRequestBuilder<BatteryPublishWorker>(config.interval.toLong(),TimeUnit.MINUTES).setInitialDelay(config.interval.toLong(),TimeUnit.MINUTES).setInputData(workDataOf("trigger" to "periodic")).build())
 }
 fun now(c:Context,trigger:String="manual",requestId:String="") {
  if(paused(c)){schedule(c);return}
  WorkManager.getInstance(c).enqueueUniqueWork("nexus-battery-now",ExistingWorkPolicy.APPEND_OR_REPLACE,OneTimeWorkRequestBuilder<BatteryPublishWorker>().setInputData(workDataOf("trigger" to trigger,"requestId" to requestId)).build())
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
 @Synchronized fun applyConfig(c:Context,bytes:ByteArray?) {
  val config=BatteryConfiguration.decode(bytes) ?: return
  if(!config.supersedes(configuration(c)))return
  saveBatteryConfiguration(prefs(c),config);schedule(c)
  WorkManager.getInstance(c).enqueueUniqueWork("nexus-battery-config-ack",ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<BatteryConfigAckWorker>().build())
 }

}
class BatteryPublishWorker(c:Context,p:WorkerParameters):Worker(c,p) {
 override fun doWork():Result {
  val c=applicationContext
  if(isStopped)return Result.success()
  if(BatteryWork.paused(c)){BatteryWork.schedule(c);return Result.success()}
  val snapshot=LocalBattery.read(c)?.copy(requestId=inputData.getString("requestId").orEmpty())
  if(snapshot==null){BatteryWork.log(c,"read",null,"failed");return if(!isStopped && runAttemptCount<3 && !BatteryWork.paused(c))Result.retry() else Result.failure()}
  return try {
   BatteryWork.log(c,"read",snapshot)
   val request=PutDataRequest.create(BatteryProtocol.SNAPSHOT).setData(snapshot.encode().toByteArray(Charsets.UTF_8))
   // Only actual user requests are urgent; periodic sync is batched by Play services.
   if(inputData.getString("trigger")!="periodic")request.setUrgent()
   if(isStopped || BatteryWork.paused(c))return Result.success()
   Tasks.await(Wearable.getDataClient(c).putDataItem(request),20,TimeUnit.SECONDS)
   BatteryWork.log(c,"publish",snapshot)
   BatteryWork.prefs(c).edit().putString("snapshot",snapshot.encode()).putString("error","").apply()
   val journal=JSONObject().put("v",1).put("sentAt",System.currentTimeMillis()).put("events",JSONArray(BatteryWork.prefs(c).getString("journal","[]")))
   val diagnostic=PutDataRequest.create(BatteryProtocol.JOURNAL).setData(journal.toString().toByteArray(Charsets.UTF_8))
   if(inputData.getString("trigger")!="periodic")diagnostic.setUrgent()
   if(isStopped || BatteryWork.paused(c))return Result.success()
   Tasks.await(Wearable.getDataClient(c).putDataItem(diagnostic),20,TimeUnit.SECONDS)
   Result.success()
  }catch(_:Exception){BatteryWork.log(c,"publish",snapshot,"failed");BatteryWork.prefs(c).edit().putString("error","Kunde inte synkronisera. Nytt försök görs senare.").apply();if(!isStopped && !BatteryWork.paused(c) && runAttemptCount<3)Result.retry() else Result.failure()}
 }
}
class BatteryListener:WearableListenerService() {
 override fun onMessageReceived(event:MessageEvent) {
  if(BatteryWork.paused(this))return
  if(event.path!=BatteryProtocol.REQUEST || event.data.size>512)return
  val requestId=try{val j=JSONObject(String(event.data,Charsets.UTF_8));if(j.optInt("v")!=1)return;j.getString("requestId").takeIf{BatteryProtocol.UUID.matches(it)} ?: return}catch(_:Exception){return}
  val p=BatteryWork.prefs(this);val now=System.currentTimeMillis();if(now-p.getLong("lastRequest",0)<10000)return
  p.edit().putLong("lastRequest",now).apply();BatteryWork.schedule(this);BatteryWork.now(this,"request",requestId)
 }
 override fun onDataChanged(events:DataEventBuffer){for(e in events)if(e.type==DataEvent.TYPE_CHANGED && e.dataItem.uri.path==BatteryProtocol.CONFIG)BatteryWork.applyConfig(this,e.dataItem.data)}
}
class BatteryBootReceiver:BroadcastReceiver() {
 override fun onReceive(c:Context,i:Intent){if(i.action in listOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED,Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED) && BatteryWork.prefs(c).getBoolean("started",false)){BatteryWork.schedule(c);BatteryWork.now(c,"boot")}}
}

class BatteryPauseWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result {BatteryWork.schedule(applicationContext);if(!BatteryWork.paused(applicationContext))BatteryWork.now(applicationContext,"periodic");return Result.success()}
}
class BatteryConfigAckWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result=try{
  val request=PutDataRequest.create(BatteryProtocol.CONFIG_ACK).setData(BatteryWork.configuration(applicationContext).encode().toByteArray(Charsets.UTF_8)).setUrgent()
  Tasks.await(Wearable.getDataClient(applicationContext).putDataItem(request),12,TimeUnit.SECONDS)
  Result.success()
 }catch(_:Exception){if(runAttemptCount<2)Result.retry() else Result.failure()}
}
