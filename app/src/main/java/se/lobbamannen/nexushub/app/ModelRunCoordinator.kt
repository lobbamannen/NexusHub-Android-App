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
        if (reservedGemma == id) reservedGemma = null
    }
    fun gemmaPending(id: String): Boolean = synchronized(state) { reservedGemma == id }
    fun <T> run(id: String, kind: String, action: () -> T): T {
        gate.lock()
        try {
            synchronized(state) {
                activeId = id; activeKind = kind
                if (kind == "gemma" && cancelled.remove(id))
                    throw java.util.concurrent.CancellationException("Gemma-begäran avbröts innan modellen blev tillgänglig.")
            }
            return action()
        } finally {
            synchronized(state) {
                activeId = null; activeKind = null
                if (kind == "gemma" && reservedGemma == id) reservedGemma = null
            }
            gate.unlock()
        }
    }
    fun cancelGemma(id: String, action: () -> Unit): Boolean = synchronized(state) {
        if (reservedGemma != id) false
        else if (activeId == id && activeKind == "gemma") { action(); true }
        else { cancelled.add(id); true }
    }
}
