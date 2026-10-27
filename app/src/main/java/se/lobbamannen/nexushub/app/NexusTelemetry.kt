package se.lobbamannen.nexushub.app

import android.content.Context
import android.os.SystemClock
import com.posthog.PersonProfiles
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig
import com.posthog.internal.PostHogNetworkStatus
import org.json.JSONObject
import java.io.File

/** Single sender. Consent and configuration never use the GitHub/outbox stores. */
object NexusTelemetry {
    private lateinit var context:Context
    private lateinit var policy:TelemetryPolicy
    private var gate=TelemetryConsent()
    private val enabled get()=gate.enabled
    @Volatile private var ready=false
    private val epoch get()=gate.epoch
    private var initialized=false
    private var opened=false
    private var foregroundAt=0L
    private fun preferences()=context.getSharedPreferences("nexus_telemetry_v1",Context.MODE_PRIVATE)
    @Synchronized fun initialize(c:Context) {
        if(initialized)return
        context=c.applicationContext
        try {
            policy=TelemetryPolicy(JSONObject(context.assets.open("telemetry-schema.json").bufferedReader().use {it.readText()}))
            gate=TelemetryConsent(preferences().getBoolean("enabled",false),preferences().getLong("epoch",0L))
            initialized=true
            val root=File(context.cacheDir,"nexus-telemetry")
            root.listFiles()?.filter {it.name!=epoch.toString() || !enabled}?.forEach {it.deleteRecursively()}
            if(enabled)setup()
        } catch(_:Exception){gate=TelemetryConsent();ready=false}
    }
    private fun configured()=BuildConfig.POSTHOG_PROJECT_TOKEN.isNotBlank() && BuildConfig.POSTHOG_HOST=="https://eu.i.posthog.com"
    private fun setup() {
        if(ready || !configured())return
        val generation=epoch
        val queuePath=File(context.cacheDir,"nexus-telemetry/$generation").absolutePath
        val config=PostHogAndroidConfig(BuildConfig.POSTHOG_PROJECT_TOKEN,BuildConfig.POSTHOG_HOST).apply {
            optOut=true;persistOptOut=false
            captureApplicationLifecycleEvents=false;captureScreenViews=false;captureDeepLinks=false
            captureElementInteractions=false;captureRageClicks=false;captureDeadClicks=false
            capturePushNotificationOpened=false;capturePushNotificationSubscriptions=false
            sessionReplay=false;surveys=false;errorTrackingConfig.autoCapture=false
            errorTrackingConfig.captureNativeCrashes=false
            personProfiles=PersonProfiles.NEVER;setDefaultPersonProperties=false
            preloadFeatureFlags=false;sendFeatureFlagEvent=false
            debug=false;flushAt=20;flushIntervalSeconds=30;maxQueueSize=200
            // An old SDK queue cannot send after opt-out or after a new consent epoch.
            networkStatus=object:PostHogNetworkStatus {override fun isConnected()=gate.allows(generation)}
            storagePrefix=queuePath
            addBeforeSend {event ->
                if(!enabled || generation!=epoch)null else {
                    val safe=policy.sanitize(event.event,JSONObject(event.properties ?: emptyMap<String,Any>()))
                    if(safe==null)null else event.copy(properties=(safe+common(if(event.properties?.get("source")=="react")"react" else "native")+mapOf("\$process_person_profile" to false,"\$geoip_disable" to true)).toMutableMap())
                }
            }
        }
        PostHogAndroid.setup(context,config);PostHog.optIn();ready=true
    }
    private fun common(source:String):Map<String,Any> = mapOf("app" to "nexushub_android","platform" to "android","environment" to if(BuildConfig.DEBUG)"debug" else "production","source" to source,"app_version" to BuildConfig.VERSION_NAME.takeIf {it.matches(Regex("[0-9]+(?:\\.[0-9]+){1,3}"))}.orEmpty(),"android_api" to android.os.Build.VERSION.SDK_INT)
    @Synchronized fun status()=JSONObject().put("supported",true).put("enabled",enabled).put("sdkReady",configured() && initialized && (!enabled || ready)).put("project","nexushub-android-eu")
    @Synchronized fun setEnabled(value:Boolean):JSONObject {
        check(initialized && configured()) {"Diagnostik saknar byggkonfiguration"}
        if(value==enabled)return status()
        val nextEpoch=if(value)maxOf(System.currentTimeMillis(),epoch+1) else epoch+1
        gate.change(value,nextEpoch){choice,generation->preferences().edit().putBoolean("enabled",choice).putLong("epoch",generation).commit()}
        try {
            if(!value) {PostHog.optOut();PostHog.close();ready=false;File(context.cacheDir,"nexus-telemetry").deleteRecursively()}
            else {setup();if(foregroundAt>0)capture("app_opened",JSONObject().put("startup_mode",if(opened)"warm" else "cold"));opened=true}
        }catch(_:Exception){ready=false}
        return status()
    }
    @Synchronized fun capture(name:String,properties:JSONObject=JSONObject(),source:String="native"):Boolean {
        if(!enabled || !ready)return false
        return try {val clean=policy.sanitize(name,properties) ?: return false;PostHog.capture(event=name,properties=clean+common(source));true}catch(_:Exception){false}
    }
    @Synchronized fun foreground() {
        if(foregroundAt!=0L)return
        foregroundAt=SystemClock.elapsedRealtime().coerceAtLeast(1)
        if(enabled){capture("app_opened",JSONObject().put("startup_mode",if(opened)"warm" else "cold"));opened=true}
    }
    @Synchronized fun background() {
        if(foregroundAt==0L)return
        val duration=SystemClock.elapsedRealtime()-foregroundAt;foregroundAt=0
        capture("app_backgrounded",JSONObject().put("session_duration_bucket",if(duration<60000)"short" else if(duration<1800000)"medium" else "long"))
    }
}
