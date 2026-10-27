package se.lobbamannen.nexushub.app
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

/** Wall-clock schedule: recalculate each day instead of drifting across DST. */
object WatchSchedule {
 val zone:ZoneId=ZoneId.of("Europe/Stockholm")
 private val time:LocalTime=LocalTime.of(15,0)
 fun day(now:Instant):String=now.atZone(zone).toLocalDate().toString()
 fun next(now:Instant):Instant {
  val local=now.atZone(zone)
  val today=local.toLocalDate().atTime(time).atZone(zone).toInstant()
  return if(today>now)today else local.toLocalDate().plusDays(1).atTime(time).atZone(zone).toInstant()
 }
 fun due(now:Instant,lastDay:String?):Boolean=now.atZone(zone).toLocalTime()>=time && day(now)!=lastDay
}
