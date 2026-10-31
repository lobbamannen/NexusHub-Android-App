package se.lobbamannen.nexushub.app
import android.app.Application
import android.content.ComponentCallbacks2
class NexusHubApplication:Application() {
    override fun onTrimMemory(level:Int) {
        super.onTrimMemory(level)
        GemmaRuntime.get(this).onTrimMemory(level)
    }
    override fun onLowMemory() {
        super.onLowMemory()
        GemmaRuntime.get(this).onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
    }
    override fun onCreate(){super.onCreate();NexusTelemetry.initialize(this);java.util.concurrent.Executors.newSingleThreadExecutor().apply{execute{try{LegacyIntelligenceRetirement.retire(this@NexusHubApplication)}finally{shutdown()}}};se.lobbamannen.nexushub.app.battery.BatterySync.initialize(this);BackgroundIntake.resume(this);java.util.concurrent.Executors.newSingleThreadExecutor().apply{execute{try{BackgroundIntake.importShares(this@NexusHubApplication)}finally{shutdown()}}}}
}
