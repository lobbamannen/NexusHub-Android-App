package se.lobbamannen.nexushub.app.weather

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.*
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs

interface WeatherStore { fun read():String?; fun write(value:String) }
data class WeatherHttpResponse(val code:Int,val body:String="",val headers:Map<String,String> = emptyMap()) {fun header(n:String)=headers.entries.firstOrNull {it.key.equals(n,true)}?.value}
fun interface WeatherTransport { fun get(url:String,headers:Map<String,String>):WeatherHttpResponse }
class WeatherNetwork:WeatherTransport {
 override fun get(url:String,headers:Map<String,String>):WeatherHttpResponse {
  val connection=URL(url).openConnection() as HttpURLConnection
  try {
   connection.connectTimeout=10000;connection.readTimeout=12000;connection.instanceFollowRedirects=false
   connection.setRequestProperty("User-Agent",USER_AGENT);connection.setRequestProperty("Accept","application/json")
   headers.forEach { (k,v)->connection.setRequestProperty(k,v) }
   val code=connection.responseCode
   val resultHeaders=connection.headerFields.filterKeys {it!=null}.mapValues {it.value.firstOrNull()?:""}
   if(code!=200&&code!=203) return WeatherHttpResponse(code,headers=resultHeaders)
   require(connection.contentLengthLong<=MAX_BYTES) {"Response too large"}
   val bytes=connection.inputStream.use {input->
    val output=java.io.ByteArrayOutputStream();val b=ByteArray(8192)
    val deadline=System.nanoTime()+20_000_000_000L
    while(true) {check(System.nanoTime()<deadline){"Response timeout"};val n=input.read(b);if(n<0)break;require(output.size()+n<=MAX_BYTES){"Response too large"};output.write(b,0,n)}
    output.toByteArray()
   }
   return WeatherHttpResponse(code,String(bytes,Charsets.UTF_8),resultHeaders)
  } finally {connection.disconnect()}
 }
 companion object {const val MAX_BYTES=2*1024*1024;const val USER_AGENT="NexusHubWeather/1.0 (+https://github.com/lobbamannen/NexusHub-Android-App)"}
}

