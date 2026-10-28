package se.lobbamannen.nexushub.app.weather

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

internal fun JSONObject.value(key:String,value:Any?):JSONObject=put(key,value?:JSONObject.NULL)
internal fun epoch(s:String):Long=Instant.parse(s).toEpochMilli()
data class WeatherLocation(val name:String,val latitude:Double,val longitude:Double,val timeZone:String) {
 init { require(name.isNotBlank()&&name.length<=120);require(latitude.isFinite()&&latitude in -90.0..90.0);require(longitude.isFinite()&&longitude in -180.0..180.0);ZoneId.of(timeZone) }
 fun json()=JSONObject().put("name",name).put("latitude",latitude).put("longitude",longitude).put("timeZone",timeZone)
 fun key()=String.format(Locale.US,"%.4f,%.4f,%s",latitude,longitude,timeZone)
 companion object {
  val DEFAULT=WeatherLocation("Västra Torup",56.15,13.48333,"Europe/Stockholm")
  fun from(j:JSONObject)=WeatherLocation(j.getString("name").trim(),j.getDouble("latitude"),j.getDouble("longitude"),j.getString("timeZone"))
 }
}
data class WeatherPoint(val time:Long,val temperature:Double?,val wind:Double?,val gust:Double?,val windDirection:Double?,val humidity:Double?,val precipitation:Double?,val precipitationHours:Double?,val probability:Double?,val condition:String) {
 fun json(location:WeatherLocation):JSONObject=JSONObject().put("time",time).value("temperature",temperature).value("wind",wind).value("gust",gust).value("windDirection",windDirection).value("humidity",humidity).value("precipitation",precipitation).value("precipitationHours",precipitationHours).value("probability",probability).put("condition",condition).put("isDay",WeatherMath.isDay(time,location))
}
data class WeatherSnapshot(val provider:String,val referenceTime:Long,val points:List<WeatherPoint>)
object WeatherParser {
 private fun n(j:JSONObject,k:String,min:Double,max:Double):Double? { val v=j.optDouble(k,Double.NaN);return v.takeIf {it.isFinite()&&it!=9999.0&&it in min..max} }
 private fun smhiSymbol(n:Int)=when(n){1,2->"clear";3,4->"partly_cloudy";5,6->"cloudy";7->"fog";8,9,10,18,19,20->"rain";11,21->"thunder";12,13,14,22,23,24->"sleet";15,16,17,25,26,27->"snow";else->"unknown"}
 private fun metSymbol(s:String)=when {"thunder" in s->"thunder";"sleet" in s->"sleet";"snow" in s->"snow";"rain" in s->"rain";"fog" in s->"fog";s.startsWith("clearsky")||s.startsWith("fair")->"clear";s.startsWith("partlycloudy")->"partly_cloudy";s.startsWith("cloudy")->"cloudy";else->"unknown"}
 fun parse(provider:String,body:String,location:WeatherLocation):WeatherSnapshot {
  val root=JSONObject(body);val met=provider=="metno";require(met||provider=="smhi")
  val properties=if(met)root.getJSONObject("properties") else root
  if(met) { val u=properties.getJSONObject("meta").getJSONObject("units");require(u.getString("air_temperature")=="celsius"&&u.getString("wind_speed")=="m/s"&&u.getString("precipitation_amount")=="mm"&&u.getString("relative_humidity")=="%") }
  val reference=epoch(if(met)properties.getJSONObject("meta").getString("updated_at") else root.getString("referenceTime"))
  val a=properties.getJSONArray(if(met)"timeseries" else "timeSeries");require(a.length() in 1..500)
  val points=(0 until a.length()).map { index ->
   run { val row=a.getJSONObject(index);val time=epoch(row.getString(if(met)"time" else "time"));val data=row.getJSONObject("data")
    val d=if(met)data.getJSONObject("instant").getJSONObject("details") else data
    val interval=if(met) listOf(1,6,12).firstOrNull {data.optJSONObject("next_${it}_hours")!=null} else null
    val period=interval?.let {data.getJSONObject("next_${it}_hours")}
    val rain=if(met)period?.optJSONObject("details") else d
    val hours=if(met)interval?.toDouble() else ((time-epoch(row.getString("intervalParametersStartTime")))/3600000.0).takeIf {it>0&&it<=24}
    WeatherPoint(time,n(d,"air_temperature",-100.0,65.0),n(d,"wind_speed",0.0,150.0),n(d,"wind_speed_of_gust",0.0,180.0),n(d,"wind_from_direction",0.0,360.0),n(d,"relative_humidity",0.0,100.0),rain?.let {n(it,if(met)"precipitation_amount" else "precipitation_amount_mean",0.0,3000.0)},hours,rain?.let {n(it,if(met)"probability_of_precipitation" else "probability_of_precipitation",0.0,100.0)},if(met)metSymbol(period?.optJSONObject("summary")?.optString("symbol_code")?:"") else smhiSymbol(d.optInt("symbol_code")))
   }
  }.distinctBy {it.time}.sortedBy {it.time}
  require(points.any {it.temperature!=null}) {"Forecast has no valid temperatures"}
  return WeatherSnapshot(provider,reference,points)
 }
}
