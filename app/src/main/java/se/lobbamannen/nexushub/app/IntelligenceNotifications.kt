package se.lobbamannen.nexushub.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * One foreground status notification per active run, updated in place.
 * Terminal results receive a separate non-ongoing summary so WorkManager
 * can safely remove its own foreground notification on service teardown.
 *
 * Notifications display only workflow progress, never raw research or secrets.
 */
internal object IntelligenceNotifications {
    private const val CHANNEL = "nexus_intelligence_v1"
    private const val FOREGROUND_BASE = 63000
    private const val TERMINAL_BASE = 73000
    private val runId = Regex("[0-9a-fA-F-]{36}")

    fun foregroundId(id:String):Int {
        require(runId.matches(id))
        return FOREGROUND_BASE + (id.hashCode() and 0x3ff)
    }

    private fun terminalId(id:String):Int = TERMINAL_BASE + (id.hashCode() and 0x3ff)

    private fun manager(context:Context):NotificationManager {
        val manager=context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(
            CHANNEL, "Nexus Intelligence", NotificationManager.IMPORTANCE_LOW))
        return manager
    }

    private fun open(context:Context,id:String):PendingIntent {
        val intent=Intent(context,MainActivity::class.java).apply {
            putExtra("nexus.destination","intelligence?run="+id)
            flags=Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(context,foregroundId(id),intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun control(context:Context,id:String,action:String,offset:Int):PendingIntent {
        val intent=Intent(context,IntelligenceControlReceiver::class.java).apply {
            this.action=action
            putExtra("runId",id)
        }
        return PendingIntent.getBroadcast(context,foregroundId(id)+offset,intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun allowed(context:Context):Boolean =
        Build.VERSION.SDK_INT<33 || ContextCompat.checkSelfPermission(
            context,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED

    fun active(context:Context,id:String,stage:String,done:Int=0,total:Int=0):Notification {
        manager(context)
        val state=IntelligenceRunStore(context).get(id)?.optString("state").orEmpty()
        val builder=NotificationCompat.Builder(context,CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Nexus Intelligence")
            .setContentText(stage.take(110))
            .setContentIntent(open(context,id))
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setSilent(true)
            .setProgress(total.coerceAtLeast(0),done.coerceIn(0,total.coerceAtLeast(0)),total<=0)
        if(state=="running"||state=="queued"){
            builder.addAction(0,"Pausa",control(context,id,
                IntelligenceControlReceiver.PAUSE,4000))
            builder.addAction(0,"Avbryt",control(context,id,
                IntelligenceControlReceiver.CANCEL,5000))
        }
        return builder.build()
    }

    fun progress(context:Context,id:String,stage:String,done:Int,total:Int) {
        // WorkManager holds the foreground notification. Updating its id is safe;
        // denial of notification permission must not change the durable run outcome.
        if(!allowed(context))return
        try { manager(context).notify(foregroundId(id),active(context,id,stage,done,total)) }
        catch(_:Exception){ /* Work continues; status remains in SQLite. */ }
    }

    fun terminal(context:Context,id:String,state:String) {
        if(!allowed(context))return
        try {
            val complete=state in setOf("local_completed","completed")
            val cancelled=state=="cancelled"
            val text=when{
                complete->"Lokal analys färdig · öppna resultatet"
                cancelled->"Körningen avbruten"
                state=="waiting_model"->"Väntar på importerad modell"
                state=="waiting_index"->"Väntar på färdigt sökindex"
                state=="paused"->"Körningen pausad"
                state=="waiting_resource"->"Väntar på batteri, temperatur eller RAM"
                state=="failed"->"Analysen misslyckades · kontrollera felet"
                state=="conflict"->"Källan har ändrats · granska innan nytt försök"
                state=="waiting_network"->"Väntar på nätverksanslutning"
                else->"Körningen kräver uppmärksamhet"
            }
            val b=NotificationCompat.Builder(context,CHANNEL)
                .setSmallIcon(if(complete)android.R.drawable.stat_sys_download_done
                    else android.R.drawable.stat_notify_error)
                .setContentTitle("Nexus Intelligence")
                .setContentText(text)
                .setContentIntent(open(context,id))
                .setOnlyAlertOnce(true).setSilent(true)
                .setOngoing(false).setAutoCancel(true)
            if(state in setOf("paused","failed","conflict","waiting_model","waiting_index","waiting_network","waiting_resource")){
                b.addAction(0,if(state in setOf("failed","conflict"))"Försök igen" else "Återuppta",
                    control(context,id,IntelligenceControlReceiver.RESUME,6000))
            }
            manager(context).notify(terminalId(id),b.build())
        }catch(_:Exception){ /* Persisted run is the authoritative state. */ }
    }

    fun dismissSummary(context:Context,id:String) {
        try {manager(context).cancel(terminalId(id))}catch(_:Exception){}
    }
}

/** Explicit receiver, not exported; validates run state via IntelligenceJobs. */
class IntelligenceControlReceiver:BroadcastReceiver() {
    companion object {
        const val PAUSE="se.lobbamannen.nexushub.intelligence.PAUSE"
        const val CANCEL="se.lobbamannen.nexushub.intelligence.CANCEL"
        const val RESUME="se.lobbamannen.nexushub.intelligence.RESUME"
    }
    override fun onReceive(context:Context,intent:Intent) {
        val id=intent.getStringExtra("runId") ?: return
        if(!Regex("[0-9a-fA-F-]{36}").matches(id))return
        when(intent.action) {
            PAUSE -> IntelligenceJobs.pause(context,id)
            CANCEL -> IntelligenceJobs.cancel(context,id)
            RESUME -> if(IntelligenceJobs.resume(context,id))
                IntelligenceNotifications.dismissSummary(context,id)
        }
    }
}
