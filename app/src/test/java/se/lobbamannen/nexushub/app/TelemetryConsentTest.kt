package se.lobbamannen.nexushub.app
import org.junit.Assert.*
import org.junit.Test
class TelemetryConsentTest {
    @Test fun noOptInMeansNoSend() {assertFalse(TelemetryConsent().allows(0))}
    @Test fun choiceSurvivesRestartAndOldQueuesNeverRearm() {
        var saved=false;var generation=0L
        val gate=TelemetryConsent();gate.change(true,1){e,g->saved=e;generation=g;true}
        assertTrue(TelemetryConsent(saved,generation).allows(1))
        gate.change(false,2){e,g->saved=e;generation=g;true};assertFalse(gate.allows(1))
        assertFalse(TelemetryConsent(saved,generation).enabled)
        gate.change(true,3){_,_->true};assertFalse(gate.allows(1));assertTrue(gate.allows(3))
    }
    @Test fun failedPersistenceDoesNotEnableAnything() {
        val gate=TelemetryConsent()
        try{gate.change(true,1){_,_->false};fail("expected persistence failure")}catch(_:IllegalStateException){}
        assertFalse(gate.enabled);assertFalse(gate.allows(1))
    }
}
