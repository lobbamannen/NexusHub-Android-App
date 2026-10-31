package se.lobbamannen.nexushub.app

import java.util.concurrent.locks.ReentrantLock

/** One native model resource owner across old and newly created Activities. */
internal object ModelRunCoordinator {
    private val gate = ReentrantLock(true)
    private val state = Any()
    private var activeId: String? = null
    private var activeKind: String? = null
    private var reservedGemma: String? = null

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
            synchronized(state) { activeId = id; activeKind = kind }
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
        if (activeId != id || activeKind != "gemma") false
        else { action(); true }
    }
}
