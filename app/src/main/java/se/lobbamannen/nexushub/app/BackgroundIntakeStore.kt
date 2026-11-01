package se.lobbamannen.nexushub.app

import android.content.Context
import android.util.AtomicFile
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock

/** Originals and job acknowledgement are durable before the UI is released. */
class BackgroundIntakeStore(private val context:Context) {
    companion object {
        private val locks=ConcurrentHashMap<String,Any>()
        private val transfers=ConcurrentHashMap<String,ReentrantLock>()
        fun lock(id:String):Any=locks.getOrPut(id){Any()}
        fun transfer(id:String):ReentrantLock=transfers.getOrPut(id){ReentrantLock()}
    }
    private val root=File(context.filesDir,"background-intake-v1").apply{mkdirs()}
    private fun directory(id:String):File {require(BackgroundIntakeProtocol.uuid.matches(id));return File(root,id)}
    private fun read(file:File):JSONObject? {val atomic=AtomicFile(file);return if(!file.exists()&&!File(file.path+".bak").exists())null else JSONObject(atomic.openRead().bufferedReader().use{it.readText()})}
    private fun write(file:File,value:JSONObject){val atomic=AtomicFile(file);val out=atomic.startWrite();try{out.write(value.toString().toByteArray(Charsets.UTF_8));atomic.finishWrite(out)}catch(e:Exception){atomic.failWrite(out);throw e}}
    fun job(id:String):JSONObject?=synchronized(lock(id)){read(File(directory(id),"job.json"))}
    fun jobs():JSONArray {val out=JSONArray();root.listFiles()?.filter{BackgroundIntakeProtocol.uuid.matches(it.name)}?.forEach{dir->try{job(dir.name)?.let{out.put(it)}}catch(_:Exception){out.put(JSONObject().put("id",dir.name).put("state","failed").put("error","Körstatus kunde inte läsas. Originalet behålls."))}};return out}
    fun stage(input:JSONObject):JSONObject {
        val id=input.getString("id");val prepared=BackgroundIntakeProtocol.prepare(input)
        return synchronized(lock(id)) {
            val dir=directory(id).apply{mkdirs()};require(!cancellationRequested(id)){"Posten har avbrutits och får inte återuppladdas."};val previous=job(id)
            val hash=prepared.last().sha
            if(previous!=null){require(previous.optString("state")!="cancelled"){"Posten har avbrutits och får inte återuppladdas."};require(previous.optString("manifestSha")==hash){"Den väntande postens original har ändrats."};return@synchronized previous}
            val payload=JSONObject(input.toString());val files=payload.getJSONArray("files")
            for(i in 0 until files.length()){
                val f=files.getJSONObject(i);val fid=f.getString("id");val bytes=Base64.decode(f.getString("base64"),Base64.DEFAULT)
                val atomic=AtomicFile(File(dir,fid));val stream=atomic.startWrite();try{stream.write(bytes);atomic.finishWrite(stream)}catch(e:Exception){atomic.failWrite(stream);throw e}
                f.remove("base64");f.put("sha",BackgroundIntakeProtocol.hash(bytes))
            }
            write(File(dir,"payload.json"),payload)
            val job=JSONObject().put("id",id).put("state","pending").put("manifestSha",hash).put("attempts",0).put("createdAt",input.getString("createdAt")).put("updatedAt",Instant.now().toString()).put("title",files.optJSONObject(0)?.optString("name")?:"Delad text")
            write(File(dir,"job.json"),job);record(job,"pending","Mottagning väntar på GitHub");job
        }
    }
    /** Existing durable queue, not a second journal or background engine. */
    fun stageShared(input:JSONObject,incoming:IncomingShareStore):JSONObject {
        val id=input.getString("id")
        val files=input.getJSONArray("files")
        for(i in 0 until files.length()) {
            val f=files.getJSONObject(i)
            require(!f.has("error")) { f.optString("error","Delad fil kunde inte tas emot.") }
        }
        val original=File(context.filesDir,"incoming-v1/"+id)
        // Every file and the metadata hash are verified before any job is acknowledged.
        val prepared=BackgroundIntakeProtocol.prepareLocal(input,original)
        val manifestSha=prepared.last().sha
        return synchronized(lock(id)) {
            require(!cancellationRequested(id)) { "Posten har avbrutits och får inte återuppladdas." }
            val previous=job(id)
            if(previous!=null) {
                require(previous.optString("state")!="cancelled") { "Posten har avbrutits." }
                require(previous.optString("manifestSha")==manifestSha) { "Originalet har ändrats." }
                return@synchronized previous
            }
            val dir=directory(id).apply{mkdirs()}
            for(i in 0 until files.length()) {
                val fid=files.getJSONObject(i).getString("id")
                val from=incoming.localFile(id,fid)
                val atomic=AtomicFile(File(dir,fid));val out=atomic.startWrite()
                try {
                    from.inputStream().use{it.copyTo(out,64*1024)}
                    atomic.finishWrite(out)
                }catch(e:Exception){atomic.failWrite(out);throw e}
                require(BackgroundIntakeProtocol.hashFile(File(dir,fid))==files.getJSONObject(i).getString("sha")) { "Delad fil ändrades under kopieringen." }
            }
            write(File(dir,"payload.json"),JSONObject(input.toString()))
            val job=JSONObject().put("id",id).put("state","pending").put("manifestSha",manifestSha)
                .put("attempts",0).put("createdAt",input.getString("createdAt")).put("updatedAt",Instant.now().toString())
                .put("title",files.optJSONObject(0)?.optString("name")?:"Delad text")
            write(File(dir,"job.json"),job)
            record(job,"pending","Mottagning väntar på GitHub")
            job
        }
    }
    fun payloadForUpload(id:String):JSONObject=synchronized(lock(id)) {
        read(File(directory(id),"payload.json"))?:error("Mottagningsoriginalets metadata saknas.")
    }
    fun fileDirectory(id:String):File=directory(id)
    fun payload(id:String):JSONObject=synchronized(lock(id)) {
        val dir=directory(id);val p=read(File(dir,"payload.json"))?:error("Det beständiga originalet saknas.");val files=p.getJSONArray("files")
        for(i in 0 until files.length()){val f=files.getJSONObject(i);val bytes=AtomicFile(File(dir,f.getString("id"))).openRead().use{it.readBytes()};require(BackgroundIntakeProtocol.hash(bytes)==f.getString("sha")){"Det lokala originalets kontrollsumma avviker."};f.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP))};p
    }
    fun update(id:String,state:String,error:String="",receipt:JSONObject?=null):JSONObject=synchronized(lock(id)) {
        val j=job(id)?:throw IllegalStateException("Körstatus saknas.");if(j.optString("state")=="cancelled")return@synchronized j
        val changed=j.optString("state")!=state||j.optString("error")!=error
        j.put("state",state).put("error",error.take(400)).put("updatedAt",Instant.now().toString());if(state=="running")j.put("attempts",j.optInt("attempts")+1)
        if(receipt!=null)j.put("receipt",receipt)
        write(File(directory(id),"job.json"),j);if(changed&&state!="running")record(j,state,error);j
    }
    fun cancellationRequested(id:String):Boolean {val f=File(directory(id),"cancel.json");return f.exists()||File(f.path+".bak").exists()}
    /** Persist intent without waiting on a network request. false means publication is still settling. */
    fun cancel(id:String,remoteDeleted:Boolean=false):Boolean {
        val dir=directory(id).apply{mkdirs()}
        synchronized(lock(id)){if(!cancellationRequested(id))write(File(dir,"cancel.json"),JSONObject().put("requestedAt",Instant.now().toString()))}
        val gate=transfer(id);if(!gate.tryLock())return false
        try{return synchronized(lock(id)) {
            val j=job(id)?:return@synchronized true
            val wasCancelled=j.optString("state")=="cancelled"
            j.put("state","cancelled").put("updatedAt",Instant.now().toString())
            if(remoteDeleted)j.put("receipt",JSONObject().put("deleted",true))
            write(File(dir,"job.json"),j)
            // Keep receipts and cancellation tombstones; only explicit cancellation releases original bytes.
            dir.listFiles()?.filter{it.name !in setOf("job.json","job.json.bak","cancel.json","cancel.json.bak")}?.forEach{it.delete()}
            if(!wasCancelled)record(j,"cancelled",if(remoteDeleted)"Mottagningsposten har raderats i GitHub" else "Bakgrundsuppladdningen har avbrutits")
            true
        }}finally{gate.unlock()}
    }
    private fun record(job:JSONObject,status:String,message:String){try{ActivityJournal(context).append(JSONObject().put("id","incoming:"+job.getString("id")+":"+status+":"+job.optInt("attempts")).put("at",Instant.now().toString()).put("category","inbox").put("action","incoming_upload").put("status",if(status=="failed"||status=="conflict"||status=="cancelled"||status=="succeeded")status else "pending").put("source","native").put("objectType","incoming").put("objectId",job.getString("id")).put("operationId",job.getString("id")).put("title",job.optString("title","Mottagning")).put("details",JSONObject().put("message",message.take(400)).put("attempt",job.optInt("attempts"))))}catch(_:Exception){/* A journal failure never discards originals or reverses a verified upload. */}}
}
