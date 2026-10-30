package se.lobbamannen.nexushub.app

import android.content.Context
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class IntelligenceIndexStoreTest {
    private val context:Context get()=org.robolectric.RuntimeEnvironment.getApplication()
    private val a="a".repeat(40)
    private val b="b".repeat(40)
    private val c="c".repeat(40)

    @Before fun clean() {
        context.deleteDatabase("nexus_intelligence_index_v1.db")
    }

    @Test fun onlyFullyCompletedInventoryBecomesSearchable() {
        val index=IntelligenceIndexStore(context)
        index.begin(a)
        index.upsert(a,"Research/test.md",b,"Svenskt dokument",
            "Gemma hjälper NexusHub att hitta samband i kunskapsbanken.")
        assertFalse(index.status().getBoolean("ready"))
        assertThrows(IllegalStateException::class.java) {
            index.finish(a,2)
        }
        assertFalse(index.status().getBoolean("ready"))
        val ready=index.finish(a,1)
        assertTrue(ready.getBoolean("ready"))
        assertEquals(a,ready.getString("commit"))
        val found=index.search(listOf("Gemma"),8)
        assertEquals(1,found.length())
        assertEquals(b,found.getJSONObject(0).getString("sha"))
    }

    @Test fun newManifestPurgesDeletedSourceOnlyAtVerifiedFinish() {
        val index=IntelligenceIndexStore(context)
        index.begin(a)
        index.upsert(a,"Research/original.md",b,"Original",
            "Borttagen källa med ämnet kronovisor i en rapport.")
        index.finish(a,1)
        assertEquals(1,index.search(listOf("kronovisor")).length())
        index.begin(c)
        assertFalse(index.status().getBoolean("ready"))
        index.upsert(c,"Research/updated.md",b,"Uppdaterad",
            "Lokalt avsnitt om Gemma och verifierad sökning.")
        index.finish(c,1)
        assertEquals(0,index.search(listOf("kronovisor")).length())
        assertEquals(1,index.search(listOf("Gemma")).length())
    }

    @Test fun refusesUnverifiedVersionAndPathTraversal() {
        val index=IntelligenceIndexStore(context)
        index.begin(a)
        assertThrows(IllegalArgumentException::class.java) {
            index.upsert(a,"../token.json",b,"Fel","Detta är en hemlig text")
        }
        assertThrows(IllegalArgumentException::class.java) {
            index.upsert(a,"Research/real.md","incorrect_sha","Dokument","text")
        }
        assertThrows(IllegalArgumentException::class.java) {
            index.upsert(c,"Research/real.md",b,"Dokument","text")
        }
        assertTrue(index.finish(a,0).getBoolean("ready"))
    }
}
