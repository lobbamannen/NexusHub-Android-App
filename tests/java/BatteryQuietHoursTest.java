import se.lobbamannen.nexushub.battery.BatteryQuietHours;
import java.time.*;

public class BatteryQuietHoursTest {
 static final ZoneId ZONE=ZoneId.of("Europe/Stockholm");
 static long at(String value){return ZonedDateTime.parse(value+"[Europe/Stockholm]").toInstant().toEpochMilli();}
 static void check(boolean value){if(!value)throw new AssertionError();}
 public static void main(String[] args){
  BatteryQuietHours q=new BatteryQuietHours(true,1200,360);
  check(!q.isPaused(at("2026-10-28T19:59:59+01:00"),ZONE));
  check(q.isPaused(at("2026-10-28T20:00:00+01:00"),ZONE));
  check(q.isPaused(at("2026-10-29T00:00:00+01:00"),ZONE));
  check(q.isPaused(at("2026-10-29T05:59:59+01:00"),ZONE));
  check(!q.isPaused(at("2026-10-29T06:00:00+01:00"),ZONE));
  check(q.nextTransition(at("2026-10-28T22:00:00+01:00"),ZONE)==at("2026-10-29T06:00:00+01:00"));
  check(q.nextTransition(at("2026-10-28T06:00:00+01:00"),ZONE)==at("2026-10-28T20:00:00+01:00"));
  BatteryQuietHours day=new BatteryQuietHours(true,600,660);
  check(day.isPaused(at("2026-10-28T10:30:00+01:00"),ZONE));
  check(!day.isPaused(at("2026-10-28T11:00:00+01:00"),ZONE));
  BatteryQuietHours off=new BatteryQuietHours(false,1200,360);
  check(!off.isPaused(at("2026-10-28T22:00:00+01:00"),ZONE));check(off.nextTransition(0,ZONE)==0);
  // Follow the wall clock across both daylight-saving transitions.
  check(q.nextTransition(at("2026-10-24T22:00:00+02:00"),ZONE)==at("2026-10-25T06:00:00+01:00"));
  check(q.nextTransition(at("2026-03-28T22:00:00+01:00"),ZONE)==at("2026-03-29T06:00:00+02:00"));
  check(q.isPaused(at("2026-10-28T20:30:00+01:00"),ZONE));
  check(!q.isPaused(at("2026-10-28T20:30:00+01:00"),ZoneId.of("UTC")));
  BatteryQuietHours overlap=new BatteryQuietHours(true,150,180);
  check(overlap.nextTransition(at("2026-10-25T02:45:00+02:00"),ZONE)==at("2026-10-25T02:00:00+01:00"));
  BatteryQuietHours gap=new BatteryQuietHours(true,150,240);
  check(gap.nextTransition(at("2026-03-29T01:45:00+01:00"),ZONE)==at("2026-03-29T03:00:00+02:00"));
  for(int[] invalid:new int[][]{{-1,360},{1200,1440},{360,360}}){try{new BatteryQuietHours(true,invalid[0],invalid[1]);throw new AssertionError("accepted invalid time");}catch(IllegalArgumentException expected){}}
  check(q.label().equals("20:00–06:00"));
  System.out.println("BatteryQuietHours: boundaries, overnight/daytime, disabled, DST and validation passed");
 }
}
