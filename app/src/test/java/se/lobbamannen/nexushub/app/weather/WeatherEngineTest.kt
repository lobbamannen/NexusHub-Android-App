package se.lobbamannen.nexushub.app.weather

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

class WeatherEngineTest {
 private fun fixture(n:String)=File("../tests/fixtures/weather/$n.json").let { if(it.exists()) it else File("tests/fixtures/weather/$n.json") }.readText()
 @Test fun realForecastsAreWholeValidSnapshots() {
  val s=WeatherParser.parse("smhi",fixture("smhi"),WeatherLocation.DEFAULT)
  val m=WeatherParser.parse("metno",fixture("metno"),WeatherLocation.DEFAULT)
  assertTrue(s.points.size>24);assertTrue(m.points.size>24)
  assertEquals(1.0,s.points.first().precipitationHours!!,0.001)
  assertTrue(m.points.any { it.precipitationHours==6.0 })
 }
 @Test fun noInventedMissingValues() {
  val j=JSONObject(fixture("smhi"));j.getJSONArray("timeSeries").getJSONObject(0).getJSONObject("data").put("wind_speed",9999).put("relative_humidity",-9)
  val p=WeatherParser.parse("smhi",j.toString(),WeatherLocation.DEFAULT).points.first()
  assertNull(p.wind);assertNull(p.humidity);assertNull(WeatherMath.feelsLike(p))
 }
 @Test fun solarHandlesPolarAndStockholmDst() {
  assertEquals("day",WeatherMath.sun(LocalDate.of(2026,6,21),WeatherLocation("Nord",89.0,0.0,"UTC")).polar)
  val s=WeatherMath.sun(LocalDate.of(2026,10,25),WeatherLocation.DEFAULT)
  assertNotNull(s.sunrise);assertTrue(s.sunset!!>s.sunrise!!)
 }
 @Test fun badPayloadRejected() { try {WeatherParser.parse("metno","{}",WeatherLocation.DEFAULT);fail()}catch(_:Exception){} }
 @Test fun retryAfterSecondsAndHttpDate() {
  assertEquals(1801000L,WeatherRepository.retryAt("60",1000))
  assertTrue(WeatherRepository.retryAt("bad",1000)>=1801000L)
 }
 private class MemoryStore:WeatherStore {var json:String?=null;override fun read()=json;override fun write(value:String){json=value}}
 private val forecastNow=java.time.Instant.parse("2026-10-28T17:00:00Z").toEpochMilli()
 @Test fun manualRespectsExpiryAndReadIsReadOnly() {
  var calls=0;var now=forecastNow
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->calls++;WeatherHttpResponse(200,fixture("smhi"))},{now})
  repo.state();assertEquals(0,calls);repo.refresh(true);assertEquals(1,calls)
  now+=60000;repo.refresh(true);assertEquals(1,calls);assertEquals("fresh",repo.state().getString("status"))
 }
 @Test fun conditional304KeepsBodyAndExactLastModified() {
  var now=forecastNow;var calls=0;val modified="Wed, 28 Oct 2026 16:43:52 GMT"
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,h->
   calls++;if(calls==1)WeatherHttpResponse(200,fixture("smhi"),mapOf("Last-Modified" to modified,"ETag" to "x","Cache-Control" to "max-age=40"))
   else {assertEquals(modified,h["If-Modified-Since"]);assertEquals("x",h["If-None-Match"]);WeatherHttpResponse(304,headers=mapOf("Cache-Control" to "max-age=7200"))}
  },{now})
  repo.refresh();val reference=repo.state().getLong("referenceTime");now+=60000;repo.refresh()
  assertEquals(2,calls);assertEquals(reference,repo.state().getLong("referenceTime"));assertEquals(now,repo.state().getLong("fetchedAt"))
 }
 @Test fun throttlingNeverFallsBackAndSurvivesRestart() {
  val store=MemoryStore();var calls=0
  val net=WeatherTransport {_,_->calls++;WeatherHttpResponse(429,headers=mapOf("Retry-After" to "3600"))}
  WeatherRepository(store,net,{forecastNow}).refresh();assertEquals(1,calls)
  WeatherRepository(store,net,{forecastNow+60000}).refresh();assertEquals(1,calls)
 }
 @Test fun fallbackIsAtomicAndFailureRetainsIt() {
  var now=forecastNow;var fail=false
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {u,_->if(fail||"smhi" in u)WeatherHttpResponse(503) else WeatherHttpResponse(200,fixture("metno"),mapOf("Cache-Control" to "max-age=40"))},{now})
  repo.refresh();assertEquals("metno",repo.state().getString("provider"));assertTrue(repo.state().isNull("error"))
  val reference=repo.state().getLong("referenceTime");fail=true;now+=60000;repo.refresh()
  assertEquals("metno",repo.state().getString("provider"));assertEquals(reference,repo.state().getLong("referenceTime"));assertEquals("stale",repo.state().getString("status"))
 }
 @Test fun metBackgroundFallbackRequiresUse() {
  var calls=0;val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->calls++;WeatherHttpResponse(503)},{forecastNow})
  repo.refresh(allowMet=false);assertEquals(1,calls)
 }
 @Test fun locationChangedDuringTransportRejectsOldResult() {
  lateinit var repo:WeatherRepository
  repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->repo.setLocation(WeatherLocation("Oslo",59.9,10.7,"Europe/Oslo"));WeatherHttpResponse(200,fixture("smhi"))},{forecastNow})
  repo.refresh();assertTrue(repo.state().isNull("provider"));assertEquals("Oslo",repo.state().getJSONObject("location").getString("name"))
 }
 @Test fun diskRestartKeepsLocationAndSnapshot() {
  val store=MemoryStore();val repo=WeatherRepository(store,WeatherTransport {_,_->WeatherHttpResponse(200,fixture("smhi"))},{forecastNow})
  repo.refresh();val restored=WeatherRepository(store,WeatherTransport {_,_->throw AssertionError("read caused network")},{forecastNow})
  assertEquals("smhi",restored.state().getString("provider"));assertEquals(repo.state().getLong("fetchedAt"),restored.state().getLong("fetchedAt"))
 }
 @Test fun wrongMetUnitsRejected() {
  val j=JSONObject(fixture("metno"));j.getJSONObject("properties").getJSONObject("meta").getJSONObject("units").put("wind_speed","km/h")
  try {WeatherParser.parse("metno",j.toString(),WeatherLocation.DEFAULT);fail()}catch(_:Exception){}
 }
 @Test fun legitimateMinusNineTemperatureIsNotASentinel() {
  val j=JSONObject(fixture("smhi"));j.getJSONArray("timeSeries").getJSONObject(0).getJSONObject("data").put("air_temperature",-9)
  assertEquals(-9.0,WeatherParser.parse("smhi",j.toString(),WeatherLocation.DEFAULT).points.first().temperature!!,0.0)
 }
 @Test fun malformedRowRejectsWholeRun() {
  val j=JSONObject(fixture("smhi"));j.getJSONArray("timeSeries").getJSONObject(1).put("time","invalid")
  try {WeatherParser.parse("smhi",j.toString(),WeatherLocation.DEFAULT);fail()}catch(_:Exception){}
 }
 private fun smhiRows(transform:(JSONObject)->Unit):String {
  val body=JSONObject(fixture("smhi"));val rows=body.getJSONArray("timeSeries")
  for(i in 0 until rows.length()) transform(rows.getJSONObject(i))
  return body.toString()
 }
 @Test fun futureOnlyPrimaryDoesNotSuppressFallback() {
  val future=smhiRows {row->if(java.time.Instant.parse(row.getString("time")).toEpochMilli()<forecastNow+86400000)row.getJSONObject("data").put("air_temperature",9999)}
  var calls=0
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {u,_->calls++;WeatherHttpResponse(200,if("smhi" in u)future else fixture("metno"))},{forecastNow})
  repo.refresh();assertEquals(2,calls);assertEquals("metno",repo.state().getString("provider"))
 }
 @Test fun invalidNearNowAndValidDistantTemperaturesRejectPrimary() {
  val invalid=smhiRows {row->if(java.time.Instant.parse(row.getString("time")).toEpochMilli()<forecastNow+7200000)row.getJSONObject("data").put("air_temperature",9999)}
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {u,_->if("smhi" in u)WeatherHttpResponse(200,invalid) else WeatherHttpResponse(503)},{forecastNow})
  repo.refresh();assertTrue(repo.state().isNull("current"));assertTrue(repo.state().isNull("provider"))
 }
 @Test fun elapsedNearNowCoverageInvalidatesEvenLongHttpFreshness() {
  var now=forecastNow;var calls=0
  val body=JSONObject(fixture("smhi"));val source=body.getJSONArray("timeSeries")
  body.put("timeSeries",org.json.JSONArray().put(source.getJSONObject(0)).put(source.getJSONObject(6)))
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->calls++;if(calls==1)WeatherHttpResponse(200,body.toString(),mapOf("Cache-Control" to "max-age=86400")) else WeatherHttpResponse(503)},{now})
  repo.refresh();now+=2*3600000
  assertTrue(repo.state().isNull("current"));assertEquals("stale",repo.state().getString("status"));assertTrue(repo.state().getJSONArray("hourly").length()>0)
  repo.refresh();assertEquals(3,calls)
 }
 @Test fun olderFreshMetCacheBecomesActiveAndSurvivesRestart() {
  val store=MemoryStore();var now=forecastNow
  WeatherRepository(store,WeatherTransport {u,_->if("smhi" in u)WeatherHttpResponse(503) else WeatherHttpResponse(200,fixture("metno"),mapOf("Cache-Control" to "max-age=7200"))},{now}).refresh()
  val seeded=JSONObject(store.json!!);val entries=seeded.getJSONObject("entries");val location=WeatherLocation.DEFAULT.key()
  val smhi=JSONObject(entries.getJSONObject("$location|metno").toString()).put("provider","smhi").put("body",fixture("smhi")).put("fetchedAt",now+60000).put("expiresAt",now+90000)
  entries.put("$location|smhi",smhi);seeded.put("active",JSONObject().put(location,"smhi"));store.json=seeded.toString();now+=120000
  var calls=0;val transport=WeatherTransport {_,_->calls++;WeatherHttpResponse(503)}
  val repo=WeatherRepository(store,transport,{now});repo.refresh()
  val state=repo.state();assertEquals(1,calls);assertEquals("metno",state.getString("provider"));assertEquals(forecastNow,state.getLong("fetchedAt"));assertEquals(forecastNow+7200000,state.getLong("expiresAt"));assertTrue(state.isNull("error"))
  val restored=WeatherRepository(store,transport,{now});assertEquals("metno",restored.state().getString("provider"));assertEquals(state.getLong("referenceTime"),restored.state().getLong("referenceTime"))
 }
 @Test fun headerless304RetainsShortMaxAgeAfterRestart() {
  var now=forecastNow;val store=MemoryStore()
  WeatherRepository(store,WeatherTransport {_,_->WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "max-age=40","ETag" to "v1"))},{now}).refresh()
  now+=60000
  val restored=WeatherRepository(store,WeatherTransport {_,h->assertEquals("v1",h["If-None-Match"]);WeatherHttpResponse(304)},{now})
  restored.refresh();assertEquals(now+40000,restored.state().getLong("expiresAt"))
 }
 @Test fun maxAgeTakesPrecedenceOverFutureExpires() {
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "max-age=0","Expires" to "Thu, 29 Oct 2026 17:00:00 GMT"))},{forecastNow})
  repo.refresh();assertEquals(forecastNow,repo.state().getLong("expiresAt"));assertEquals("stale",repo.state().getString("status"))
 }
 @Test fun noCacheRequiresRevalidationDespiteMaxAgeAndExpires() {
  var now=forecastNow;var calls=0
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->calls++;if(calls==1)WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "no-cache, max-age=7200","Expires" to "Thu, 29 Oct 2026 17:00:00 GMT")) else WeatherHttpResponse(304)},{now})
  repo.refresh();assertEquals(now,repo.state().getLong("expiresAt"));now+=60000;repo.refresh();assertEquals(2,calls);assertEquals(now,repo.state().getLong("expiresAt"))
 }
 @Test fun receivedAgeReducesRemainingFreshness() {
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "max-age=120","Date" to "Wed, 28 Oct 2026 16:59:30 GMT","Age" to "90"))},{forecastNow})
  repo.refresh();assertEquals(forecastNow+30000,repo.state().getLong("expiresAt"))
 }
 @Test fun noStoreSnapshotIsNotPersisted() {
  val store=MemoryStore();val transport=WeatherTransport {_,_->WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "no-store"))}
  val repo=WeatherRepository(store,transport,{forecastNow});repo.refresh();assertEquals("smhi",repo.state().getString("provider"))
  assertTrue(WeatherRepository(store,transport,{forecastNow}).state().isNull("provider"))
 }
 @Test fun dailyExtremaArePartialForMissingTemperatures() {
  val body=JSONObject(fixture("smhi"));val template=body.getJSONArray("timeSeries").getJSONObject(0)
  val rows=org.json.JSONArray().put(template)
  val zone=java.time.ZoneId.of(WeatherLocation.DEFAULT.timeZone)
  val start=LocalDate.of(2026,10,29).atStartOfDay(zone).toInstant()
  for(i in 0..23) {val row=JSONObject(template.toString());val time=start.plusSeconds(i*3600L);row.put("time",time.toString()).put("intervalParametersStartTime",time.minusSeconds(3600).toString());if(i==12)row.getJSONObject("data").put("air_temperature",9999);rows.put(row)}
  body.put("timeSeries",rows)
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->WeatherHttpResponse(200,body.toString())},{forecastNow});repo.refresh()
  val day=repo.state().getJSONArray("daily").getJSONObject(1);assertTrue(day.getBoolean("partial"));assertFalse(day.isNull("min"))
 }
 @Test fun dailyExtremaRemainNullAndPartialWhenEveryTemperatureIsMissing() {
  val body=JSONObject(fixture("smhi"));val template=body.getJSONArray("timeSeries").getJSONObject(0)
  val rows=org.json.JSONArray().put(template)
  val start=LocalDate.of(2026,10,29).atStartOfDay(java.time.ZoneId.of(WeatherLocation.DEFAULT.timeZone)).toInstant()
  for(i in 0..23) {
   val row=JSONObject(template.toString());val time=start.plusSeconds(i*3600L)
   row.put("time",time.toString()).put("intervalParametersStartTime",time.minusSeconds(3600).toString())
   row.getJSONObject("data").put("air_temperature",9999);rows.put(row)
  }
  body.put("timeSeries",rows)
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->WeatherHttpResponse(200,body.toString())},{forecastNow});repo.refresh()
  val day=repo.state().getJSONArray("daily").getJSONObject(1)
  assertTrue(day.getBoolean("partial"));assertTrue(day.isNull("min"));assertTrue(day.isNull("max"))
 }
 @Test fun responseDelayCountsTowardReceivedAge() {
  var now=forecastNow
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->now+=10000;WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "max-age=120","Date" to "Wed, 28 Oct 2026 17:00:00 GMT","Age" to "90"))},{now})
  repo.refresh();assertEquals(now+20000,repo.state().getLong("expiresAt"))
 }
 @Test fun expiresPolicySurvivesHeaderless304WithoutInventedTtl() {
  var now=forecastNow;var calls=0
  val repo=WeatherRepository(MemoryStore(),WeatherTransport {_,_->calls++;if(calls==1)WeatherHttpResponse(200,fixture("smhi"),mapOf("Date" to "Wed, 28 Oct 2026 17:00:00 GMT","Expires" to "Wed, 28 Oct 2026 17:00:40 GMT")) else WeatherHttpResponse(304)},{now})
  repo.refresh();now+=60000;repo.refresh()
  assertEquals(now,repo.state().getLong("expiresAt"))
 }
 @Test fun durableMetSurvivesNoStorePrimaryAndOfflineRestart() {
  val store=MemoryStore();var now=forecastNow;var phase=0
  val transport=WeatherTransport {u,_->
   if(phase==0) {
    if("smhi" in u)WeatherHttpResponse(503)
    else WeatherHttpResponse(200,fixture("metno"),mapOf("Cache-Control" to "max-age=40"))
   }else WeatherHttpResponse(200,fixture("smhi"),mapOf("Cache-Control" to "no-store"))
  }
  val repo=WeatherRepository(store,transport,{now});repo.refresh()
  assertEquals("metno",repo.state().getString("provider"))
  phase=1;now+=60000;repo.refresh();assertEquals("smhi",repo.state().getString("provider"))
  val disk=JSONObject(store.json!!)
  assertFalse(disk.getJSONObject("entries").has(WeatherLocation.DEFAULT.key()+"|smhi"))
  val restored=WeatherRepository(store,WeatherTransport {_,_->WeatherHttpResponse(503)},{now})
  val state=restored.state();assertEquals("metno",state.getString("provider"));assertEquals(forecastNow,state.getLong("fetchedAt"))
  restored.refresh();assertEquals("metno",restored.state().getString("provider"))
 }
 @Test fun missingOrMalformedActiveEntryFallsBackToValidDurableAlternate() {
  val store=MemoryStore()
  WeatherRepository(store,WeatherTransport {u,_->if("smhi" in u)WeatherHttpResponse(503) else WeatherHttpResponse(200,fixture("metno"))},{forecastNow}).refresh()
  val seed=JSONObject(store.json!!);val key=WeatherLocation.DEFAULT.key()
  seed.getJSONObject("active").put(key,"smhi")
  store.json=seed.toString()
  assertEquals("metno",WeatherRepository(store,WeatherTransport {_,_->throw AssertionError("state fetched network")},{forecastNow}).state().getString("provider"))
  seed.getJSONObject("entries").put(key+"|smhi",JSONObject().put("provider","smhi").put("body","{}").put("fetchedAt",forecastNow+1000))
  store.json=seed.toString()
  assertEquals("metno",WeatherRepository(store,WeatherTransport {_,_->throw AssertionError("state fetched network")},{forecastNow}).state().getString("provider"))
 }
}
