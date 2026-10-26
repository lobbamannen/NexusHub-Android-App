package se.lobbamannen.nexushub.app

import android.Manifest
import android.app.*
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import android.database.ContentObserver
import android.os.*
import android.provider.CalendarContract
import android.text.InputType
import android.webkit.WebView
import android.widget.EditText
import androidx.webkit.*
import org.json.*
import java.util.concurrent.Executors

class NexusMessageBridge(private val activity:Activity,private val web:WebView) {
    private val main=Handler(Looper.getMainLooper());private val io=Executors.newSingleThreadExecutor()
    private val calendar=PhoneCalendar(activity);private val watch=ReleaseWatch(activity.applicationContext)
    private var reply:JavaScriptReplyProxy?=null;private var active=false;private var closed=false;private var observing=false
    private var permissionReply:((JSONObject)->Unit)?=null
    private val change=Runnable { calendar.invalidate();emit("calendar.changed",calendar.revision) }
    private val observer=object:ContentObserver(main){ override fun onChange(selfChange:Boolean){main.removeCallbacks(change);main.postDelayed(change,250)} }
    fun install() {
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return
        WebViewCompat.addWebMessageListener(web,"NexusNative",setOf("https://appassets.androidplatform.net")) { _,message,origin,isMainFrame,proxy ->
            if(!isMainFrame || origin.toString()!="https://appassets.androidplatform.net")return@addWebMessageListener
            reply=proxy
            try {
                val raw=message.data ?: error("Tomt meddelande");require(raw.length<=2500000)
                val request=JSONObject(raw);require(request.getInt("v")==1);val id=request.getString("requestId");require(id.length in 1..160)
                val method=request.getString("method");val p=request.optJSONObject("params") ?: JSONObject()
                fun done(result:JSONObject){ if(!closed) proxy.postMessage(JSONObject().put("v",1).put("requestId",id).put("ok",true).put("result",result).toString()) }
                fun fail(code:String,message:String){if(!closed)proxy.postMessage(JSONObject().put("v",1).put("requestId",id).put("ok",false).put("error",JSONObject().put("code",code).put("message",message)).toString())}
                fun perform(calendarAccess:Boolean=false,job:()->JSONObject) {
                    io.execute { try { if(calendarAccess && !granted())throw SecurityException("Kalenderbehörighet saknas");val before=calendar.revision;val result=job(); main.post { if(calendarAccess && !granted()){calendar.invalidate();fail("PERMISSION_DENIED","Kalenderbehörighet återkallad")} else if(calendarAccess && (!active || before!=calendar.revision))fail("STALE_CALENDAR","Kalendern ändrades. Uppdatera vyn.") else done(result) } } catch(e:Exception){main.post {fail(if(e is SecurityException)"PERMISSION_DENIED" else "REQUEST_FAILED",e.message?.take(200) ?: "Åtgärden misslyckades")}} }
                }
                when(method) {
                    "calendar.getPermission" -> done(permission())
                    "calendar.requestPermission" -> { if(granted())done(permission()) else if(!permission().getBoolean("canRequest")) {activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+activity.packageName)));done(permission().put("settingsOpened",true))} else if(permissionReply!=null)fail("BUSY","En behörighetsfråga är redan öppen") else {permissionReply=::done;activity.getPreferences(0).edit().putBoolean("calendarAsked",true).apply();activity.requestPermissions(arrayOf(Manifest.permission.READ_CALENDAR),4101)} }
                    "calendar.getSources" -> perform(true){JSONObject().put("sources",calendar.sources())}
                    "calendar.getRange" -> perform(true){calendar.range(p)}
                    "calendar.getDetails" -> perform(true){calendar.details(p.getString("id"))}
                    "calendar.openSystemEvent" -> {require(granted());calendar.open(p.getString("id"));done(JSONObject().put("opened",true))}
                    "calendar.prepareInsert" -> {calendar.insert(p);done(JSONObject().put("opened",true))}
                    "watch.getState" -> perform{watch.state()}
                    "watch.setSnapshot" -> perform{watch.snapshot(p)}
                    "watch.markRead" -> perform{watch.markRead(p.getJSONArray("ids"))}
                    "watch.exportHistory" -> perform{watch.export()}
                    "watch.restoreHistory" -> perform{watch.restoreHistory(p.getJSONArray("events"))}
                    "watch.checkNow" -> {ReleaseWatch.check(activity);done(JSONObject().put("enqueued",true))}
                    "watch.requestNotifications" -> {if(Build.VERSION.SDK_INT>=33)activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),4102);done(JSONObject().put("requested",true))}
                    "watch.setApiKey" -> {val input=EditText(activity).apply {inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD;hint="API-nyckel (tomt tar bort)"};AlertDialog.Builder(activity).setTitle("Streaming Availability API").setMessage("Din egen nyckel från developers.movieofthenight.com. Ingen betaltjänst aktiveras.").setView(input).setNegativeButton(android.R.string.cancel,null).setPositiveButton("Spara") { _,_ -> val value=input.text.toString();input.text.clear();io.execute {val saved=WatchCredentialStore(activity).set(value);if(saved){watch.changedKey();ReleaseWatch.schedule(activity);ReleaseWatch.check(activity)};main.post {if(!saved)Toast.makeText(activity,"Nyckeln kunde inte sparas. Kontrollera formatet och försök igen.",Toast.LENGTH_LONG).show();emit("watch.changed",System.currentTimeMillis())}} }.show();done(JSONObject().put("opened",true))}
                    else -> fail("UNKNOWN_METHOD","Okänd metod")
                }
            } catch(_:Exception) { try {val id=JSONObject(message.data ?: "{}").optString("requestId");proxy.postMessage(JSONObject().put("v",1).put("requestId",id).put("ok",false).put("error",JSONObject().put("code","INVALID_REQUEST").put("message","Ogiltig begäran")).toString())}catch(_:Exception){} }
        }
        ReleaseWatch.listener={main.post {emit("watch.changed",System.currentTimeMillis())}}
        ReleaseWatch.schedule(activity)
    }
    private fun granted()=activity.checkSelfPermission(Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED
    private fun permission()=JSONObject().put("granted",granted()).put("supported",true).put("canRequest",granted() || !activity.getPreferences(0).getBoolean("calendarAsked",false) || activity.shouldShowRequestPermissionRationale(Manifest.permission.READ_CALENDAR))
    private fun emit(event:String,revision:Long){if(!closed && active)try{reply?.postMessage(JSONObject().put("v",1).put("event",event).put("revision",revision).toString())}catch(_:Exception){} }
    fun resume(){active=true;calendar.invalidate();if(granted() && !observing){activity.contentResolver.registerContentObserver(CalendarContract.CONTENT_URI,true,observer);observing=true};emit("calendar.changed",calendar.revision);emit("watch.changed",System.currentTimeMillis())}
    fun stop(){active=false;main.removeCallbacks(change);if(observing){activity.contentResolver.unregisterContentObserver(observer);observing=false};calendar.invalidate()}
    fun permissions(code:Int){if(code==4101){permissionReply?.invoke(permission());permissionReply=null;if(active)resume()};if(code==4102)emit("watch.changed",System.currentTimeMillis())}
    fun destroy(){closed=true;stop();permissionReply=null;reply=null;ReleaseWatch.listener=null;io.shutdownNow()}
}
