package se.lobbamannen.nexushub.app.weather

import android.app.PendingIntent
import android.appwidget.*
import android.content.*
import android.graphics.*
import android.os.Bundle
import android.widget.RemoteViews
import androidx.work.*
import org.json.JSONObject
import se.lobbamannen.nexushub.app.MainActivity
import se.lobbamannen.nexushub.app.R
import kotlin.math.roundToInt
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.TimeUnit

class WeatherWidgetProvider:AppWidgetProvider(){
 override fun onUpdate(c:Context,m:AppWidgetManager,ids:IntArray){renderAll(c);scheduleDate(c);WeatherRuntime.initialize(c);WeatherRuntime.refresh(c)}
 override fun onAppWidgetOptionsChanged(c:Context,m:AppWidgetManager,id:Int,o:Bundle){renderAll(c)}
 override fun onDeleted(c:Context,ids:IntArray){if(widgetIds(c).isEmpty())WorkManager.getInstance(c).cancelUniqueWork(DATE_WORK)}
 override fun onReceive(c:Context,i:Intent){super.onReceive(c,i);if(i.action in listOf(WeatherRuntime.ACTION_CHANGED,Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED,Intent.ACTION_TIME_CHANGED,Intent.ACTION_TIMEZONE_CHANGED,Intent.ACTION_DATE_CHANGED,Intent.ACTION_LOCALE_CHANGED)){renderAll(c);scheduleDate(c);if(widgetIds(c).isNotEmpty())WeatherRuntime.initialize(c)}}
 companion object {
  private const val DATE_WORK="nexushub-weather-date"
  fun widgetIds(c:Context)=AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c,WeatherWidgetProvider::class.java))
  fun scheduleDate(c:Context){if(widgetIds(c).isEmpty())return;val now=ZonedDateTime.now(ZoneId.of("Europe/Stockholm"));val next=now.toLocalDate().plusDays(1).atStartOfDay(now.zone).toInstant().toEpochMilli();WorkManager.getInstance(c).enqueueUniqueWork(DATE_WORK,ExistingWorkPolicy.REPLACE,OneTimeWorkRequestBuilder<WeatherDateWorker>().setInitialDelay((next-System.currentTimeMillis()).coerceAtLeast(1),TimeUnit.MILLISECONDS).build())}
  internal fun destination(value:String)=value.takeIf{it in setOf("kalender","vader","ideer","filmer","serier","berattelser")}
  private fun open(c:Context,route:String,request:Int)=PendingIntent.getActivity(c,request,Intent(c,MainActivity::class.java).putExtra("nexus.destination",route).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  private fun number(j:JSONObject?,key:String):Double?=if(j==null||j.isNull(key))null else j.optDouble(key,Double.NaN).takeIf{it.isFinite()&&it in -100.0..70.0}
  internal fun degrees(value:Double?)=value?.let{if(it.roundToInt()<0)"−${kotlin.math.abs(it.roundToInt())}°" else "${it.roundToInt()}°"} ?: "—"
  fun renderAll(c:Context){
   val ids=widgetIds(c);if(ids.isEmpty())return
   val manager=AppWidgetManager.getInstance(c);val state=WeatherRuntime.state(c)
   for(id in ids)manager.updateAppWidget(id,views(c,state,manager.getAppWidgetOptions(id)))
  }
  internal fun views(c:Context,state:JSONObject,options:Bundle,date:LocalDate=LocalDate.now()):RemoteViews {
val current=state.optJSONObject("current");val locale=Locale("sv","SE")
   val condition=current?.optString("condition")?:"unknown";val isDay=current?.optBoolean("isDay",true)?:true;val label=conditionLabel(condition)
   val place=state.optJSONObject("location")?.optString("name")?:"Västra Torup";val zone=try{ZoneId.of(state.optJSONObject("location")?.optString("timeZone")?:"Europe/Stockholm")}catch(_:Exception){ZoneId.systemDefault()}
   val fetched=state.optLong("fetchedAt",0);val fetchedText=if(fetched>0)DateTimeFormatter.ofPattern("d/M HH:mm",locale).format(Instant.ofEpochMilli(fetched).atZone(zone)) else ""
    val height=options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,150)
    val activity=WidgetActivity.counts(WidgetActivity.read(c))
    val contentHeight=height-(if(activity.isNotEmpty())31 else 0)
    val compact=contentHeight<125||options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,320)<250
    val v=RemoteViews(c.packageName,R.layout.widget_weather)
    v.setTextViewText(R.id.weather_widget_month,date.format(DateTimeFormatter.ofPattern("MMM yyyy",locale)).uppercase(locale));v.setTextViewText(R.id.weather_widget_date,date.dayOfMonth.toString());v.setTextViewText(R.id.weather_widget_weekday,date.format(DateTimeFormatter.ofPattern("EEEE",locale)))
    v.setTextViewText(R.id.weather_widget_temperature,degrees(number(current,"temperature")));v.setTextViewText(R.id.weather_widget_condition,if(current==null)"Öppna väder" else label);v.setTextViewText(R.id.weather_widget_place,place)
    v.setTextViewText(R.id.weather_widget_status,if(fetched==0L)"Ingen prognos ännu" else (if(state.optString("status")=="stale")"Äldre · " else "Prognos · ")+fetchedText)
    v.setTextViewTextSize(R.id.weather_widget_brand,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)10f else 12f);v.setTextViewTextSize(R.id.weather_widget_date,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)40f else if(contentHeight<145)54f else 66f);v.setTextViewTextSize(R.id.weather_widget_temperature,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)28f else if(contentHeight<145||degrees(number(current,"temperature")).length>=4)36f else 44f)
    for(viewId in listOf(R.id.weather_widget_month,R.id.weather_widget_weekday))v.setTextViewTextSize(viewId,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)11f else 13f)
    v.setTextViewTextSize(R.id.weather_widget_condition,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)10f else 12f)
    v.setTextViewTextSize(R.id.weather_widget_place,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)9f else 11f)
    v.setTextViewTextSize(R.id.weather_widget_status,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)8f else 9f)
    if(compact)for(viewId in listOf(R.id.weather_widget_condition,R.id.weather_widget_place,R.id.weather_widget_status))v.setViewPadding(viewId,0,(c.resources.displayMetrics.density).roundToInt(),0,0)
    if(contentHeight<95){
     v.setTextViewTextSize(R.id.weather_widget_date,android.util.TypedValue.COMPLEX_UNIT_SP,24f)
     for(viewId in listOf(R.id.weather_widget_month,R.id.weather_widget_weekday))v.setTextViewTextSize(viewId,android.util.TypedValue.COMPLEX_UNIT_SP,9f)
     for(viewId in listOf(R.id.weather_widget_condition,R.id.weather_widget_place,R.id.weather_widget_status))v.setViewVisibility(viewId,android.view.View.GONE)
    }
    v.setImageViewBitmap(R.id.weather_widget_icon,WeatherWidgetGlyph.draw(condition,isDay))
    v.setOnClickPendingIntent(R.id.weather_widget_calendar,open(c,"kalender",201));v.setOnClickPendingIntent(R.id.weather_widget_forecast,open(c,"vader",202))
    v.setContentDescription(R.id.weather_widget_calendar,date.format(DateTimeFormatter.ofPattern("EEEE d MMMM yyyy",locale))+". Öppna NexusHubs kalender.")
    v.setContentDescription(R.id.weather_widget_forecast,"${degrees(number(current,"temperature"))}, $label, $place. Prognos hämtad $fetchedText. Öppna NexusHubs väder.")
    v.setViewVisibility(R.id.weather_widget_activity,if(activity.isEmpty())android.view.View.GONE else android.view.View.VISIBLE)
    val slots=listOf(
     Triple("ideas",R.id.widget_activity_ideas,R.id.widget_activity_ideas_count),
     Triple("films",R.id.widget_activity_films,R.id.widget_activity_films_count),
     Triple("series",R.id.widget_activity_series,R.id.widget_activity_series_count),
     Triple("stories",R.id.widget_activity_stories,R.id.widget_activity_stories_count))
    val routes=mapOf("ideas" to "ideer","films" to "filmer","series" to "serier","stories" to "berattelser")
    val labels=mapOf("ideas" to "idéer","films" to "filmer","series" to "serier","stories" to "berättelser")
    for((index,slot) in slots.withIndex()){
     val (key,viewId,countId)=slot;val count=activity[key]?:0
     v.setViewVisibility(viewId,if(count>0)android.view.View.VISIBLE else android.view.View.GONE)
     v.setTextViewText(countId,if(count>999)"999+" else count.toString())
     v.setContentDescription(viewId,"$count nya ${labels[key]} idag. Öppna NexusHub.")
     v.setOnClickPendingIntent(viewId,open(c,routes.getValue(key),210+index))
    }
    return v
  }
  internal fun conditionLabel(s:String)=when(s){"clear"->"Klart";"partly_cloudy"->"Växlande molnighet";"cloudy"->"Mulet";"fog"->"Dimma";"rain"->"Regn";"snow"->"Snö";"sleet"->"Snöblandat regn";"thunder"->"Åska";else->"Väderuppgift saknas"}
 }
}
class WeatherDateWorker(c:Context,p:WorkerParameters):Worker(c,p){override fun doWork():Result {WeatherWidgetProvider.renderAll(applicationContext);WeatherWidgetProvider.scheduleDate(applicationContext);return Result.success()}}