class WeatherRepository(private val store:WeatherStore,private val transport:WeatherTransport=WeatherNetwork(),private val clock:()->Long={System.currentTimeMillis()},private val changed:()->Unit={},private val metAllowedNow:()->Boolean={true}) {
 private val lock=Any()
 private var persisted=try {JSONObject(store.read()?:"{}")}catch(_:Exception){JSONObject()}
 private var location=try {WeatherLocation.from(persisted.getJSONObject("location"))}catch(_:Exception){WeatherLocation.DEFAULT}
 private var generation=0L
 private var inflight=false
 private var updating=false
 private var error:String?=null
 private var lastAttempt=Long.MIN_VALUE / 2
 private val entries=persisted.optJSONObject("entries")?:JSONObject()
 private val limits=persisted.optJSONObject("limits")?:JSONObject()
 private val active=persisted.optJSONObject("active")?:JSONObject()
 private fun key(loc:WeatherLocation,p:String)=loc.key()+"|"+p
 private fun save() {
  // no-store runs may be displayed in memory, but must never reach disk.
  val durableEntries=JSONObject()
  entries.keys().forEach {key->
   val entry=entries.getJSONObject(key)
   if(entry.optJSONObject("http")?.optBoolean("noStore")!=true)durableEntries.put(key,entry)
  }
  val durableActive=JSONObject()
  active.keys().forEach {locationKey->
   val provider=active.getString(locationKey)
   if(durableEntries.has("$locationKey|$provider"))durableActive.put(locationKey,provider)
  }
  store.write(JSONObject().put("location",location.json()).put("entries",durableEntries)
   .put("active",durableActive).put("limits",limits).toString())
 }
 private fun entry(loc:WeatherLocation,provider:String)=entries.optJSONObject(key(loc,provider))
 private fun selectedEntry():JSONObject? {
  val selected=active.optString(location.key())
  if(selected.isNotEmpty()) {
   val chosen=entry(location,selected)
   if(snapshot(chosen,location)!=null)return chosen
   // Eviction, no-store omission or corrupt disk data can leave a dangling pointer.
   active.remove(location.key())
  }
  // Migrate legacy caches and recover a surviving whole run when a pointer dangles.
  val legacy=listOfNotNull(entry(location,"smhi"),entry(location,"metno"))
   .filter {snapshot(it,location)!=null}
   .maxByOrNull {it.optLong("fetchedAt")}?:return null
  active.put(location.key(),legacy.getString("provider"))
  return legacy
 }
 private fun snapshot(entry:JSONObject?,loc:WeatherLocation):WeatherSnapshot?=try {
  entry?.let {WeatherParser.parse(it.getString("provider"),it.getString("body"),loc)}
 }catch(_:Exception){null}
 private fun currentPoint(forecast:WeatherSnapshot?,now:Long):WeatherPoint? = forecast?.points
  ?.filter {it.temperature!=null&&abs(it.time-now)<=NEAR_NOW_MILLIS}
  ?.minByOrNull {abs(it.time-now)}
 private fun reusable(entry:JSONObject?,loc:WeatherLocation,now:Long):Boolean =
  entry!=null&&entry.optLong("expiresAt")>now&&currentPoint(snapshot(entry,loc),now)!=null
 private fun select(loc:WeatherLocation,provider:String) {
  active.put(loc.key(),provider)
  save()
 }
 fun setLocation(loc:WeatherLocation):JSONObject=synchronized(lock) {
  location=loc;generation++;error=null;updating=false;lastAttempt=Long.MIN_VALUE / 2;save();changed();state()
 }
 fun state():JSONObject=synchronized(lock) {
  val now=clock();val e=selectedEntry();val forecast=snapshot(e,location)
  val usable=forecast?.points?.filter {it.time>=now-NEAR_NOW_MILLIS&&it.time<=now+11*86400000L}.orEmpty()
  val current=currentPoint(forecast,now)
  val status=if(forecast==null){if(error==null)"empty" else "error"} else if(error!=null||e!!.optLong("expiresAt")<=now||current==null)"stale" else "fresh"
  val zone=ZoneId.of(location.timeZone);val today=Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
  val days=JSONArray()
  usable.groupBy {Instant.ofEpochMilli(it.time).atZone(zone).toLocalDate()}.toSortedMap().entries.filter {it.key>=today}.take(10).forEach { (date,points)->
   val temperatures=points.mapNotNull {it.temperature}
   val start=date.atStartOfDay(zone).toInstant().toEpochMilli();val end=date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
   // Partial when endpoints or an hourly sample are absent; sparse long-range extrema stay explicitly partial.
   val partial=temperatures.size!=points.size||points.minOf {it.time}>start||
    points.maxOf {it.time}<end-3600000||points.zipWithNext().any {(a,b)->b.time-a.time>3600000}
   val condition=points.groupingBy {it.condition}.eachCount().maxByOrNull {it.value}?.key?:"unknown"
   days.put(JSONObject().put("date",date.toString()).value("min",temperatures.minOrNull()).value("max",temperatures.maxOrNull()).put("condition",condition).put("partial",partial))
  }
  JSONObject().put("location",location.json()).value("provider",forecast?.provider).value("fetchedAt",if(forecast!=null)e?.optLong("fetchedAt") else null).value("referenceTime",forecast?.referenceTime).value("expiresAt",if(forecast!=null)e?.optLong("expiresAt") else null).put("updating",updating).put("status",status).value("error",error).value("current",current?.json(location)).put("hourly",JSONArray(usable.map {it.json(location)})).put("daily",days).put("sun",WeatherMath.sun(today,location).json()).value("feelsLike",current?.let {WeatherMath.feelsLike(it)}).put("feelsLikeMethod",WeatherMath.FEELS_LIKE_METHOD)
 }
 /** Called on WorkManager's thread. One in-flight transport across every caller/location.
  * Manual refresh intentionally follows exactly the same freshness and debounce policy.
  */
 @Suppress("UNUSED_PARAMETER")
 fun refresh(manual:Boolean=false,allowMet:Boolean=true) {
  val loc:WeatherLocation;val token:Long;val now=clock()
  synchronized(lock) {
   if(inflight||now-lastAttempt<30_000L)return
   val e=selectedEntry()
   if(reusable(e,location,now))return
   loc=location;token=generation;inflight=true;updating=true;lastAttempt=now;error=null
  }
  changed()
  var failure:String?=null
  try {
   for(provider in listOf("smhi","metno")) {
    if(provider=="metno"&&(!allowMet||!metAllowedNow()))break
    val old:JSONObject?
    synchronized(lock) {
     if(token!=generation)return
     if(limits.optLong(provider)>now) {failure="Vädertjänsten ber oss vänta. Försök senare.";return}
     old=entry(loc,provider)?.let {JSONObject(it.toString())}
    }
    // A fallback's own Expires also applies when a primary has failed.
    if(reusable(old,loc,now)) {
     synchronized(lock) {
      if(token!=generation||loc!=location)return
      select(loc,provider)
      error=null
     }
     failure=null
     return
    }
    val headers=mutableMapOf<String,String>()
    old?.optString("lastModified")?.takeIf {it.isNotEmpty()}?.let {headers["If-Modified-Since"]=it}
    old?.optString("etag")?.takeIf {it.isNotEmpty()}?.let {headers["If-None-Match"]=it}
    val lat=String.format(Locale.US,"%.4f",loc.latitude);val lon=String.format(Locale.US,"%.4f",loc.longitude)
    val url=if(provider=="smhi")"https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/$lon/lat/$lat/data.json" else "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=$lat&lon=$lon"
    try {
     val requestedAt=clock()
     val response=transport.get(url,headers)
     if(response.code==429) {synchronized(lock){limits.put(provider,retryAt(response.header("Retry-After"),now));try {save()}catch(_:Exception){}};failure="Vädertjänsten ber oss vänta. Försök senare.";return}
     val body=when(response.code) {200,203->response.body;304->old?.getString("body")?:throw IllegalStateException("No cached response");else->throw IllegalStateException("HTTP ${response.code}")}
     val forecast=WeatherParser.parse(provider,body,loc)
     val receivedAt=clock()
     require(currentPoint(forecast,receivedAt)!=null) {"Forecast has no usable near-now temperature"}
     val metadata=mergeHttpMetadata(response,old,requestedAt,receivedAt)
     val result=JSONObject().put("provider",provider).put("body",body)
      .put("fetchedAt",receivedAt).put("expiresAt",metadata.getLong("expiresAt"))
      .put("http",metadata)
      .put("etag",response.header("ETag")?:(if(response.code==304)old?.optString("etag") else null)?:"")
      .put("lastModified",response.header("Last-Modified")?:(if(response.code==304)old?.optString("lastModified") else null)?:"")
     synchronized(lock) {
      if(token!=generation||loc!=location)return
      entries.put(key(loc,provider),result)
      // Keep at most four location/provider snapshots; current result cannot be removed.
      while(entries.length()>8) {
       val oldest=entries.keys().asSequence().filter {it!=key(loc,provider)}
        .minByOrNull {entries.getJSONObject(it).optLong("fetchedAt")}?:break
       entries.remove(oldest)
       val stalePointers=active.keys().asSequence()
        .filter {"$it|${active.getString(it)}"==oldest}.toList()
       stalePointers.forEach {active.remove(it)}
      }
      select(loc,provider);error=null;failure=null
     }
     return
    } catch(_:Exception) {failure="Vädret kunde inte uppdateras. Senaste prognosen visas om den finns."}
   }
   if(failure==null)failure="Vädret kunde inte uppdateras just nu."
  } finally {
   synchronized(lock) {inflight=false;if(token==generation){updating=false;error=failure}}
   changed()
  }
 }
 fun search(query:String):JSONArray {
  val q=query.trim();require(q.length in 2..100){"Skriv minst två tecken."}
  val response=transport.get("https://geocoding-api.open-meteo.com/v1/search?name=${java.net.URLEncoder.encode(q,"UTF-8")}&count=8&language=sv",emptyMap())
  require(response.code==200){"Platssökningen är inte tillgänglig just nu."}
  val results=JSONObject(response.body).optJSONArray("results")?:return JSONArray()
  val places=JSONArray()
  for(i in 0 until minOf(8,results.length())) {try {val p=results.getJSONObject(i);val name=listOf(p.getString("name"),p.optString("admin1"),p.optString("country")).filter {it.isNotEmpty()}.distinct().joinToString(", ");places.put(WeatherLocation(name.take(120),p.getDouble("latitude"),p.getDouble("longitude"),p.getString("timezone")).json())}catch(_:Exception){}}
  return places
 }
 companion object {
  fun httpDate(value:String?):Long?=try {value?.let {ZonedDateTime.parse(it,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()}}catch(_:Exception){null}
  fun retryAt(value:String?,now:Long):Long {val seconds=value?.trim()?.toLongOrNull();val date=httpDate(value);return maxOf(now+30*60*1000L,if(seconds!=null&&seconds>=0)now+minOf(seconds,7*86400L)*1000 else date?:0)}
  private const val NEAR_NOW_MILLIS=90*60*1000L
  private const val DEFAULT_TTL_MILLIS=2*60*60*1000L

  /** RFC 9111 freshness: max-age overrides Expires; no-cache always revalidates.
   * A 304 refreshes receipt/age while retaining omitted policy headers and validators.
   */
  private fun mergeHttpMetadata(response:WeatherHttpResponse,old:JSONObject?,requestedAt:Long,now:Long):JSONObject {
   val retained=if(response.code==304)old?.optJSONObject("http") else null
   fun policy(name:String,key:String):String = response.header(name)?:retained?.optString(key)?:""
   val cacheControl=policy("Cache-Control","cacheControl")
   val expires=policy("Expires","expires")
   val directives=cacheControl.split(',').map {it.trim().substringBefore('=').lowercase(Locale.US)}
   val noCache="no-cache" in directives
   val noStore="no-store" in directives
   val maxAge=Regex("(?:^|,)\\s*max-age\\s*=\\s*\"?(\\d+)",RegexOption.IGNORE_CASE)
    .find(cacheControl)?.groupValues?.get(1)?.toLongOrNull()?.coerceAtMost(7*86400L)
   // Revalidation establishes a new response date; old Age must not leak into a new 304.
   val date=response.header("Date")
   val dateMillis=httpDate(date)?:now
   val ageSeconds=response.header("Age")?.toLongOrNull()?.coerceIn(0,7*86400L)?:0L
   val responseDelay=maxOf(0L,now-requestedAt)
   val initialAge=maxOf(0L,now-dateMillis,ageSeconds*1000+responseDelay)
   val legacyLifetime=if(response.code==304&&old!=null)
    (old.optLong("expiresAt")-old.optLong("fetchedAt")).coerceIn(0,DEFAULT_TTL_MILLIS)
    else DEFAULT_TTL_MILLIS
   val lifetime=when {
    noCache||noStore->0L
    maxAge!=null->maxAge*1000
    httpDate(expires)!=null->maxOf(0L,httpDate(expires)!!-dateMillis)
    retained?.has("freshnessLifetimeMillis")==true->retained.getLong("freshnessLifetimeMillis")
    else->legacyLifetime
   }
   val expiresAt=now+maxOf(0L,lifetime-initialAge)
   return JSONObject().put("cacheControl",cacheControl).put("expires",expires)
    .put("date",date?:"").put("age",ageSeconds).put("requestedAt",requestedAt).put("receivedAt",now)
    .put("initialAgeMillis",initialAge).put("freshnessLifetimeMillis",lifetime)
    .put("noStore",noStore).put("expiresAt",expiresAt)
  }
 }
}
