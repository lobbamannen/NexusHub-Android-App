package se.lobbamannen.nexushub.app
import android.app.Application
class NexusHubApplication:Application() {
    override fun onCreate(){super.onCreate();NexusTelemetry.initialize(this);java.util.concurrent.Executors.newSingleThreadExecutor().apply{execute{try{LegacyIntelligenceRetirement.retire(this@NexusHubApplication)}finally{shutdown()}}};se.lobbamannen.nexushub.app.battery.BatterySync.initialize(this);BackgroundIntake.resume(this);java.util.concurrent.Executors.newSingleThreadExecutor().apply{execute{try{BackgroundIntake.importShares(this@NexusHubApplication)}finally{shutdown()}}}}
}
