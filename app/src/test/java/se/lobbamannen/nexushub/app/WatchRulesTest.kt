package se.lobbamannen.nexushub.app

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalTime

class WatchRulesTest {
    @Test fun diagnosticsExcludeUnselectedProviders() {
        val row=org.json.JSONObject().put("releaseWatch",org.json.JSONObject().put("providerMode","custom").put("providerIds",org.json.JSONArray().put("disney")))
        val settings=org.json.JSONObject().put("providers",org.json.JSONArray().put("netflix").put("disney"))
        assertFalse(WatchRules.matchesProvider(row,settings,"netflix"))
        assertTrue(WatchRules.matchesProvider(row,settings,"disney"))
    }
    @Test fun actualHttpFailuresReplaceOldLocalDiagnostics() {
        for(category in listOf("auth","rate_limit")) {
            val state=org.json.JSONObject().put("diagnostics",org.json.JSONObject().put("sourceChanges",99))
            val current=org.json.JSONObject().put("sourceChanges",0).put("watchedChanges",0).put("newEvents",0).put("noticesPosted",0)
            val event=WatchRules.failureDiagnostics(state,current,category)
            assertEquals(0,state.getJSONObject("diagnostics").getInt("sourceChanges"))
            assertEquals(category,event.getString("error_category"));assertEquals("failure",event.getString("result"))
        }
    }

    @Test fun firstCheckCoversEnrollmentAndRechecksDelayedSourceChanges() {
        val now=200000L
        assertEquals(190000L,WatchRules.pastFrom(org.json.JSONObject(),190000L,now))
        assertEquals(190000L,WatchRules.pastFrom(org.json.JSONObject().put("watermark",195000L),190000L,now))
        assertEquals(113600L,WatchRules.pastFrom(org.json.JSONObject().put("watermark",200000L),100000L,now))
        assertEquals(199000L,WatchRules.pastFrom(org.json.JSONObject().put("from",199000L).put("to",199500L),190000L,now))
    }

