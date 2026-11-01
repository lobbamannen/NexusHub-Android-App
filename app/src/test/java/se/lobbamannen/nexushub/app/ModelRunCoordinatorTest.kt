package se.lobbamannen.nexushub.app

import com.example.gemma.GgufInspector
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

class ModelRunCoordinatorTest {
    @Test fun cancellationDuringColdHashPreventsResetAndDoesNotCancelNextRequest() {
        val id=UUID.randomUUID().toString()
        val hashing=CountDownLatch(1); val resume=CountDownLatch(1)
        val cancelled=AtomicBoolean(); val reset=AtomicBoolean()
        val model=File.createTempFile("hash-model","gguf").apply { writeBytes(ByteArray(512*1024)) }
        assertTrue(ModelRunCoordinator.reserveGemma(id))
        val worker=Thread {
            try { ModelRunCoordinator.run(id,"gemma") {
                GgufInspector.sha256(model) { hashing.countDown(); resume.await(); ModelRunCoordinator.checkpoint() }
                ModelRunCoordinator.resetStop { reset.set(true) }
            } } catch(_:CancellationException) { cancelled.set(true) }
        }
        worker.start()
        try {
            assertTrue(hashing.await(2,TimeUnit.SECONDS))
            assertTrue(ModelRunCoordinator.cancelGemma(id) {})
        } finally { resume.countDown(); worker.join(2000); model.delete() }
        assertTrue(cancelled.get()); assertFalse(reset.get()); assertFalse(ModelRunCoordinator.gemmaPending(id))
        val next=UUID.randomUUID().toString(); assertTrue(ModelRunCoordinator.reserveGemma(next))
        ModelRunCoordinator.run(next,"gemma") {
            assertFalse(ModelRunCoordinator.cancelGemma(id) { fail("Late cancel reached a new owner") })
            ModelRunCoordinator.resetStop { reset.set(true) }
        }
        assertTrue(reset.get())
    }
    @Test fun cancellationKeepsOwnershipUntilNativeExitAndBlocksReplacementActivityImport() {
        val id=UUID.randomUUID().toString()
        val entered=CountDownLatch(1); val exit=CountDownLatch(1); val imported=CountDownLatch(1)
        assertTrue(ModelRunCoordinator.reserveGemma(id))
        val old=Thread { ModelRunCoordinator.run(id,"gemma") { entered.countDown(); exit.await() } }
        old.start(); assertTrue(entered.await(2,TimeUnit.SECONDS))
        val replacement=Thread { ModelRunCoordinator.exclusive("embedding-import") {
            ModelRunCoordinator.exclusive("cleanup") { }
            imported.countDown()
        } }
        try {
            assertTrue(ModelRunCoordinator.cancelGemma(id) {})
            ModelRunCoordinator.releaseGemma(id) // A UI timeout cannot release a live native owner.
            assertTrue(ModelRunCoordinator.gemmaPending(id))
            replacement.start()
            assertFalse(imported.await(100,TimeUnit.MILLISECONDS))
        } finally { exit.countDown(); old.join(2000); replacement.join(2000) }
        assertEquals(0L,imported.count); assertFalse(ModelRunCoordinator.gemmaPending(id))
    }
    @Test fun failureReleasesImportOwnership() {
        try { ModelRunCoordinator.exclusive("embedding-import") { throw java.io.IOException("load failed") } }
        catch(_:java.io.IOException) {}
        var ran=false
        ModelRunCoordinator.exclusive("cleanup") { ran=true }
        assertTrue(ran)
    }
    @Test fun queuedCancellationNeverStartsNativeActionAfterImportExits() {
        val id=UUID.randomUUID().toString()
        val importing=CountDownLatch(1);val exitImport=CountDownLatch(1)
        val generated=AtomicBoolean();val cancelled=AtomicBoolean()
        val importer=Thread { ModelRunCoordinator.exclusive("embedding-import") { importing.countDown();exitImport.await() } }
        val queued=Thread {
            try { ModelRunCoordinator.run(id,"gemma") { generated.set(true) } }
            catch(_:CancellationException) { cancelled.set(true) }
        }
        importer.start()
        try {
            assertTrue(importing.await(5,TimeUnit.SECONDS))
            assertTrue(ModelRunCoordinator.reserveGemma(id));queued.start()
            assertTrue(ModelRunCoordinator.cancelGemma(id) { fail("Queued native work is not active") })
        } finally { exitImport.countDown();importer.join(5000);queued.join(5000);ModelRunCoordinator.releaseGemma(id) }
        assertFalse(importer.isAlive);assertFalse(queued.isAlive)
        assertTrue(cancelled.get());assertFalse(generated.get());assertFalse(ModelRunCoordinator.gemmaPending(id))
    }

}