/** Original vector-like glyphs drawn once per render, never a downloaded Samsung asset. */
internal object WeatherWidgetGlyph {
 fun draw(condition:String,day:Boolean):Bitmap {
  val bitmap=Bitmap.createBitmap(96,80,Bitmap.Config.ARGB_8888);val c=Canvas(bitmap);val p=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=Color.rgb(216,185,118);style=Paint.Style.STROKE;strokeWidth=3.5f;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND}
  if(condition=="clear"){
   if(day){c.drawCircle(48f,36f,17f,p);for(i in 0..7){val angle=i*Math.PI/4;c.drawLine((48+25*kotlin.math.cos(angle)).toFloat(),(36+25*kotlin.math.sin(angle)).toFloat(),(48+31*kotlin.math.cos(angle)).toFloat(),(36+31*kotlin.math.sin(angle)).toFloat(),p)}}
   else{val path=Path();path.moveTo(61f,12f);path.cubicTo(25f,7f,17f,61f,54f,61f);path.cubicTo(69f,61f,77f,52f,80f,42f);path.cubicTo(53f,51f,40f,29f,61f,12f);c.drawPath(path,p)}
  }else if(condition=="unknown"){c.drawCircle(48f,36f,22f,p);p.style=Paint.Style.FILL;p.textSize=31f;p.textAlign=Paint.Align.CENTER;c.drawText("?",48f,47f,p)}
  else{
   if(condition=="partly_cloudy"){if(day)c.drawCircle(66f,22f,13f,p) else {val moon=Path();moon.moveTo(70f,8f);moon.cubicTo(49f,9f,50f,36f,72f,35f);moon.cubicTo(61f,29f,59f,18f,70f,8f);c.drawPath(moon,p)}}
   val cloud=Path();cloud.moveTo(24f,53f);cloud.cubicTo(4f,48f,10f,25f,28f,29f);cloud.cubicTo(26f,4f,67f,6f,69f,32f);cloud.cubicTo(92f,30f,95f,54f,76f,55f);cloud.lineTo(24f,55f);c.drawPath(cloud,p)
   when(condition){"rain","sleet"->{for(x in listOf(32f,48f,64f))c.drawLine(x,63f,x-3,73f,p)};"snow"->{p.style=Paint.Style.FILL;for(x in listOf(32f,48f,64f))c.drawCircle(x,68f,2.7f,p)};"thunder"->{val bolt=Path();bolt.moveTo(50f,57f);bolt.lineTo(39f,69f);bolt.lineTo(51f,68f);bolt.lineTo(44f,79f);c.drawPath(bolt,p)};"fog"->{c.drawLine(21f,64f,75f,64f,p);c.drawLine(30f,73f,66f,73f,p)}}
  }
  return bitmap
 }
}
