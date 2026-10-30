package se.lobbamannen.nexushub.app

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import org.json.JSONObject

/**
 * Deterministic safety gate. Unknown hardware readings never masquerade as healthy
 * readings; a missing signal is explicitly unknown, while verifiably critical
 * battery/thermal/memory state defers native generation.
 */
internal object IntelligenceResourcePolicy {
    private const val MIN_MEMORY_BYTES=512L*1024*1024
    fun snapshot(context:Context):JSONObject {
        val power=context.getSystemService(PowerManager::class.java)
        val manager=context.getSystemService(ActivityManager::class.java)
        val memory=ActivityManager.MemoryInfo()
        manager?.getMemoryInfo(memory)
        val battery=try {
            context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        }catch(_:Exception){null}
        val level=battery?.getIntExtra(BatteryManager.EXTRA_LEVEL,-1)?:-1
        val scale=battery?.getIntExtra(BatteryManager.EXTRA_SCALE,-1)?:-1
        val percent=if(level>=0&&scale>0)(level*100/scale) else -1
        val status=battery?.getIntExtra(BatteryManager.EXTRA_STATUS,-1)?:-1
        val charging=status==BatteryManager.BATTERY_STATUS_CHARGING||
            status==BatteryManager.BATTERY_STATUS_FULL
        val thermal=if(Build.VERSION.SDK_INT>=29)power?.currentThermalStatus?:-1 else -1
        val lowBattery=percent in 0..7&&!charging
        val highThermal=Build.VERSION.SDK_INT>=29 &&
            thermal>=PowerManager.THERMAL_STATUS_SEVERE
        val lowMemory=manager!=null&&(memory.lowMemory || memory.availMem<MIN_MEMORY_BYTES)
        val reason=when{
            lowBattery->"Batterinivån är under 8 %. Arbetet återupptas när resurser finns."
            highThermal->"Telefonen är för varm för tung lokal modellkörning."
            lowMemory->"För lite tillgängligt RAM för säker modellkörning."
            else->""
        }
        return JSONObject()
            .put("allowed",reason.isEmpty())
            .put("reason",reason)
            .put("batteryPercent",percent)
            .put("charging",charging)
            .put("thermalStatus",thermal)
            .put("availableRamBytes",if(manager!=null)memory.availMem else -1L)
            .put("memoryLow",lowMemory)
    }
}
