package se.lobbamannen.nexushub.app.battery
import se.lobbamannen.nexushub.battery.*
import org.junit.Assert.*
import org.junit.Test
class BatterySnapshotTest {
 private val now=1793124000000L
 private fun snapshot(time:Long=now,percent:Int=36)=BatterySnapshot("12345678-1234-4234-9234-123456789abc",percent,3,0,time)
 @Test fun invalidAndFutureMeasurementsAreRejected(){assertFalse(snapshot(percent=101).valid(now));assertFalse(snapshot(time=now+600001).valid(now));assertFalse(snapshot(time=0).valid(now));assertTrue(snapshot().valid(now))}
 @Test fun wireRoundtripPreservesMeasurementIdentity(){val s=snapshot();assertEquals(s,BatterySnapshot.decode(s.encode(),now));assertNull(BatterySnapshot.decode("{}",now));assertNull(BatterySnapshot.decode(s.encode().replace("\"percent\":36","\"percent\":\"36\""),now))}
 @Test fun reconnectDoesNotMakeOldMeasurementFresh(){assertEquals("stale",snapshot(time=now-7200000).freshness(now,30));assertEquals("fresh",snapshot().freshness(now,30));assertEquals("delayed",snapshot(time=now-3000000).freshness(now,30))}
 @Test fun olderAndDuplicateMeasurementsCannotReplaceLatest(){val s=snapshot();assertFalse(supersedes(s,s));assertFalse(supersedes(snapshot(time=now-1),s));assertTrue(supersedes(snapshot(time=now+1).copy(id="12345678-1234-4234-9234-123456789abd"),s))}
 @Test fun consentEpochBlocksHistoricalWatchDiagnostics(){assertFalse(eligibleDiagnostic(now-1,now,true));assertFalse(eligibleDiagnostic(now+1,now,false));assertTrue(eligibleDiagnostic(now+1,now,true))}
 @Test fun manualResponseRetainsItsRequestId(){val s=snapshot().copy(requestId="12345678-1234-4234-9234-123456789abd");assertEquals(s,BatterySnapshot.decode(s.encode(),now));assertFalse(s.copy(requestId="invalid").valid(now))}
}
