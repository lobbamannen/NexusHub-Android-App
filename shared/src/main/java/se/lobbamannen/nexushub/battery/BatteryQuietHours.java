package se.lobbamannen.nexushub.battery;

import java.time.*;
import java.time.zone.ZoneOffsetTransition;
import java.util.*;

/** Local wall-clock window. Start is inclusive and end exclusive. */
public final class BatteryQuietHours {
 public final boolean enabled;
 public final int startMinute;
 public final int endMinute;
 public BatteryQuietHours(boolean enabled,int startMinute,int endMinute){
  if(startMinute<0 || startMinute>=1440 || endMinute<0 || endMinute>=1440 || startMinute==endMinute)throw new IllegalArgumentException("Invalid quiet hours");
  this.enabled=enabled;this.startMinute=startMinute;this.endMinute=endMinute;
 }
 public boolean isPaused(long now,ZoneId zone){
  if(!enabled)return false;
  ZonedDateTime local=Instant.ofEpochMilli(now).atZone(zone);int minute=local.getHour()*60+local.getMinute();
  return startMinute>endMinute ? minute>=startMinute || minute<endMinute : minute>=startMinute && minute<endMinute;
 }
 public String label(){return String.format(Locale.ROOT,"%02d:%02d–%02d:%02d",startMinute/60,startMinute%60,endMinute/60,endMinute%60);}
 public long nextTransition(long now,ZoneId zone){
  if(!enabled)return 0;
  TreeSet<Long> candidates=new TreeSet<>();LocalDate date=Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
  for(int day=0;day<4;day++)for(int minute:new int[]{startMinute,endMinute}){
   LocalDateTime local=date.plusDays(day).atTime(minute/60,minute%60);
   candidates.add(local.atZone(zone).toInstant().toEpochMilli());
   // Both occurrences of a time in the autumn clock overlap matter.
   for(ZoneOffset offset:zone.getRules().getValidOffsets(local))candidates.add(local.toInstant(offset).toEpochMilli());
  }
  ZoneOffsetTransition transition=zone.getRules().nextTransition(Instant.ofEpochMilli(now));
  if(transition!=null)candidates.add(transition.getInstant().toEpochMilli());
  for(long candidate:candidates)if(candidate>now && isPaused(candidate-1,zone)!=isPaused(candidate,zone))return candidate;
  throw new IllegalStateException("No quiet-hours boundary");
 }
}
