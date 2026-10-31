package se.lobbamannen.nexushub.app

import android.app.NotificationManager
import android.content.Context
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkQuery
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.File
import java.util.concurrent.TimeUnit

/** Retire abandoned AI jobs without touching the GGUF, profile, ideas or GitHub data. */
object LegacyIntelligenceRetirement {
    fun retire(context:Context) {
        val prefs=context.getSharedPreferences("nexus_gemma_retirement_v1",Context.MODE_PRIVATE)
        if(prefs.getBoolean("retired",false))return
        val manager=WorkManager.getInstance(context)
        val query=WorkQuery.Builder.fromStates(
            listOf(WorkInfo.State.ENQUEUED,WorkInfo.State.RUNNING,WorkInfo.State.BLOCKED)).build()
        val old=manager.getWorkInfos(query).get(15,TimeUnit.SECONDS)
        old.filter{w->w.tags.any{it.startsWith("intelligence:")}}
            .forEach{manager.cancelWorkById(it.id).result.get(15,TimeUnit.SECONDS)}
        context.getSystemService(NotificationManager::class.java)
            ?.deleteNotificationChannel("nexus_intelligence_v1")
        for(name in listOf("nexus_intelligence_v1.db","nexus_intelligence_reviews_v1.db",
                         "nexus_intelligence_index_v1.db")) {
            if(context.getDatabasePath(name).exists())check(context.deleteDatabase(name))
        }
        File(context.filesDir,"intelligence-input-v1").let{
            if(it.exists())check(it.deleteRecursively())
        }
        context.getSharedPreferences("nexus_intelligence_backend_guard_v1",Context.MODE_PRIVATE)
            .edit().clear().commit()
        check(prefs.edit().putBoolean("retired",true).commit())
    }
}

/** Compatibility tombstone for jobs recorded by older APKs; never calls the model. */
class IntelligenceWorker(context:Context,params:WorkerParameters):Worker(context,params) {
    override fun doWork():Result=Result.success()
}
