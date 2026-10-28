package se.lobbamannen.nexushub.app.battery
import android.app.Application
import androidx.work.*
import androidx.work.testing.*
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import se.lobbamannen.nexushub.battery.*
import java.time.LocalTime

@RunWith(RobolectricTestRunner::class)
@Config(manifest=Config.NONE,application=Application::class,sdk=[34])
class BatteryPauseRuntimeTest {
 private lateinit var c:Application
 @Before fun setup(){
  c=RuntimeEnvironment.getApplication();WorkManagerTestInitHelper.initializeTestWorkManager(c)
  val now=LocalTime.now();val minute=now.hour*60+now.minute
  saveBatteryConfiguration(BatteryStore(c).prefs,BatteryConfiguration(123,15,true,(minute+1439)%1440,(minute+2)%1440))
 }
 @Test fun queuedRefreshCannotRequestWatchDuringPause(){
  assertTrue(BatteryStore(c).paused())
  assertEquals(ListenableWorker.Result.success(),TestListenableWorkerBuilder<BatterySyncWorker>(c).build().doWork())
  assertEquals("idle",BatteryStore(c).requestStatus());assertEquals(0,BatteryStore(c).journal().length())
  assertTrue(WorkManager.getInstance(c).getWorkInfosForUniqueWork(BatteryProtocol.WORK).get().none{!it.state.isFinished})
 }
 @Test fun manualRefreshDoesNotEnqueueRequestDuringPause(){BatterySync.refresh(c);assertTrue(WorkManager.getInstance(c).getWorkInfosForUniqueWork("nexus-battery-now").get().isEmpty())}
 @Test fun acknowledgementMustMatchSelectedWatchAndCurrentConfiguration(){
  val store=BatteryStore(c);store.select("watch-a")
  // Verify persisted matching rules without fabricating a transport success.
  store.prefs.edit().putString("configurationAck",store.configuration().encode()).putString("configurationAckNode","watch-a").commit()
  assertTrue(store.configurationConfirmed());store.updateConfiguration(store.configuration().copy(quietEnd=(store.configuration().quietEnd+1)%1440));assertFalse(store.configurationConfirmed())
  store.select("watch-b");assertFalse(store.configurationConfirmed())
 }
}
