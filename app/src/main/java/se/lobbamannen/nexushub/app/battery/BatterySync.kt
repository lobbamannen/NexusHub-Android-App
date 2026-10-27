package se.lobbamannen.nexushub.app.battery

import android.appwidget.AppWidgetManager
import android.content.*
import androidx.core.content.ContextCompat
import androidx.work.*
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.*
import org.json.JSONArray
import org.json.JSONObject
import se.lobbamannen.nexushub.battery.*
import java.util.concurrent.TimeUnit

object BatterySync {
 @Volatile private var initialized=false
 @Synchronized fun initialize(c:Context) {
  if(initialized)return;initialized=true
  val receiver=object:BroadcastReceiver(){override fun onReceive(context:Context,intent:Intent){if(BatteryWidgetProvider.ids(context).isNotEmpty())try{BatteryWidgetProvider.render(context)}catch(_:Exception){}}}
  ContextCompat.registerReceiver(c.applicationContext,receiver,IntentFilter(Intent.ACTION_BATTERY_CHANGED),ContextCompat.RECEIVER_NOT_EXPORTED)
  if(BatteryStore(c).prefs.getBoolean("started",false))schedule(c)
 }
 fun schedule(c:Context) {
  BatteryStore(c).prefs.edit().putBoolean("started",true).apply()
  WorkManager.getInstance(c).enqueueUniquePeriodicWork(BatteryProtocol.WORK,ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<BatterySyncWorker>(15,TimeUnit.MINUTES).setInputData(workDataOf("trigger" to "periodic")).build())
 }
 fun refresh(c:Context,request:Boolean=true){schedule(c);WorkManager.getInstance(c).enqueueUniqueWork("nexus-battery-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<BatterySyncWorker>().setInputData(workDataOf("trigger" to if(request)"manual" else "reconcile")).build())}
 fun nodes(c:Context):List<Node> = Tasks.await(Wearable.getCapabilityClient(c).getCapability(BatteryProtocol.CAPABILITY,CapabilityClient.FILTER_REACHABLE),12,TimeUnit.SECONDS).nodes.sortedBy{it.id}
 fun configure(c:Context) {
  val bytes=JSONObject().put("v",1).put("interval",BatteryStore(c).interval()).put("updatedAt",System.currentTimeMillis()).toString().toByteArray(Charsets.UTF_8)
  Tasks.await(Wearable.getDataClient(c).putDataItem(PutDataRequest.create(BatteryProtocol.CONFIG).setData(bytes).setUrgent()),12,TimeUnit.SECONDS)
 }
 fun reconcile(c:Context) {
  val buffer=Tasks.await(Wearable.getDataClient(c).dataItems,12,TimeUnit.SECONDS)
  try{for(item in buffer)accept(c,item)}finally{buffer.release()}
 }
 fun accept(c:Context,item:DataItem) {
  val node=item.uri.host ?: return;val path=item.uri.path
  if(node!=BatteryStore(c).node())return
  if(path==BatteryProtocol.SNAPSHOT){val raw=item.data ?: return;if(raw.size>2048)return;val snapshot=BatterySnapshot.decode(String(raw,Charsets.UTF_8),System.currentTimeMillis()) ?: return
   if(BatteryStore(c).accept(node,snapshot)){BatteryStore(c).log("receive","Klockans mätning mottagen: ${snapshot.percent} %");BatteryTelemetry.event("phone_received",snapshot,phonePercent=LocalBattery.read(c)?.percent);BatteryWidgetProvider.render(c)}
  }else if(path==BatteryProtocol.JOURNAL)BatteryTelemetry.journal(c,node,item.data)
 }
 fun state(c:Context):JSONObject {
  val store=BatteryStore(c);val s=store.snapshot();val phone=LocalBattery.read(c)
  return JSONObject().put("supported",true).put("phonePercent",phone?.percent ?: JSONObject.NULL).put("watchPercent",s?.percent ?: JSONObject.NULL).put("charging",s?.status==2).put("measuredAt",s?.measuredAt ?: 0).put("freshness",s?.freshness(System.currentTimeMillis(),store.interval()) ?: "unknown").put("interval",store.interval()).put("background",store.prefs.getString("background","glass")).put("request",store.requestStatus()).put("error",store.prefs.getString("error","")).put("selected",store.node().isNotBlank()).put("nodes",JSONArray(store.prefs.getString("nodes","[]"))).put("journal",store.journal())
 }
}
class BatterySyncWorker(c:Context,p:WorkerParameters):Worker(c,p) {
 override fun doWork():Result {
  val c=applicationContext;val store=BatteryStore(c);val manual=inputData.getString("trigger")=="manual"
  try {
   // Render phone battery even when Play services or the watch is unavailable.
   BatteryWidgetProvider.render(c)
   val nodes=BatterySync.nodes(c);val list=JSONArray();nodes.forEach{list.put(JSONObject().put("id",it.id).put("label",it.displayName.take(60)).put("nearby",it.isNearby))};store.prefs.edit().putString("nodes",list.toString()).putLong("checkedAt",System.currentTimeMillis()).apply()
   if(store.node().isBlank() && nodes.size==1)store.select(nodes.single().id)
   BatterySync.reconcile(c)
   if(manual) {
    BatterySync.configure(c)
    val chosen=nodes.firstOrNull{it.id==store.node()}
    if(chosen==null){store.prefs.edit().putString("error",if(nodes.size>1)"Välj klocka i Batteriwidget." else "Ingen NexusHub-klockapp nåbar. Installera och öppna klockappen.").putLong("requestAt",0).apply();BatteryTelemetry.event("connection",outcome="unavailable")}
    else {
     store.prefs.edit().putLong("requestAt",System.currentTimeMillis()).putString("error","").commit()
     Tasks.await(Wearable.getMessageClient(c).sendMessage(chosen.id,BatteryProtocol.REQUEST,JSONObject().put("v",1).toString().toByteArray(Charsets.UTF_8)),12,TimeUnit.SECONDS)
     store.log("request","Ny mätning begärd från klockan");BatteryTelemetry.event("request",outcome="pending")
     WorkManager.getInstance(c).enqueueUniqueWork("nexus-battery-timeout",ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<BatteryTimeoutWorker>().setInitialDelay(65,TimeUnit.SECONDS).build())
    }
   }
   BatteryWidgetProvider.render(c);return Result.success()
  }catch(_:Exception){store.prefs.edit().putString("error","Klockans anslutning kunde inte kontrolleras. Försök igen.").apply();store.log("failure","Anslutning eller Play services misslyckades");BatteryTelemetry.event("failure",outcome="failed");BatteryWidgetProvider.render(c);return if(runAttemptCount<2)Result.retry() else Result.failure()}
 }
}
class BatteryTimeoutWorker(c:Context,p:WorkerParameters):Worker(c,p) {
 override fun doWork():Result {val store=BatteryStore(applicationContext);if(store.requestStatus()=="timeout"){store.prefs.edit().putString("error","Klockan har inte svarat ännu. Senaste mätningen visas.").putLong("requestAt",0).apply();store.log("timeout","Ingen ny mätning inom en minut");BatteryTelemetry.event("request",outcome="timeout");BatteryWidgetProvider.render(applicationContext)};return Result.success()}
}
class PhoneBatteryListener:WearableListenerService() {
 override fun onDataChanged(events:DataEventBuffer){for(event in events)if(event.type==DataEvent.TYPE_CHANGED)try{BatterySync.accept(this,event.dataItem)}catch(_:Exception){BatteryStore(this).log("failure","Mätningen kunde inte sparas")}}
}
class BatteryBootReceiver:BroadcastReceiver() {
 override fun onReceive(c:Context,i:Intent){if(i.action in listOf(Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED) && BatteryStore(c).prefs.getBoolean("started",false)){BatterySync.schedule(c);BatterySync.refresh(c,false)}}
}
