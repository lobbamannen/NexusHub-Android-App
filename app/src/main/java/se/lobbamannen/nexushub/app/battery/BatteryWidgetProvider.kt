package se.lobbamannen.nexushub.app.battery
import android.app.PendingIntent
import android.appwidget.*
import android.content.*
import android.graphics.Color
import android.os.Bundle
import android.widget.RemoteViews
import se.lobbamannen.nexushub.app.R
import se.lobbamannen.nexushub.battery.*
import java.text.SimpleDateFormat
import java.util.*

class BatteryWidgetProvider:AppWidgetProvider() {
 override fun onUpdate(c:Context,m:AppWidgetManager,ids:IntArray){BatterySync.schedule(c);render(c);BatterySync.refresh(c)}
 override fun onAppWidgetOptionsChanged(c:Context,m:AppWidgetManager,id:Int,options:Bundle){render(c)}
 override fun onReceive(c:Context,i:Intent){super.onReceive(c,i);if(i.action==REFRESH){BatterySync.refresh(c);render(c)}}
 companion object {
  const val REFRESH="se.lobbamannen.nexushub.app.BATTERY_REFRESH"
  fun ids(c:Context)=AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c,BatteryWidgetProvider::class.java))
  fun render(c:Context) {
   val ids=ids(c);if(ids.isEmpty())return
   val manager=AppWidgetManager.getInstance(c);val store=BatteryStore(c);val phone=LocalBattery.read(c);val watch=store.snapshot();val now=System.currentTimeMillis()
   for(id in ids) {
    val width=manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,280);val compact=width<240
    val views=RemoteViews(c.packageName,R.layout.widget_battery)
    val bg=when(store.prefs.getString("background","glass")){"transparent"->R.drawable.battery_transparent;"black"->R.drawable.battery_black;else->R.drawable.battery_glass}
    views.setInt(R.id.battery_root,"setBackgroundResource",bg)
    val date=watch?.let{SimpleDateFormat(if(now-it.measuredAt>=86400000)"d/M HH:mm" else "HH:mm",Locale("sv","SE")).format(Date(it.measuredAt))}
    val freshness=watch?.freshness(now,store.interval()) ?: "unknown"
    val suffix=when{store.requestStatus()=="pending"->"uppdaterar"+(date?.let{" · $it"} ?: "");store.prefs.getString("error","").orEmpty().isNotBlank() && watch!=null->"senaste · $date";watch==null->"inväntar klocka";freshness=="stale"->"gammal · $date";freshness=="delayed"->"senast $date";watch.status==2->"laddar · $date";else->date}
    views.setTextViewText(R.id.phone_label,if(phone?.status==2)"Telefon · laddar" else if(compact)"Telefon" else "Galaxy S26 Ultra")
    views.setTextViewText(R.id.watch_label,(if(compact)"Klocka" else "Watch8 Classic")+" · "+suffix)
    views.setTextViewText(R.id.phone_percent,phone?.let{"${it.percent}%"} ?: "—")
    views.setTextViewText(R.id.watch_percent,watch?.let{"${it.percent}%"} ?: "—")
    views.setProgressBar(R.id.phone_progress,100,phone?.percent ?: 0,false);views.setProgressBar(R.id.watch_progress,100,watch?.percent ?: 0,false)
    views.setTextColor(R.id.watch_percent,if(freshness in listOf("stale","delayed"))Color.rgb(198,171,116) else Color.WHITE)
    views.setTextViewTextSize(R.id.phone_label,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)10f else 12f)
    views.setTextViewTextSize(R.id.watch_label,android.util.TypedValue.COMPLEX_UNIT_SP,if(compact)10f else 12f)
    val refresh=PendingIntent.getBroadcast(c,101,Intent(c,BatteryWidgetProvider::class.java).setAction(REFRESH),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val settings=PendingIntent.getActivity(c,102,Intent(c,BatterySettingsActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    views.setOnClickPendingIntent(R.id.phone_row,settings);views.setOnClickPendingIntent(R.id.watch_row,refresh)
    views.setContentDescription(R.id.phone_row,"Telefon ${phone?.percent ?: "okänt"} procent. Öppna widgetinställningar.")
    views.setContentDescription(R.id.watch_row,"Klocka ${watch?.percent ?: "okänt"} procent, $suffix. Begär uppdatering.")
    manager.updateAppWidget(id,views)
   }
   // Accepted RemoteViews update is not proof that LockStar displayed it.
   val key=(watch?.id ?: "unknown")+":"+(phone?.percent ?: -1)
   if(store.prefs.getString("lastRenderTrace","")!=key){store.prefs.edit().putString("lastRenderTrace",key).apply();BatteryTelemetry.event("widget_updated",watch,phonePercent=phone?.percent)}
  }
 }
}
