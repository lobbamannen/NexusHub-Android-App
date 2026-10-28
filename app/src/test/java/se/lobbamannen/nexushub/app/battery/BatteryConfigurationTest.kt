package se.lobbamannen.nexushub.app.battery
import org.junit.Assert.*
import org.junit.Test
import se.lobbamannen.nexushub.battery.*
class BatteryConfigurationTest {
 @Test fun newAndUpgradedPhonesDefaultToOvernightPause(){val c=BatteryConfiguration();assertTrue(c.quietEnabled);assertEquals(1200,c.quietStart);assertEquals(360,c.quietEnd)}
 @Test fun settingsRoundTripAndRequireNewerOrIdenticalRevision(){val c=BatteryConfiguration(123,15,false,630,720);assertEquals(c,BatteryConfiguration.decode(c.encode().toByteArray()));assertTrue(c.supersedes(c));assertFalse(c.copy(revision=122).supersedes(c));assertFalse(c.copy(interval=30).supersedes(c));assertTrue(c.copy(revision=124).supersedes(c))}
 @Test fun malformedConfigCannotDisableTheWatchPause(){for(raw in listOf("{}","{\"v\":1}",BatteryConfiguration().encode().replace("1200","1440"),BatteryConfiguration().encode().replace("true","\"true\""),BatteryConfiguration().copy(quietEnd=1200).encode(),BatteryConfiguration().copy(revision=0).encode(),BatteryConfiguration().encode().replace("1200","1200.5"))){assertNull(raw,BatteryConfiguration.decode(raw.toByteArray()))}}
}
