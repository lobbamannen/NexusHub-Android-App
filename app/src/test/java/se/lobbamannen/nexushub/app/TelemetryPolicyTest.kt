package se.lobbamannen.nexushub.app
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File
class TelemetryPolicyTest {
    private val schema=JSONObject(File("../lib/telemetry-schema.json").readText())
    @Test fun canariesCannotReachNativeCapture() {
        val policy=TelemetryPolicy(schema)
        assertEquals(mapOf("module" to "ideer"),policy.sanitize("section_viewed",JSONObject().put("module","ideer").put("token","github_pat_CANARY").put("title","PRIVATE_CANARY").put("path","/private")))
        assertNull(policy.sanitize("PRIVATE_CANARY",JSONObject()))
        assertNull(policy.sanitize("section_viewed",JSONObject().put("module","PRIVATE_CANARY")))
        assertNull(policy.sanitize("section_viewed",JSONObject().put("module",JSONObject().put("text","PRIVATE_CANARY"))))
        assertNull(policy.sanitize("calendar_permission_result",JSONObject().put("granted","true")))
    }
    @Test fun everyEventAcceptsOnlyItsEnumsAndBooleans() {
        val policy=TelemetryPolicy(schema)
        for(name in schema.keys()) {
            val fields=schema.getJSONObject(name);val valid=JSONObject()
            for(key in fields.keys()){val values=fields.get(key);valid.put(key,if(values=="boolean")true else fields.getJSONArray(key).getString(0))}
            assertNotNull(name,policy.sanitize(name,valid))
            for(key in fields.keys()){val bad=JSONObject(valid.toString()).put(key,"PRIVATE_CANARY");assertNull("$name/$key",policy.sanitize(name,bad))}
        }
    }
}
