package se.lobbamannen.nexushub.battery
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import java.util.UUID
import kotlin.math.roundToInt
object LocalBattery {
 fun read(context:Context):BatterySnapshot? {
  val i=context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
  val level=i.getIntExtra(BatteryManager.EXTRA_LEVEL,-1);val scale=i.getIntExtra(BatteryManager.EXTRA_SCALE,-1)
  if(level<0 || scale<=0 || level>scale)return null
  return BatterySnapshot(UUID.randomUUID().toString(),(100.0*level/scale).roundToInt(),i.getIntExtra(BatteryManager.EXTRA_STATUS,1),i.getIntExtra(BatteryManager.EXTRA_PLUGGED,0),System.currentTimeMillis())
 }
}
