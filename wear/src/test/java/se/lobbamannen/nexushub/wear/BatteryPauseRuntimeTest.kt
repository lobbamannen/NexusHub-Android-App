package se.lobbamannen.nexushub.wear
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
  saveBatteryConfiguration(BatteryWork.prefs(c),BatteryConfiguration(123,15,true,(minute+1439)%1440,(minute+2)%1440))
 }
 @Test fun queuedPublishDoesNotReadOrTransmitDuringPause(){
  assertTrue(BatteryWork.paused(c))
  assertEquals(ListenableWorker.Result.success(),TestListenableWorkerBuilder<BatteryPublishWorker>(c).build().doWork())
  assertFalse(BatteryWork.prefs(c).contains("snapshot"));assertFalse(BatteryWork.prefs(c).contains("journal"))
  assertTrue(WorkManager.getInstance(c).getWorkInfosForUniqueWork(BatteryProtocol.WORK).get().none{!it.state.isFinished})
  assertTrue(WorkManager.getInstance(c).getWorkInfosForUniqueWork("nexus-battery-quiet-transition").get().any{!it.state.isFinished})
 }
 @Test fun manualDoesNotEnqueueMeasurementDuringPause(){BatteryWork.now(c);assertTrue(WorkManager.getInstance(c).getWorkInfosForUniqueWork("nexus-battery-now").get().isEmpty())}
}
