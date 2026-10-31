package se.lobbamannen.nexushub.app

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GemmaConfigTest {
    @Test fun confirmedNpuDefaults() {
        val p = GemmaConfig.defaults()
        assertEquals("NPU_HEXAGON", p.getString("backend"))
        assertEquals(32768, p.getInt("contextSize"))
        assertEquals(512, p.getInt("batch"))
        assertEquals(256, p.getInt("microbatch"))
        assertFalse(p.getBoolean("flashAttention"))
        assertFalse(p.getBoolean("q8Kv"))
        assertTrue(p.getBoolean("mlock"))
        assertTrue(p.getBoolean("warmModel"))
    }

    @Test fun savedValuesSurviveDefaultUpdates() {
        val p = GemmaConfig.load(JSONObject().put("backend", "CPU")
            .put("temperature", 0.7).toString())
        assertEquals("CPU", p.getString("backend"))
        assertEquals(0.7, p.getDouble("temperature"), 0.00001)
        assertEquals(32768, p.getInt("contextSize"))
    }

    @Test fun samplerAndTokenBudgetKeepModelWarm() {
        val original = GemmaConfig.defaults()
        val changed = GemmaConfig.updateAndValidate(original, JSONObject()
            .put("temperature", 0.8).put("topP", 0.8)
            .put("maxOutputTokens", 1000).put("thinking", true))
        assertEquals(GemmaConfig.engineSignature(original, "sha"),
            GemmaConfig.engineSignature(changed, "sha"))
    }

    @Test fun engineOrModelChangeForcesReload() {
        val p = GemmaConfig.defaults()
        val changed = GemmaConfig.updateAndValidate(p,
            JSONObject().put("contextSize", 8192))
        assertNotEquals(GemmaConfig.engineSignature(p, "sha"),
            GemmaConfig.engineSignature(changed, "sha"))
        assertNotEquals(GemmaConfig.engineSignature(p, "sha1"),
            GemmaConfig.engineSignature(p, "sha2"))
    }

    @Test fun invalidUpdatesAreRejectedWithoutMutation() {
        val p = GemmaConfig.defaults()
        try {
            GemmaConfig.updateAndValidate(p, JSONObject().put("microbatch", 1024))
            fail("Expected validation failure")
        } catch (_: IllegalArgumentException) { }
        assertEquals(256, p.getInt("microbatch"))
    }
}
