package se.lobbamannen.nexushub.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.os.Build
import android.util.AtomicFile
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import org.json.*
import java.io.File
import java.net.URL
import java.net.URLEncoder
import java.time.*
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

/** One process-wide journal lock; each network attempt is budgeted durably before execution. */
class ReleaseWatch(private val context:Context) {
    companion object {
        val lock=Any()
        private val workerLock=Any()
        @Volatile var listener:(()->Unit)?=null
        @Volatile var running=false
        fun schedule(c:Context) {
            val manager=WorkManager.getInstance(c)
            val migration=c.getSharedPreferences("nexus-watch-schedule",Context.MODE_PRIVATE)
            if(!migration.getBoolean("daily1500v1",false)) {
                // Retire old automatic jobs once; never cancel a newly requested manual check.
                manager.cancelUniqueWork("nexus-release-periodic")
                manager.cancelUniqueWork("nexus-release-now")
                migration.edit().putBoolean("daily1500v1",true).commit()
            }
            val now=Instant.now();val target=WatchSchedule.next(now)
            val work=OneTimeWorkRequestBuilder<ReleaseWorker>()
                .setInputData(workDataOf("daily" to true))
                .setInitialDelay(Duration.between(now,target).toMillis(),TimeUnit.MILLISECONDS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            manager.enqueueUniqueWork("nexus-release-daily-"+WatchSchedule.day(target),ExistingWorkPolicy.KEEP,work)
        }
        fun check(c:Context) { WorkManager.getInstance(c).enqueueUniqueWork("nexus-release-now",ExistingWorkPolicy.KEEP,OneTimeWorkRequestBuilder<ReleaseWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()) }
    }
    private val file=AtomicFile(File(context.filesDir,"release-watch-v1.json"))
    private fun load():JSONObject=if(!file.baseFile.exists() && !File(file.baseFile.path+".bak").exists())JSONObject().put("events",JSONArray()).put("history",JSONArray()) else JSONObject(file.openRead().bufferedReader().use { it.readText() })
    private fun save(s:JSONObject) { val stream=file.startWrite(); try { stream.write(s.toString().toByteArray());file.finishWrite(stream) } catch(e:Exception){file.failWrite(stream);throw e}; listener?.invoke() }
    fun changedKey()=synchronized(lock) { val s=load();s.remove("unauthorized");s.remove("error");s.remove("retryAt");s.put("credentialGeneration",s.optLong("credentialGeneration")+1);save(s) }
    fun notificationGranted()=NotificationManagerCompat.from(context).areNotificationsEnabled() && (Build.VERSION.SDK_INT<33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)
    fun state():JSONObject=synchronized(lock) {
        val s=load(); val month=YearMonth.now(ZoneOffset.UTC).toString()
        JSONObject().put("configured",WatchCredentialStore(context).get().isNotBlank()).put("running",running).put("notificationGranted",notificationGranted()).put("usedThisMonth",if(s.optString("month")==month)s.optInt("used") else 0).put("monthlyBudget",WatchRules.BUDGET).put("events",s.optJSONArray("events") ?: JSONArray()).put("history",s.optJSONArray("history") ?: JSONArray()).put("partial",s.optString("error").startsWith("Delvis")).put("capabilities",JSONArray((WatchRules.providers+setOf("viaplay","tv4play")).map { JSONObject().put("provider",it).put("available",it in WatchRules.providers).put("upcoming",it in setOf("netflix","prime","disney","hbo")) })).also { out -> listOf("lastAttemptAt","lastSuccessfulCheck","error").forEach { if(s.has(it))out.put(it,s.get(it)) } }
    }
    fun snapshot(p:JSONObject):JSONObject=synchronized(lock) {
        require(p.getInt("v")==1 && p.getLong("generation")>=0)
        val shas=p.getJSONObject("sourceShas");require(shas.getString("series").matches(Regex("[a-fA-F0-9]{40}")))
        require(shas.isNull("settings") || shas.getString("settings").matches(Regex("[a-fA-F0-9]{40}")))
        val settings=p.getJSONObject("settings");require(settings.getString("country")=="se" && settings.getString("timeZone")=="Europe/Stockholm" && settings.getInt("checkIntervalHours") in listOf(6,24) && settings.optString("dailyCheckTime","15:00")=="15:00")
        val series=p.getJSONArray("series");require(series.length()<=500 && p.toString().length<=500000)
        val keys=mutableSetOf<String>()
        for(i in 0 until series.length()) { val row=series.getJSONObject(i);require(row.getString("key").length in 1..200 && keys.add(row.getString("key")));val w=row.getJSONObject("releaseWatch");require(w.getString("providerMode") in listOf("my_subscriptions","custom"));require(w.getJSONArray("providerIds").length()<=30) }
        val q=settings.getJSONObject("quietHours");LocalTime.parse(q.getString("from"));LocalTime.parse(q.getString("to"))
        val s=load();val old=s.optJSONObject("snapshot");require(old==null || p.getLong("generation")>=old.getLong("generation")) { "Föråldrad konfiguration" }
        if(old!=null && p.getLong("generation")==old.getLong("generation")) { require(old.toString()==p.toString()) { "Konfigurationskonflikt" };return@synchronized JSONObject().put("accepted",true) }
        // A new enrollment starts with a baseline. Disabling drops it, so re-enabling cannot push history.
        val bases=s.optJSONObject("baselines") ?: JSONObject();val active=mutableSetOf<String>()
        for(i in 0 until series.length()){val row=series.getJSONObject(i);if(row.getJSONObject("releaseWatch").optBoolean("enabled")) providers(row,settings).forEach { active.add(row.getString("key")+"|"+it) }}
        bases.keys().asSequence().toList().filter { it.substringBefore("|upcomingReady") !in active }.forEach { bases.remove(it) }
        active.filter { !bases.has(it) }.forEach { bases.put(it,Instant.now().epochSecond) }
        if(old!=null) {
            val previous=old.getJSONArray("series")
            val prior=(0 until previous.length()).map { previous.getJSONObject(it) }.associateBy { it.getString("key") }
            for(i in 0 until series.length()) {
                val row=series.getJSONObject(i);val before=prior[row.getString("key")]?.getJSONObject("releaseWatch") ?: continue
                val after=row.getJSONObject("releaseWatch")
                if((!before.optBoolean("episodes") && after.optBoolean("episodes")) || (!before.optBoolean("seasons") && after.optBoolean("seasons")))
                    providers(row,settings).forEach { provider -> val stem=row.getString("key")+"|"+provider;bases.put(stem,Instant.now().epochSecond);bases.remove("$stem|upcomingReady|episode");bases.remove("$stem|upcomingReady|season") }
            }
        }
        s.put("baselines",bases).put("snapshot",JSONObject(p.toString()));save(s);schedule(context);JSONObject().put("accepted",true)
    }
    private fun providers(row:JSONObject,settings:JSONObject):Set<String> { val w=row.getJSONObject("releaseWatch");val a=if(w.optString("providerMode")=="custom") w.getJSONArray("providerIds") else settings.getJSONArray("providers");return (0 until a.length()).map { a.getString(it) }.toSet().intersect(WatchRules.providers) }
    fun markRead(ids:JSONArray):JSONObject=synchronized(lock){require(ids.length()<=10000);val wanted=(0 until ids.length()).map { ids.getString(it) }.toSet();val s=load();val events=s.optJSONArray("events") ?: JSONArray();for(i in 0 until events.length()){val e=events.getJSONObject(i);if(e.getString("id") in wanted){e.put("readAt",Instant.now());e.remove("pendingAvailableNotification")}};save(s);JSONObject().put("updated",true)}
    fun export():JSONObject=synchronized(lock){val s=load();JSONObject().put("events",s.optJSONArray("events") ?: JSONArray()).put("history",s.optJSONArray("history") ?: JSONArray())}
    fun restoreHistory(incoming:JSONArray):JSONObject=synchronized(lock) {
        require(incoming.length()<=10000 && incoming.toString().length<=2_000_000)
        for(i in 0 until incoming.length()) {
            val e=incoming.getJSONObject(i)
            require(e.getString("id").length in 1..400 && e.getString("country")=="SE" && e.getString("sourceName")=="Streaming Availability API")
            require(e.getString("provider") in WatchRules.providers && e.getInt("season")>=1)
            require(e.getString("kind") in setOf("episode","season") && e.getString("availability") in setOf("confirmed_available","confirmed_upcoming","unknown","removed"))
            Instant.parse(e.getString("observedAt"))
            if(e.getString("kind")=="episode")require(e.getInt("episode")>=1)
            for(field in listOf("readAt","notifiedAt"))if(e.has(field))Instant.parse(e.getString(field))
            if(e.has("releaseDate"))LocalDate.parse(e.getString("releaseDate"))
        }
        val s=load();val existing=s.optJSONArray("events") ?: JSONArray()
        val merged=WatchRules.mergeEvents(existing,incoming,true)
        if(merged.toString()!=existing.toString()){s.put("events",merged);save(s)}
        JSONObject().put("merged",incoming.length())
    }

    private fun history(s:JSONObject,message:String) {val old=s.optJSONArray("history") ?: JSONArray();val h=JSONArray();for(i in maxOf(0,old.length()-99) until old.length())h.put(old.get(i));h.put(JSONObject().put("at",Instant.now()).put("message",message));s.put("history",h)}
    /** A late/replayed dated job cannot start another automatic check on the same local day. */
    fun runDaily():Boolean=synchronized(workerLock) {
        val now=Instant.now()
        val due=synchronized(lock){WatchSchedule.due(now,load().optString("lastDailyAttemptDay"))}
        if(!due)return@synchronized true
        val completed=run()
        // Pagination resumes the same pinned daily check; do not defer unread pages a whole day.
        val morePages=synchronized(lock){val latest=load();latest.optString("error").startsWith("Delvis") && WatchRules.quota(latest.optInt("used")) && !latest.optBoolean("unauthorized")}
        val finished=completed && !morePages
        if(finished)synchronized(lock){val latest=load();latest.put("lastDailyAttemptDay",WatchSchedule.day(now));save(latest)}
        finished
    }
    /** Each stream keeps a pinned interval and cursor; only a fully consumed interval advances watermark. */
    fun run():Boolean=synchronized(workerLock) {
        if(running)return@synchronized true
        running=true;listener?.invoke()
        try {
            val s=synchronized(lock){load()};val snapshot=s.optJSONObject("snapshot") ?: return@synchronized true
            val generation=snapshot.getLong("generation");val credentialGeneration=s.optLong("credentialGeneration")
            fun checkpoint()=synchronized(lock) {
                val latest=load()
                if(latest.optJSONObject("snapshot")?.optLong("generation")!=generation || latest.optLong("credentialGeneration")!=credentialGeneration)throw ConfigurationChanged()
                s.put("events",WatchRules.mergeEvents(s.optJSONArray("events") ?: JSONArray(),latest.optJSONArray("events") ?: JSONArray(),false))
                save(s)
            }
            val key=WatchCredentialStore(context).get();if(key.isBlank()){s.put("error","API-nyckel saknas");checkpoint();return@synchronized true}
            if(s.optBoolean("unauthorized"))return@synchronized true
            val diagnostics=JSONObject().put("sourceChanges",0).put("watchedChanges",0).put("rejectedEvidence",0).put("baselineEvents",0).put("newEvents",0).put("noticesPosted",0).put("notificationReason","none")
            val now=Instant.now();if(s.optLong("retryAt")>now.epochSecond)return@synchronized false
            if(now.toEpochMilli()-s.optLong("attemptMillis")<15*60*1000)return@synchronized !s.has("error")
            s.put("attemptMillis",now.toEpochMilli()).put("lastAttemptAt",now);s.remove("error");checkpoint()
            val month=YearMonth.now(ZoneOffset.UTC).toString();if(s.optString("month")!=month)s.put("month",month).put("used",0)
            val settings=snapshot.getJSONObject("settings");val rows=snapshot.getJSONArray("series")
            val watched=(0 until rows.length()).map { rows.getJSONObject(it) }.filter { it.getJSONObject("releaseWatch").optBoolean("enabled") && it.optString("imdbId").matches(Regex("tt[0-9]{5,12}")) }
            val bases=s.optJSONObject("baselines") ?: JSONObject()
            val enrolledAt=watched.flatMap {row->providers(row,snapshot.getJSONObject("settings")).map {provider->bases.optLong(row.getString("key")+"|"+provider,now.epochSecond)}}.minOrNull() ?: now.epochSecond
            val byImdb=watched.groupBy { it.getString("imdbId") }
            val enabledProviders=watched.flatMap { providers(it,settings) }.toSet().sorted()
            val streams=listOf("new","removed","upcoming").flatMap { change ->
                val group=enabledProviders.filter { change!="upcoming" || it!="skyshowtime" }.joinToString(",")
                if(group.isBlank())emptyList() else listOf("$group|$change|season","$group|$change|episode")
            }
            val oldStates=s.optJSONObject("streams") ?: JSONObject()
            val states=WatchRules.rekeyStreams(oldStates,streams,now.epochSecond)
            if(oldStates.length()>0 && oldStates.keys().asSequence().toSet()!=streams.toSet())history(s,"Tjänstval ändrat; kvarvarande tjänsters olästa kontrollintervall återupptas med nya sidmarkörer")
            s.put("streams",states)
            val cycle=s.optLong("cycleStart",now.epochSecond).also { if(!s.has("cycleStart"))s.put("cycleStart",it) }
            var pages=0;var completed=0;val beginning=if(streams.isEmpty())0 else s.optInt("streamIndex")%streams.size
            while(pages<6 && streams.isNotEmpty() && WatchRules.quota(s.optInt("used"))) {
                val pending=streams.indices.map { (s.optInt("streamIndex",beginning)+it)%streams.size }.firstOrNull { states.optJSONObject(streams[it])?.optLong("completedCycle")!=cycle } ?: break
                s.put("streamIndex",pending)
                val stream=streams[pending]
                val parts=stream.split("|");val providerGroup=parts[0].split(",");val catalogs=providerGroup.joinToString(","){"$it.subscription"};val changeType=parts[1];val itemType=parts[2]
                val state=states.optJSONObject(stream) ?: JSONObject().also { states.put(stream,it) }
                val future=changeType=="upcoming"
                val current=Instant.now().epochSecond
                // Pinned windows older than the API's 31-day horizon cannot be resumed.
                if(state.has("from") && !WatchRules.windowValid(future,state.optLong("from"),state.optLong("to"),current)) {
                    state.remove("from");state.remove("to");state.remove("cursor")
                    state.put("watermark",current)
                    history(s,"Ett äldre ofullständigt flöde kunde inte återupptas inom källans 31-dagarsgräns")
                    checkpoint()
                }
                val lower=(current-30L*86400).coerceAtLeast(0)
                val from=if(state.has("from"))state.getLong("from") else if(future)current else WatchRules.pastFrom(state,enrolledAt,current)
                // API accepts past timestamps only within 31 days and future timestamps only within 31 days.
                val boundedFrom=if(state.has("from"))from else if(future)from.coerceIn(current,current+30L*86400) else from.coerceIn(lower,current)
                val to=if(state.has("to"))state.getLong("to") else if(future)current+30L*86400 else current
                val cursor=state.optString("cursor")
                if(!state.has("from"))state.put("from",boundedFrom).put("to",to)
                // Charge and checkpoint before attempting a request, including failed requests.
                s.put("used",s.optInt("used")+1);checkpoint()
                val url="https://api.movieofthenight.com/v4/changes?country=se&catalogs=${URLEncoder.encode(catalogs,"UTF-8")}&change_type=$changeType&item_type=$itemType&show_type=series&from=$boundedFrom&to=$to&order_direction=asc" + if(cursor.isBlank()) "" else "&cursor=${URLEncoder.encode(cursor,"UTF-8")}" 
                val conn=URL(url).openConnection() as HttpsURLConnection
                conn.instanceFollowRedirects=false;conn.connectTimeout=15000;conn.readTimeout=20000;conn.setRequestProperty("X-API-Key",key)
                try {
                    val code=conn.responseCode
                    if(code==401){NexusTelemetry.capture("watch_check_completed",WatchRules.failureDiagnostics(s,diagnostics,"auth"));s.put("unauthorized",true).put("error","API-nyckeln nekades (401)");checkpoint();return@synchronized true}
                    if(code==429){NexusTelemetry.capture("watch_check_completed",WatchRules.failureDiagnostics(s,diagnostics,"rate_limit"));val delay=conn.getHeaderField("Retry-After")?.toLongOrNull() ?: 3600;s.put("retryAt",current+delay.coerceIn(900,86400)).put("error","API-gräns (429), kontroll senare");checkpoint();return@synchronized false}
                    if(code!=200)error("Källan svarade HTTP $code")
                    val raw=conn.inputStream.use { input -> val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192);var n=input.read(buffer);while(n!=-1){require(out.size()+n<=4*1024*1024);out.write(buffer,0,n);n=input.read(buffer)};JSONObject(out.toString("UTF-8")) }
                    val changes=raw.getJSONArray("changes");val shows=raw.getJSONObject("shows")
                    require(changes.length()<=25)
                    diagnostics.put("sourceChanges",diagnostics.getInt("sourceChanges")+changes.length())
                    for(i in 0 until changes.length()) {
                        val change=changes.getJSONObject(i);val provider=change.optJSONObject("service")?.optString("id") ?: continue
                        if(provider in providerGroup)observeChange(s,change,shows,byImdb,settings,provider,changeType,itemType,current,diagnostics)
                    }
                    pages++
                    if(raw.getBoolean("hasMore")) {
                        val next=raw.getString("nextCursor");require(next.isNotBlank() && next.length<1000 && next!=cursor)
                        state.put("cursor",next)
                    } else {
                        state.remove("cursor");state.remove("from");state.remove("to")
                        state.put("watermark",if(future)current else to);completed++
                        state.put("completedCycle",cycle)
                        if(future) {
                            val baselines=s.optJSONObject("baselines") ?: JSONObject()
                            baselines.keys().asSequence().toList().filter { stem -> providerGroup.any { stem.endsWith("|$it") } }.forEach { baselines.put("$it|upcomingReady|$itemType",true) }
                        }
                    }
                    s.put("streamIndex",(s.optInt("streamIndex")+1)%streams.size)
                    // A cursor is persisted with observed events after every page, avoiding replay gaps.
                    checkpoint()
                } finally {conn.disconnect()}
                if(rawBudgetExhausted(s))break
            }
            if(streams.isEmpty())s.put("error","Inga bevakade serier med IMDb-identitet och stödd tjänst")
            else if(streams.all { states.optJSONObject(it)?.optLong("completedCycle")==cycle }) {
                s.put("lastSuccessfulCheck",Instant.now()).put("cycleStart",Instant.now().epochSecond)
                s.remove("error")
            } else s.put("error","Delvis kontrollerat: $completed av ${streams.size} flöden slutförda i denna körning; $pages sidor")
            history(s,"Kontrollerat $pages sidor; $completed slutförda flöden av ${streams.size}")
            synchronized(lock) {checkpoint();notifyPending(s,snapshot,diagnostics);s.put("diagnostics",diagnostics);history(s,"Källändringar: ${diagnostics.getInt("sourceChanges")}; bevakade: ${diagnostics.getInt("watchedChanges")}; avvisade belägg: ${diagnostics.getInt("rejectedEvidence")}; nya fynd: ${diagnostics.getInt("newEvents")}; tyst baslinje: ${diagnostics.getInt("baselineEvents")}; notisförsök: ${diagnostics.getInt("noticesPosted")} (${diagnostics.getString("notificationReason")})");save(s)}
            NexusTelemetry.capture("watch_check_completed",JSONObject().put("result",if(s.optString("error").startsWith("Delvis"))"partial" else if(s.has("error"))"failure" else "success").put("changes_bucket",TelemetryPolicy.files(diagnostics.getInt("sourceChanges"))).put("matched_bucket",TelemetryPolicy.files(diagnostics.getInt("watchedChanges"))).put("events_bucket",TelemetryPolicy.files(diagnostics.getInt("newEvents"))).put("notifications_bucket",TelemetryPolicy.files(diagnostics.getInt("noticesPosted"))).put("filter_reason",if(diagnostics.getInt("sourceChanges")==0)"no_changes" else if(diagnostics.getInt("watchedChanges")==0 && diagnostics.getInt("rejectedEvidence")==0)"no_match" else if(diagnostics.getInt("rejectedEvidence")>0)"evidence" else diagnostics.getString("notificationReason")))
            true
        } catch(_:ConfigurationChanged) { true }
        catch(e:Exception) { NexusTelemetry.capture("watch_check_completed",JSONObject().put("result","failure").put("error_category","other")); synchronized(lock){val latest=load();latest.put("error",e.message?.take(200) ?: "Kontrollen misslyckades");history(latest,"Kontrollen misslyckades; försöker senare");save(latest)};false }
        finally {running=false;listener?.invoke()}
    }
    private class ConfigurationChanged:Exception()
    private fun rawBudgetExhausted(s:JSONObject)=!WatchRules.quota(s.optInt("used"))
    private fun observeChange(s:JSONObject,change:JSONObject,shows:JSONObject,byImdb:Map<String,List<JSONObject>>,settings:JSONObject,provider:String,changeType:String,itemType:String,now:Long,diagnostics:JSONObject) {
        val show=shows.optJSONObject(change.optString("showId")) ?: return
        val imdb=show.optString("imdbId");val rows=byImdb[imdb]?.filter {WatchRules.matchesProvider(it,settings,provider)}?.takeIf {it.isNotEmpty()} ?: return
        diagnostics.put("watchedChanges",diagnostics.getInt("watchedChanges")+1)
        val numbers=WatchRules.evidenceNumbers(change,provider,changeType,itemType,now) ?: run {diagnostics.put("rejectedEvidence",diagnostics.getInt("rejectedEvidence")+1);return}
        val season=numbers.first;val episode=numbers.second
        val timestamp=change.optLong("timestamp",0)
        val events=s.optJSONArray("events") ?: JSONArray();val ids=(0 until events.length()).map { events.getJSONObject(it).getString("id") }.toSet()
        val bases=s.optJSONObject("baselines") ?: JSONObject()
        for(row in rows) {
            if(provider !in providers(row,settings))continue
            val enrollment=bases.optLong(row.getString("key")+"|"+provider,now)
            val old=(changeType=="new" && timestamp<=enrollment) || (changeType=="upcoming" && !bases.optBoolean(row.getString("key")+"|"+provider+"|upcomingReady|"+itemType))
            val id=WatchRules.eventId(row.getString("key"),provider,season,episode)
            if(id in ids) {
                for(j in 0 until events.length()) {
                    val previous=events.getJSONObject(j);if(previous.optString("id")!=id)continue
                    if(changeType!="upcoming" && timestamp<previous.optLong("changeTimestamp"))continue
                    val availability=when(changeType){"new"->"confirmed_available";"removed"->"removed";else->"confirmed_upcoming"}
                    if(changeType=="upcoming" && previous.optString("availability")=="confirmed_available")continue
                    val date=if(changeType=="upcoming" && timestamp>0)Instant.ofEpochSecond(timestamp).atZone(ZoneId.of("Europe/Stockholm")).toLocalDate().toString() else ""
                    if(previous.optString("availability")!=availability || date.isNotBlank() && previous.optString("releaseDate")!=date) {
                        val becameAvailable=previous.optString("availability")=="confirmed_upcoming" && availability=="confirmed_available" && !old
                        previous.put("availability",availability).put("observedAt",Instant.ofEpochSecond(now).toString())
                        if(becameAvailable)previous.put("baseline",false).put("pendingAvailableNotification",true)
                        if(date.isNotBlank())previous.put("releaseDate",date).put("datePrecision","day")
                    }
                    if(changeType!="upcoming")previous.put("changeTimestamp",timestamp)
                }
                continue
            }
            val event=JSONObject().put("id",id).put("seriesKey",row.getString("key")).put("imdbId",imdb).put("title",row.getString("title")).put("season",season).put("provider",provider).put("country","SE").put("kind",itemType).put("availability",when(changeType){"upcoming"->"confirmed_upcoming";"removed"->"removed";else->"confirmed_available"}).put("observedAt",Instant.ofEpochSecond(now).toString()).put("datePrecision",if(changeType=="upcoming" && timestamp>0)"day" else "unknown").put("sourceName","Streaming Availability API")
            if(changeType!="upcoming")event.put("changeTimestamp",timestamp)
            if(episode!=null)event.put("episode",episode)
            if(changeType=="upcoming" && timestamp>0)event.put("releaseDate",Instant.ofEpochSecond(timestamp).atZone(ZoneId.of("Europe/Stockholm")).toLocalDate().toString())
            val link=change.optString("link");if(link.startsWith("https://"))event.put("sourceUrl",link)
            if(old)event.put("readAt",Instant.ofEpochSecond(now).toString()).put("baseline",true)
            val counter=if(old)"baselineEvents" else "newEvents";diagnostics.put(counter,diagnostics.getInt(counter)+1)
            events.put(event)
        }
        s.put("events",events)
    }
    private fun notifyPending(s:JSONObject,snapshot:JSONObject,diagnostics:JSONObject) {
        if(!notificationGranted()){diagnostics.put("notificationReason","permission");return}
        val settings=snapshot.getJSONObject("settings");val q=settings.getJSONObject("quietHours")
        if(WatchRules.quiet(q.optBoolean("enabled"),q.getString("from"),q.getString("to"),LocalTime.now(ZoneId.of("Europe/Stockholm")))){diagnostics.put("notificationReason","quiet");return}
        val manager=context.getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel("series-releases","Seriebevakning",NotificationManager.IMPORTANCE_DEFAULT))
        val rows=snapshot.getJSONArray("series");val active=(0 until rows.length()).map { rows.getJSONObject(it) }.associateBy { it.getString("key") }
        val events=s.optJSONArray("events") ?: return
        val groups=(0 until events.length()).map { events.getJSONObject(it) }.filter { e ->
            val row=active[e.getString("seriesKey")] ?: return@filter false;val w=row.getJSONObject("releaseWatch");val episode=e.optString("kind")=="episode"
            val pendingAvailable=e.optBoolean("pendingAvailableNotification") && e.optString("availability")=="confirmed_available"
            val enrolled=s.optJSONObject("baselines")?.optLong(e.getString("seriesKey")+"|"+e.getString("provider"),Long.MAX_VALUE) ?: Long.MAX_VALUE
            WatchRules.notifyCandidate(e.optBoolean("baseline"),e.has("notifiedAt") && !pendingAvailable,w.optBoolean("enabled") && e.getString("provider") in providers(row,settings) && WatchRules.notificationEnabled(e.optString("availability"),w.optBoolean(if(episode)"episodes" else "seasons"),settings.optBoolean(if(episode)"notifyNewEpisodes" else "notifyNewSeasons"),settings.optBoolean("notifyUpcoming"))) && (!e.has("readAt") || pendingAvailable) && Instant.parse(e.getString("observedAt")).epochSecond>=enrolled && Duration.between(Instant.parse(e.getString("observedAt")),Instant.now()).toDays()<7
        }.groupBy { "${it.getString("seriesKey")}|${it.getString("provider")}|${it.getInt("season")}|${it.getString("availability")}" }
        if(groups.isEmpty())diagnostics.put("notificationReason",if(diagnostics.getInt("baselineEvents")>0)"baseline" else "already_handled")
        for((tag,list) in groups) {
            val e=list.first();val target=e.optString("imdbId").ifBlank { e.getString("seriesKey") }
            val intent=Intent(context,MainActivity::class.java).putExtra("nexus.series",target).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val pending=PendingIntent.getActivity(context,tag.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            // Persist before dispatch: interrupted workers cannot duplicate the same release push.
            list.forEach { it.put("notifiedAt",Instant.now());it.remove("pendingAvailableNotification") };save(s)
            diagnostics.put("noticesPosted",diagnostics.getInt("noticesPosted")+1)
            manager.notify(tag,1,NotificationCompat.Builder(context,"series-releases").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(e.getString("title")).setContentText("${if(e.optString("availability")=="confirmed_upcoming") "Kommande i Sverige" else "Nytt i Sverige"} på ${e.getString("provider")}: säsong ${e.getInt("season")} ${if(list.size==1 && e.has("episode"))"· avsnitt ${e.getInt("episode")}" else "(${list.size} uppgifter)"}").setContentIntent(pending).setAutoCancel(true).build())
        }
    }
}
class ReleaseWorker(context:Context,params:WorkerParameters):Worker(context,params) {
 override fun doWork():Result {
  val daily=inputData.getBoolean("daily",false)
  return try {
   val watch=ReleaseWatch(applicationContext)
   val before=watch.state().optString("lastAttemptAt")
   val successful=if(daily)watch.runDaily() else watch.run()
   val after=watch.state()
   if(after.optString("lastAttemptAt")!=before)recordNativeActivity(applicationContext,"media","release_check",if(successful && after.optString("error").isBlank())"succeeded" else "failed","Seriebevakning kontrollerad",JSONObject().put("lastAttemptAt",after.optString("lastAttemptAt")).put("partial",after.optBoolean("partial")).put("error",after.optString("error")).put("events",after.optJSONArray("events")?.length()?:0))
   if(successful)Result.success() else Result.retry()
  } finally { if(daily)ReleaseWatch.schedule(applicationContext) }
 }
}
