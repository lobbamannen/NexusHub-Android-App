package se.lobbamannen.nexushub.app

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.ConcurrentHashMap

/** A bounded user-visible lease, not an always-on polling daemon. */
class ActiveSyncService:Service() {
    companion object {
        private const val CHANNEL="nexus-background-sync"
        private const val NOTIFICATION=7401
        private const val MAX_LEASE_MS=60*60*1000L
        private val leases=ConcurrentHashMap<String,Long>()
        fun active(context:Context,id:String,value:Boolean):Boolean {
            require(id.length in 1..160&&!id.any{it.code<32})
            if(value)leases[id]=SystemClock.elapsedRealtime()+MAX_LEASE_MS else leases.remove(id)
            return try {if(value)ContextCompat.startForegroundService(context,Intent(context,ActiveSyncService::class.java)) else context.startService(Intent(context,ActiveSyncService::class.java));true}catch(_:Exception){leases.remove(id);false}
        }
        fun notification(context:Context,message:String="NexusHub slutför sparning och synk"):Notification {
            val manager=context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL,"Sparning och synk i bakgrunden",NotificationManager.IMPORTANCE_LOW).apply{description="Visas medan NexusHub slutför påbörjat arbete."})
            val open=PendingIntent.getActivity(context,0,Intent(context,MainActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            return NotificationCompat.Builder(context,CHANNEL).setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("NexusHub synkar").setContentText(message).setContentIntent(open).setOngoing(true).setSilent(true).setOnlyAlertOnce(true).build()
        }
    }
    private val main=Handler(Looper.getMainLooper());private var wake:PowerManager.WakeLock?=null
    private val check=object:Runnable {override fun run(){val now=SystemClock.elapsedRealtime();leases.entries.removeAll{it.value<now};if(leases.isEmpty()){finish();return};if(wake?.isHeld!=true)wake?.acquire(10*60*1000L);main.postDelayed(this,20000)}}
    override fun onCreate(){super.onCreate();wake=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"NexusHub:active-sync").apply{setReferenceCounted(false)}}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        try {
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,notification(this),ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else startForeground(NOTIFICATION,notification(this))
            main.removeCallbacks(check);check.run()
        }catch(_:Exception){leases.clear();finish()}
        return START_NOT_STICKY
    }
    private fun finish(){main.removeCallbacks(check);if(wake?.isHeld==true)wake?.release();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}
    override fun onTimeout(startId:Int,fgsType:Int){leases.clear();finish()}
    override fun onDestroy(){main.removeCallbacks(check);if(wake?.isHeld==true)wake?.release();super.onDestroy()}
    override fun onBind(intent:Intent?)=null
}