    @Test fun quotaStopsBeforePaidPlan() {
        assertTrue(WatchRules.quota(899))
        assertFalse(WatchRules.quota(900))
        assertFalse(WatchRules.quota(-1))
    }
    @Test fun quietHoursAcrossMidnight() {
        assertTrue(WatchRules.quiet(true,"22:00","07:00",LocalTime.of(23,30)))
        assertTrue(WatchRules.quiet(true,"22:00","07:00",LocalTime.of(6,59)))
        assertFalse(WatchRules.quiet(true,"22:00","07:00",LocalTime.of(7,0)))
        assertFalse(WatchRules.quiet(false,"22:00","07:00",LocalTime.MIDNIGHT))
    }
    @Test fun streamWindowsAndNotificationKinds() {
        // Upcoming windows remain valid through their UTC day; a later run must reuse its cursor.
        assertTrue(WatchRules.windowValid(true, 200000, 260000, 200900))
        assertFalse(WatchRules.windowValid(true, 172799, 260000, 200900))
        assertTrue(WatchRules.notificationEnabled("confirmed_upcoming", true, true, true))
        assertFalse(WatchRules.notificationEnabled("confirmed_upcoming", true, true, false))
        assertFalse(WatchRules.notificationEnabled("removed", true, true, true))
    }
    @Test fun historyRestoreIsIdempotentAndKeepsNewerEvidence() {
        val current=org.json.JSONArray("""[{"id":"a","observedAt":"2026-10-26T12:00:00Z","availability":"confirmed_upcoming","readAt":"2026-10-26T12:01:00Z","baseline":false}]""")
        val incoming=org.json.JSONArray("""[{"id":"a","observedAt":"2026-10-26T13:00:00Z","availability":"confirmed_available","readAt":"2026-10-26T13:01:00Z"}]""")
        val once=WatchRules.mergeEvents(current,incoming,false)
        assertEquals("confirmed_available",once.getJSONObject(0).getString("availability"))
        assertEquals("2026-10-26T13:01:00Z",once.getJSONObject(0).getString("readAt"))
        assertFalse(once.getJSONObject(0).getBoolean("baseline"))
        assertEquals(once.toString(),WatchRules.mergeEvents(once,incoming,false).toString())
    }
    @Test fun fractionalTimestampsCompareAsInstants() {
        val old=org.json.JSONArray("""[{"id":"a","observedAt":"2026-10-26T12:00:00Z","availability":"confirmed_upcoming","readAt":"2026-10-26T12:00:00Z"}]""")
        val fresh=org.json.JSONArray("""[{"id":"a","observedAt":"2026-10-26T12:00:00.123Z","availability":"confirmed_available","readAt":"2026-10-26T12:00:00.123Z"}]""")
        val merged=WatchRules.mergeEvents(old,fresh,false).getJSONObject(0)
        assertEquals("confirmed_available",merged.getString("availability"))
        assertEquals("2026-10-26T12:00:00.123Z",merged.getString("readAt"))
    }
    @Test fun availabilityEvidenceRequiresExplicitEpisodeSubscriptionAndExactService() {
        val valid=org.json.JSONObject("""{"changeType":"new","itemType":"episode","showType":"series","streamingOptionType":"subscription","service":{"id":"netflix"},"season":2,"episode":4,"timestamp":200000}""")
        assertEquals(2 to 4,WatchRules.evidenceNumbers(valid,"netflix","new","episode",200100))
        assertNull(WatchRules.evidenceNumbers(org.json.JSONObject(valid.toString()).put("streamingOptionType","rent"),"netflix","new","episode",200100))
        assertNull(WatchRules.evidenceNumbers(org.json.JSONObject(valid.toString()).removeAndReturn("episode"),"netflix","new","episode",200100))
        assertNull(WatchRules.evidenceNumbers(org.json.JSONObject(valid.toString()).put("episode","4"),"netflix","new","episode",200100))
        assertNull(WatchRules.evidenceNumbers(valid,"disney","new","episode",200100))
        assertNull(WatchRules.evidenceNumbers(valid,"netflix","new","episode",199999))
        assertNull(WatchRules.evidenceNumbers(org.json.JSONObject(valid.toString()).put("season",0),"netflix","new","episode",200100))
        assertNull(WatchRules.evidenceNumbers(org.json.JSONObject(valid.toString()).put("episode",0),"netflix","new","episode",200100))
    }
    private fun org.json.JSONObject.removeAndReturn(key:String):org.json.JSONObject { remove(key);return this }
    @Test fun catalogChangesRetainBacklogAndDiscardOnlyIncompatibleCursors() {
        val old=org.json.JSONObject("""{"netflix,prime|new|episode":{"watermark":100000,"from":100020,"to":101000,"cursor":"old-page"},"netflix,prime|new|season":{"watermark":99900}}""")
        val migrated=WatchRules.rekeyStreams(old,listOf("disney,netflix,prime|new|episode","disney,netflix,prime|new|season"),110000)
        assertEquals(100020,migrated.getJSONObject("disney,netflix,prime|new|episode").getLong("from"))
        assertEquals(110000,migrated.getJSONObject("disney,netflix,prime|new|episode").getLong("to"))
        assertFalse(migrated.getJSONObject("disney,netflix,prime|new|episode").has("cursor"))
        assertEquals(99900,migrated.getJSONObject("disney,netflix,prime|new|season").getLong("from"))
        assertEquals("old-page",WatchRules.rekeyStreams(old,listOf("netflix,prime|new|episode"),110000).getJSONObject("netflix,prime|new|episode").getString("cursor"))
        assertFalse(WatchRules.rekeyStreams(old,listOf("disney|new|episode"),110000).getJSONObject("disney|new|episode").has("from"))
    }
    @Test fun explicitConcurrentReadClearsPendingAvailabilityPush() {
        val worker=org.json.JSONArray("""[{"id":"a","observedAt":"2026-10-26T12:00:00Z","availability":"confirmed_available","readAt":"2026-10-25T12:00:00Z","pendingAvailableNotification":true}]""")
        val latest=org.json.JSONArray("""[{"id":"a","observedAt":"2026-10-26T12:00:00Z","availability":"confirmed_available","readAt":"2026-10-26T12:00:01Z"}]""")
        val merged=WatchRules.mergeEvents(worker,latest,false).getJSONObject(0)
        assertFalse(merged.optBoolean("pendingAvailableNotification"))
        assertEquals("2026-10-26T12:00:01Z",merged.getString("readAt"))
    }
    @Test fun stableIdAndBaselines() {
        assertEquals("series|netflix|2|3",WatchRules.eventId("series","netflix",2,3))
        assertNotEquals(WatchRules.eventId("series","netflix",2,null),WatchRules.eventId("series","netflix",2,3))
        assertFalse(WatchRules.notifyCandidate(true,false,true))
        assertFalse(WatchRules.notifyCandidate(false,true,true))
        assertTrue(WatchRules.notifyCandidate(false,false,true))
    }
}
