package se.lobbamannen.nexushub.wear
import org.junit.Assert.*
import org.junit.Test
import se.lobbamannen.nexushub.battery.*
class BatteryProtocolTest {
 @Test fun samplingIntervalHasSafeDefaultAndAllowedChoices(){assertEquals(30,BatteryProtocol.interval(1));for(n in listOf(15,30,60))assertEquals(n,BatteryProtocol.interval(n))}
 @Test fun watchPayloadPreservesManualRequestAndCharging(){val now=System.currentTimeMillis();val s=BatterySnapshot("12345678-1234-4234-9234-123456789abc",36,2,1,now,"12345678-1234-4234-9234-123456789abd");assertEquals(s,BatterySnapshot.decode(s.encode(),now));assertNull(BatterySnapshot.decode(s.encode().replace("\"v\":1","\"v\":2"),now))}
}
