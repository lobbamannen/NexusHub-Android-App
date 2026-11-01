package se.lobbamannen.nexushub.app

import java.util.concurrent.locks.ReentrantLock

/** One native model resource owner across old and newly created Activities. */
internal object ModelRunCoordinator {
    private val gate = ReentrantLock(true)
    private val state = Any()
    private var activeId: String? = null
    private var activeKind: String? = null
    private var reservedGemma: String? = null
    private val cancelled = mutableSetOf<String>()

    fun reserveGemma(id: String): Boolean = synchronized(state) {
        if (reservedGemma != null) false else { reservedGemma = id; true }
    }
    fun releaseGemma(id: String) = synchronized(state) {
        if (reservedGemma == id && activeId != id) { reservedGemma = null; cancelled.remove(id) }
    }
    fun gemmaPending(id: String): Boolean = synchronized(state) { reservedGemma == id }
    fun <T> run(id: String, kind: String, action: () -> T): T {
        gate.lock()
        try {
            synchronized(state) {
                activeId = id; activeKind = kind
                if (kind == "gemma" && cancelled.contains(id))
                    throw java.util.concurrent.CancellationException("Gemma-begäran avbröts innan modellen blev tillgänglig.")
            }
            return action()
        } finally {
            synchronized(state) {
                cancelled.remove(id)
                activeId = null; activeKind = null
                if (kind == "gemma" && reservedGemma == id) reservedGemma = null
            }
            gate.unlock()
        }
    }
    fun cancelGemma(id: String, action: () -> Unit): Boolean = synchronized(state) {
        if (reservedGemma != id) false
        else {
            cancelled.add(id) // Retain intent through hash/load/reset until the owner really exits.
            if (activeId == id && activeKind == "gemma") action()
            true
        }
    }
    /** Reentrant runtime boundary: nested calls retain the outer request's identity. */
    fun <T> exclusive(kind: String, action: () -> T): T =
        if (gate.isHeldByCurrentThread) action()
        else run(java.util.UUID.randomUUID().toString(), kind, action)

    fun checkpoint() = synchronized(state) {
        val id=activeId
        if (gate.isHeldByCurrentThread && activeKind == "gemma" && id!=null && cancelled.contains(id))
            throw java.util.concurrent.CancellationException("Gemma-begäran avbröts.")
    }
    /** Cancel and stop reset share the same monitor, so a cancel can never be erased. */
    fun resetStop(reset: () -> Unit) = synchronized(state) { checkpoint(); reset() }

}
