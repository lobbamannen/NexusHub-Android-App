package se.lobbamannen.nexushub.app.weather

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.AtomicFile
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

object WeatherRuntime {
 const val ACTION_CHANGED="se.lobbamannen.nexushub.app.WEATHER_CHANGED"
 private const val WIDGET_CLASS="se.lobbamannen.nexushub.app.weather.WeatherWidgetProvider"
 @Volatile var listener:(()->Unit)?=null
 @Volatile private var visible=false
 @Volatile private var repository:WeatherRepository?=null
 private fun repo(c:Context):WeatherRepository {
  repository?.let {return it}
  return synchronized(this) {
   repository?:run {
    val app=c.applicationContext
    val file=AtomicFile(File(app.filesDir,"nexus-weather-v1.json"))
    WeatherRepository(object:WeatherStore {
     override fun read():String?=try {file.openRead().use {input->require(input.available()<=20*1024*1024);input.readBytes().toString(Charsets.UTF_8)}}catch(_:Exception){null}
     override fun write(value:String) {val output=file.startWrite();try {output.write(value.toByteArray(Charsets.UTF_8));file.finishWrite(output)}catch(e:Exception){file.failWrite(output);throw e}}
    },changed={
     try {listener?.invoke()}catch(_:Exception){}
     app.sendBroadcast(Intent(ACTION_CHANGED).setComponent(ComponentName(app.packageName,WIDGET_CLASS)))
    },metAllowedNow={visible||AppWidgetManager.getInstance(app).getAppWidgetIds(ComponentName(app.packageName,WIDGET_CLASS)).isNotEmpty()}).also {repository=it}
   }
  }
 }
 fun initialize(c:Context) {repo(c);schedule(c)}
 fun state(c:Context):JSONObject=repo(c).state()
 fun refresh(c:Context,manual:Boolean=false) {
  repo(c)
  val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
  WorkManager.getInstance(c.applicationContext).enqueueUniqueWork("nexushub-weather-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<WeatherRefreshWorker>().setConstraints(constraints).setInputData(workDataOf("manual" to manual)).build())
 }
 fun setLocation(c:Context,params:JSONObject):JSONObject {
  val location=WeatherLocation.from(params.optJSONObject("location")?:params)
  repo(c).setLocation(location)
  // A running old-location worker rejects its result. APPEND_OR_REPLACE guarantees a new
  // worker reads the new selection even when KEEP would discard this refresh request.
  WorkManager.getInstance(c.applicationContext).enqueueUniqueWork("nexushub-weather-now",ExistingWorkPolicy.APPEND_OR_REPLACE,OneTimeWorkRequestBuilder<WeatherRefreshWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())
  return state(c)
 }
 fun search(c:Context,query:String):JSONArray=repo(c).search(query)
 fun foreground(c:Context,active:Boolean) {visible=active;if(active){initialize(c);refresh(c)}}
 fun schedule(c:Context) {
  WorkManager.getInstance(c.applicationContext).enqueueUniquePeriodicWork("nexushub-weather-periodic",ExistingPeriodicWorkPolicy.KEEP,PeriodicWorkRequestBuilder<WeatherRefreshWorker>(2,TimeUnit.HOURS,20,TimeUnit.MINUTES).setInitialDelay(kotlin.random.Random.nextLong(120,721),TimeUnit.SECONDS).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build())
 }
 @Synchronized internal fun perform(c:Context,manual:Boolean) {
  val widgets=AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c.packageName,WIDGET_CLASS)).isNotEmpty()
  repo(c).refresh(manual,visible||widgets)
 }
}
class WeatherRefreshWorker(context:Context,params:WorkerParameters):Worker(context,params) {
 override fun doWork():Result {try {WeatherRuntime.perform(applicationContext,inputData.getBoolean("manual",false))}catch(_:Exception){};return Result.success()}
}
