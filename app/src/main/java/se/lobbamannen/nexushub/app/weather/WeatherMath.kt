package se.lobbamannen.nexushub.app.weather

import org.json.JSONObject
import java.time.*
import kotlin.math.*

object WeatherMath {
 const val FEELS_LIKE_METHOD="BOM apparent temperature (shade): T + 0.33e − 0.70v − 4; e = RH/100 × 6.105 × exp(17.27T/(237.7+T)), v in m/s."
 // Australian Bureau of Meteorology apparent-temperature formula, no solar-load estimate.
 fun feelsLike(p:WeatherPoint):Double? {
  val t=p.temperature?:return null;val rh=p.humidity?:return null;val wind=p.wind?:return null
  return (t+0.33*(rh/100.0*6.105*exp(17.27*t/(237.7+t)))-0.70*wind-4).takeIf {it.isFinite()}
 }
 data class Sun(val sunrise:Long?,val sunset:Long?,val polar:String?) {fun json()=JSONObject().value("sunrise",sunrise).value("sunset",sunset).value("polar",polar)}
 // NOAA/Meeus solar transit and hour angle; apparent horizon -0.833 degrees.
 fun sun(date:LocalDate,location:WeatherLocation):Sun {
  val rad=PI/180;val jd=date.atTime(12,0).toEpochSecond(ZoneOffset.UTC)/86400.0+2440587.5
  val lw= -location.longitude
  val n=round(jd-2451545.0009-lw/360)
  val js=2451545.0009+lw/360+n
  val m=((357.5291+0.98560028*(js-2451545))%360)*rad
  val c=1.9148*sin(m)+0.0200*sin(2*m)+0.0003*sin(3*m)
  val lambda=(m/rad+c+180+102.9372)*rad
  val transit=js+0.0053*sin(m)-0.0069*sin(2*lambda)
  val dec=asin(sin(lambda)*sin(23.44*rad));val lat=location.latitude*rad
  val cosHour=(sin(-0.833*rad)-sin(lat)*sin(dec))/(cos(lat)*cos(dec))
  if(cosHour < -1) return Sun(null,null,"day")
  if(cosHour > 1) return Sun(null,null,"night")
  val offset=acos(cosHour)/(2*PI)
  fun millis(j:Double)=((j-2440587.5)*86400000).toLong()
  // Anchor transit to the requested civil date (including extreme timezone offsets).
  val noon=millis(transit)
  val actual=Instant.ofEpochMilli(noon).atZone(ZoneId.of(location.timeZone)).toLocalDate()
  val shift=java.time.temporal.ChronoUnit.DAYS.between(actual,date)*86400000
  return Sun(millis(transit-offset)+shift,millis(transit+offset)+shift,null)
 }
 fun isDay(time:Long,location:WeatherLocation):Boolean {
  val s=sun(Instant.ofEpochMilli(time).atZone(ZoneId.of(location.timeZone)).toLocalDate(),location)
  return s.polar=="day"||(s.sunrise!=null&&s.sunset!=null&&time>=s.sunrise&&time<s.sunset)
 }
}
