package se.lobbamannen.nexushub.app

/** Fail-closed gate shared by capture and the SDK queue's network check. */
class TelemetryConsent(initial:Boolean=false,initialEpoch:Long=0L) {
    @Volatile var enabled=initial
        private set
    @Volatile var epoch=initialEpoch
        private set
    @Synchronized fun change(value:Boolean,nextEpoch:Long,persist:(Boolean,Long)->Boolean) {
        require(nextEpoch>epoch)
        check(persist(value,nextEpoch)) {"Diagnostikvalet kunde inte sparas"}
        enabled=value;epoch=nextEpoch
    }
    fun allows(generation:Long)=enabled && epoch==generation
}
