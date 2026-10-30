package se.lobbamannen.nexushub.app

import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
class IntelligenceRunStoreTest {
    private val context: Context get() = org.robolectric.RuntimeEnvironment.getApplication()
    private fun unique() = UUID.randomUUID().toString()

    @Test fun duplicateTriggerUsesSameRun() {
        val store = IntelligenceRunStore(context)
        val trigger = "test:" + unique()
        val a = store.enqueue("idea_analysis",trigger,unique(),"sha123")
        val b = store.enqueue("idea_analysis",trigger,unique(),"sha123")
        assertEquals(a.getString("id"),b.getString("id"))
        assertEquals("queued",a.getString("state"))
    }

    @Test fun transitionsAreGuarded() {
        val store = IntelligenceRunStore(context)
        val id = store.enqueue("manual_check","test:"+unique(),unique(),"v1").getString("id")
        assertFalse(store.transition(id,"running","completed"))
        assertTrue(store.transition(id,"queued","running"))
        assertFalse(store.transition(id,"queued","cancelled"))
        assertTrue(store.transition(id,"running","local_completed"))
        assertTrue(store.transition(id,"local_completed","completed"))
        assertFalse(store.transition(id,"completed","queued"))
        assertEquals("completed",store.get(id)!!.getString("state"))
    }

    @Test fun operationIdempotency() {
        val store = IntelligenceRunStore(context)
        val id = store.enqueue("manual_check","test:"+unique(),unique(),"v2").getString("id")
        assertTrue(store.transition(id,"queued","running"))
        val op = "check:"+unique()
        assertTrue(store.recordStep(id,0,op,"code","succeeded",
            JSONObject().put("verification","local")))
        assertFalse(store.recordStep(id,0,op,"code","succeeded"))
        val rows = store.get(id)!!.getJSONArray("steps")
        assertEquals(1,rows.length())
        assertEquals("local",rows.getJSONObject(0).getJSONObject("output").getString("verification"))
    }

    @Test fun cancellationPreventsLateWrite() {
        val store = IntelligenceRunStore(context)
        val id = store.enqueue("manual_check","test:"+unique(),unique(),"v3").getString("id")
        assertTrue(store.transition(id,"queued","cancelled"))
        try {
            store.recordStep(id,0,"op:"+unique(),"code","succeeded")
            fail("must reject step in cancelled run")
        } catch (_: IllegalArgumentException) { }
    }
}
