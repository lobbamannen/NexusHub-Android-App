package se.lobbamannen.nexushub.app.weather

import android.content.Context
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

/** Persist only counts, never content or credentials. Old days are never rendered. */
internal object WidgetActivity {
 private val keys=listOf("ideas","films","series","stories")
 fun today()=LocalDate.now(ZoneId.of("Europe/Stockholm")).toString()
 fun counts(snapshot:JSONObject,day:String=today()):Map<String,Int>{
  if(snapshot.optString("day")!=day)return emptyMap()
  val counts=snapshot.optJSONObject("counts")?:return emptyMap()
  return keys.mapNotNull {key-> val value=counts.opt(key);val n=(value as? Number)?.toDouble();if(n!=null&&n.isFinite()&&n>0&&n<=Int.MAX_VALUE&&n%1.0==0.0)key to n.toInt() else null}.toMap()
 }
 fun read(c:Context)=try{JSONObject(c.getSharedPreferences("widget_activity",0).getString("snapshot","{}")!!)}catch(_:Exception){JSONObject()}
 @Synchronized fun save(c:Context,input:JSONObject):JSONObject {
  val day=input.getString("day");require(day.isEmpty()||day==today())
  val observed=input.getLong("observedAt");require(observed>0&&observed<=System.currentTimeMillis()+60000)
  if(observed<read(c).optLong("observedAt"))return JSONObject().put("saved",false)
  val safe=JSONObject().put("day",day).put("observedAt",observed).put("counts",JSONObject(counts(input)))
  check(c.getSharedPreferences("widget_activity",0).edit().putString("snapshot",safe.toString()).commit())
  WeatherWidgetProvider.renderAll(c)
  return JSONObject().put("saved",true)
 }
}
