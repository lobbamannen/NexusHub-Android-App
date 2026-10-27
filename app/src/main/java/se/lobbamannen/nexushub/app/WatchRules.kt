package se.lobbamannen.nexushub.app

import java.time.LocalTime
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

object WatchRules {
    const val BUDGET=900
    val providers=setOf("netflix","prime","disney","hbo","skyshowtime")
    fun quiet(enabled:Boolean,from:String,to:String,now:LocalTime):Boolean {
        if(!enabled) return false
        val a=LocalTime.parse(from); val b=LocalTime.parse(to)
        return if(a==b) true else if(a<b) now>=a && now<b else now>=a || now<b
    }
    fun windowValid(future:Boolean,from:Long,to:Long,now:Long):Boolean {
        val today=Math.floorDiv(now,86400L)*86400L
        return from<=to && if(future) from>=today && to<=today+31L*86400 else from>=today-31L*86400 && to<=now
    }
    fun notificationEnabled(availability:String,kindEnabled:Boolean,globalEnabled:Boolean,upcomingEnabled:Boolean)=
        kindEnabled && globalEnabled && (availability=="confirmed_available" || availability=="confirmed_upcoming" && upcomingEnabled)
    /** Evidence merges by stable ID; private native baseline state remains authoritative. */
    fun mergeEvents(current:JSONArray,incoming:JSONArray,baselineNew:Boolean):JSONArray {
        val merged=linkedMapOf<String,JSONObject>()
        for(i in 0 until current.length()) {val e=current.getJSONObject(i);merged[e.getString("id")]=JSONObject(e.toString())}
        for(i in 0 until incoming.length()) {
            val e=incoming.getJSONObject(i);val id=e.getString("id");val old=merged[id]
            if(old==null) {
                val fresh=JSONObject(e.toString())
                if(baselineNew) {fresh.put("baseline",true);if(fresh.optString("readAt").isBlank())fresh.put("readAt",Instant.now().toString())}
                merged[id]=fresh
            } else {
                val newer=Instant.parse(e.getString("observedAt")).isAfter(Instant.parse(old.getString("observedAt")))
                val copy=if(newer)JSONObject(e.toString()) else JSONObject(old.toString())
                // A remote archive is never allowed to re-arm old notifications or alter baselines.
                if(old.has("baseline"))copy.put("baseline",old.getBoolean("baseline")) else copy.remove("baseline")
                for(field in listOf("readAt","notifiedAt")) {
                    val a=old.optString(field);val b=e.optString(field)
                    val stamp=if(a.isBlank())b else if(b.isBlank())a else if(Instant.parse(a).isAfter(Instant.parse(b)))a else b
                    if(stamp.isNotBlank())copy.put(field,stamp) else copy.remove(field)
                }
                val explicitRead=e.optString("readAt")
                if(!e.optBoolean("pendingAvailableNotification") && explicitRead.isNotBlank() && Instant.parse(explicitRead).isAfter(Instant.parse(copy.getString("observedAt"))))copy.remove("pendingAvailableNotification")
                merged[id]=copy
            }
        }
        return JSONArray(merged.toSortedMap().values.toList())
    }
    /** A cursor belongs to its exact catalog query. Re-query retained backlog if that query changes. */
    fun rekeyStreams(previous:JSONObject,streams:List<String>,now:Long):JSONObject {
        val out=JSONObject()
        for(key in streams) {
            val exact=previous.optJSONObject(key)
            if(exact!=null){out.put(key,JSONObject(exact.toString()));continue}
            val parts=key.split("|");val providers=parts[0].split(",").toSet();val future=parts[1]=="upcoming"
            val candidates=previous.keys().asSequence().filter { old ->
                val oldParts=old.split("|")
                oldParts.size==3 && oldParts[1]==parts[1] && oldParts[2]==parts[2] && oldParts[0].split(",").any {it in providers}
            }.map {previous.getJSONObject(it)}.toList()
            val starts=candidates.mapNotNull { if(it.has("from"))it.getLong("from") else if(it.has("watermark"))it.getLong("watermark") else null }
            val state=JSONObject()
            if(starts.isNotEmpty()) {
                val earliest=starts.min()
                // Future API windows only accept the source's current calendar day onward.
                val lower=if(future)Math.floorDiv(now,86400L)*86400L else (now-30L*86400).coerceAtLeast(0)
                state.put("from",earliest.coerceAtLeast(lower)).put("to",if(future)now+30L*86400 else now)
                candidates.filter {it.has("watermark")}.minOfOrNull {it.getLong("watermark")}?.let {state.put("watermark",it)}
            }
            out.put(key,state)
        }
        return out
    }
    fun matchesProvider(row:JSONObject,settings:JSONObject,provider:String):Boolean {
        val w=row.getJSONObject("releaseWatch")
        val selected=if(w.optString("providerMode")=="custom")w.getJSONArray("providerIds") else settings.getJSONArray("providers")
        return provider in providers && (0 until selected.length()).any {selected.getString(it)==provider}
    }
    fun failureDiagnostics(state:JSONObject,current:JSONObject,category:String):JSONObject {
        require(category in setOf("auth","rate_limit","network","other"))
        state.put("diagnostics",JSONObject(current.toString()).put("errorCategory",category))
        return JSONObject().put("result","failure").put("error_category",category).put("changes_bucket",TelemetryPolicy.files(current.optInt("sourceChanges"))).put("matched_bucket",TelemetryPolicy.files(current.optInt("watchedChanges")))
    }
    /** Initial check covers enrollment; overlap catches late source indexing, stable IDs deduplicate. */
    fun pastFrom(state:JSONObject,enrollment:Long,now:Long):Long {
        if(state.has("from"))return state.getLong("from")
        val lower=(now-30L*86400).coerceAtLeast(0)
        return maxOf(lower,enrollment,minOf(now,state.optLong("watermark",enrollment)-86400L)).coerceAtMost(now)
    }
    fun evidenceNumbers(change:JSONObject,provider:String,type:String,item:String,now:Long):Pair<Int,Int?>? {
        if(change.optString("changeType")!=type || change.optString("itemType")!=item || change.optString("showType")!="series" || change.optString("streamingOptionType")!="subscription" || change.optJSONObject("service")?.optString("id")!=provider)return null
        fun number(name:String):Int? {val value=change.opt(name);return (value as? Number)?.let { if(it.toDouble()%1.0==0.0 && it.toLong() in 1..Int.MAX_VALUE.toLong())it.toInt() else null }}
        val season=number("season") ?: return null
        val episode=if(item=="episode")number("episode") ?: return null else null
        if(type in setOf("new","removed") && (change.opt("timestamp") !is Number || change.optLong("timestamp") !in 1..now))return null
        return season to episode
    }
    fun eventId(key:String,provider:String,season:Int,episode:Int?) = "$key|$provider|$season|${episode ?: "season"}"
    fun quota(used:Int)=used in 0 until BUDGET
    fun notifyCandidate(baseline:Boolean,alreadyNotified:Boolean,enabled:Boolean)=!baseline && !alreadyNotified && enabled
}
