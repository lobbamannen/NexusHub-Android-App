package se.lobbamannen.nexushub.app.battery

import android.content.Context
import androidx.work.*
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/** Only a single boundary job is needed while the watch feature is paused. */
object BatteryPause {
 const val TRANSITION="nexus-battery-quiet-transition"
 fun schedule(c:Context) {
  val store=BatteryStore(c);val config=store.configuration();val work=WorkManager.getInstance(c)
  if(store.paused()){
   work.cancelUniqueWork(se.lobbamannen.nexushub.battery.BatteryProtocol.WORK)
   work.cancelUniqueWork("nexus-battery-now")
   work.cancelUniqueWork("nexus-battery-timeout")
   store.clearRequest()
  }
  val next=config.quietHours().nextTransition(System.currentTimeMillis(),ZoneId.systemDefault())
  if(next==0L)work.cancelUniqueWork(TRANSITION)
  else work.enqueueUniqueWork(TRANSITION,ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<BatteryPauseWorker>().setInitialDelay((next-System.currentTimeMillis()).coerceAtLeast(1),TimeUnit.MILLISECONDS).build())
 }
}
class BatteryPauseWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result {
  BatterySync.schedule(applicationContext)
  BatteryWidgetProvider.render(applicationContext)
  if(!BatteryStore(applicationContext).paused())BatterySync.refresh(applicationContext,false)
  return Result.success()
 }
}
class BatteryConfigWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result=try{
  val c=applicationContext;val store=BatteryStore(c)
  if(store.node().isBlank()){
   val nodes=BatterySync.nodes(c)
   store.prefs.edit().putString("nodes",org.json.JSONArray(nodes.map{org.json.JSONObject().put("id",it.id).put("label",it.displayName.take(60))}).toString()).apply()
   if(nodes.size==1)store.select(nodes.single().id)
  }
  BatterySync.configure(c);BatterySync.reconcile(c);BatteryWidgetProvider.render(c);Result.success()
 }catch(_:Exception){if(runAttemptCount<2)Result.retry() else Result.failure()}
}
