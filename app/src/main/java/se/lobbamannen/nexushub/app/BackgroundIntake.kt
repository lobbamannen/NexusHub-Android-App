package se.lobbamannen.nexushub.app

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object BackgroundIntake {
    private fun schedule(context:Context,id:String){WorkManager.getInstance(context).enqueueUniqueWork("nexus-incoming-$id",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<BackgroundIntakeWorker>().setInputData(workDataOf("id" to id)).setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build())}
    fun enqueue(context:Context,input:JSONObject):JSONObject {val job=BackgroundIntakeStore(context).stage(input);if(job.optString("state") in setOf("pending","running"))schedule(context,input.getString("id"));return job}
    fun resume(context:Context){val store=BackgroundIntakeStore(context);val jobs=store.jobs();for(i in 0 until jobs.length()){val j=jobs.getJSONObject(i);if(j.optString("state") in setOf("pending","running"))schedule(context,j.getString("id"))}}
    fun retry(context:Context,id:String):Boolean {val store=BackgroundIntakeStore(context);val job=store.job(id)?:return false;if(store.cancellationRequested(id))return false;if(job.optString("state") in setOf("cancelled","succeeded"))return false;store.update(id,"pending");schedule(context,id);return true}
    fun cancel(context:Context,id:String):Boolean {WorkManager.getInstance(context).cancelUniqueWork("nexus-incoming-$id");return BackgroundIntakeStore(context).cancel(id)}
    /** Android ACTION_SEND originals are already safe in IncomingShareStore, even before WebView startup. */
    fun importShares(context:Context){val shares=IncomingShareStore(context);val items=org.json.JSONArray(shares.list());for(i in 0 until items.length()){try{val item=items.getJSONObject(i);val job=BackgroundIntakeStore(context).job(item.getString("id"));if(job!=null)continue;val files=item.getJSONArray("files");for(n in 0 until files.length()){val f=files.getJSONObject(n);require(!f.has("error"));val bytes=shares.read(item.getString("id"),f.getString("id"));require(bytes.isNotEmpty()||f.optString("sha")==BackgroundIntakeProtocol.hash(ByteArray(0))){ "Originalet kunde inte läsas." };f.put("base64",bytes)};enqueue(context,item)}catch(_:Exception){/* Original remains in native inbox for visible recovery. */}}}
}

class BackgroundIntakeWorker(context:Context,params:WorkerParameters):Worker(context,params) {
    override fun doWork():Result {
        val id=inputData.getString("id")?:return Result.failure();if(!BackgroundIntakeProtocol.uuid.matches(id))return Result.failure()
        val gate=BackgroundIntakeStore.transfer(id)
        if(!gate.tryLock())return Result.retry()
        try {
            val store=BackgroundIntakeStore(applicationContext);val previous=store.job(id)?:return Result.failure()
            if(previous.optString("state") in setOf("succeeded","cancelled"))return Result.success()
            if(store.cancellationRequested(id)){store.cancel(id);return Result.success()}
            try {
                setForegroundAsync(ForegroundInfo(7402,ActiveSyncService.notification(applicationContext,"Laddar upp mottaget material till GitHub"),android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)).get()
                store.update(id,"running")
                val receipt=BackgroundIntakeGitHub(GithubCredentialStore(applicationContext).get()).upload(store.payload(id)){isStopped||store.cancellationRequested(id)}
                if(receipt.optBoolean("deleted")){store.cancel(id,remoteDeleted=true)}else{
                    store.update(id,"succeeded",receipt=receipt)
                    if(store.cancellationRequested(id))store.cancel(id)
                }
                return Result.success()
            }catch(e:Exception){
                if(store.cancellationRequested(id)){store.cancel(id);return Result.success()}
                if(isStopped){store.update(id,"pending","Android pausade arbetet. Det återupptas när systemet tillåter.");return Result.retry()}
                val code=(e as? BackgroundIntakeFailure)?.status?:503
                val retry=code in setOf(408,422,429)||code>=500
                store.update(id,if(retry)"pending" else if(code==409)"conflict" else "failed",e.message?:"Bakgrundsuppladdningen kunde inte slutföras.")
                return if(retry)Result.retry()else Result.failure()
            }
        }finally{gate.unlock()}
    }
}
