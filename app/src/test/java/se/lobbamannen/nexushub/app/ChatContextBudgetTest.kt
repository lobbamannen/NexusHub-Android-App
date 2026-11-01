package se.lobbamannen.nexushub.app

import org.junit.Assert.*
import org.junit.Test

class ChatContextBudgetTest {
    @Test fun actualTemplateTokensOmitOldestCompletePairsWithoutChangingHistory() {
        val roles=listOf("user","assistant","user","assistant","user")
        val contents=listOf("old question","old answer","recent question","recent answer","current question")
        val calls=mutableListOf<List<String>>()
        val prompt=ChatContextBudget.fit(roles,contents,32,110) { keptRoles,kept ->
            assertEquals("user",keptRoles.first()); calls.add(kept)
            kept.joinToString("|") to (kept.size*20)
        }
        assertEquals(1,prompt.omittedHistoryTurns)
        assertEquals(listOf("recent question","recent answer","current question"),calls.last())
        assertEquals(5,contents.size)
        assertTrue(prompt.text.endsWith("current question"))
    }
    @Test fun currentQuestionIsNeverTruncatedWhenItCannotFit() {
        try {
            ChatContextBudget.fit(listOf("user"),listOf("keep all of this"),32,100) { _,content ->
                assertEquals("keep all of this",content.single()); content.single() to 90
            }
            fail("Oversized current question must fail explicitly")
        } catch(_:IllegalArgumentException) {}
    }
}
