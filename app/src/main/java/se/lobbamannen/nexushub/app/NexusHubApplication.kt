package se.lobbamannen.nexushub.app
import android.app.Application
class NexusHubApplication:Application() {
    override fun onCreate(){super.onCreate();NexusTelemetry.initialize(this);se.lobbamannen.nexushub.app.battery.BatterySync.initialize(this)}
}
