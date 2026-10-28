package vn.id.congtc145.coffeepos

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.OnlinePaymentPoller

class OnlinePaymentPollerTest {
    @Test fun manualCheckWakesSleepingActivePollerImmediately() = runBlocking {
        var calls = 0
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val poller = OnlinePaymentPoller(scope, { true }, { calls < 2 }, { calls++ }, 60_000)
            poller.resume()
            assertEquals(1, calls)
            poller.resume() // Existing loop is running but sleeping.
            assertEquals(1, calls)
            val checked = poller.checkNow()
            withTimeout(5_000) { checked.await() }
            withTimeout(5_000) { while (calls < 2) yield() }
            assertEquals(2, calls)
        } finally { scope.cancel() }
    }

    @Test fun checksDuringInFlightRequestDoNotCancelOrDuplicateThatRequest() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val manualGate = CompletableDeferred<Unit>()
        var calls = 0
        var firstFinished = false
        val modes = mutableListOf<Boolean>()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            val poller = OnlinePaymentPoller(scope, { true }, { calls < 2 }, { manual ->
                modes += manual
                calls++
                if (calls == 1) { gate.await(); firstFinished = true }
                else { assertTrue(firstFinished); manualGate.await() }
            }, 60_000)
            poller.resume()
            val checked = poller.checkNow()
            repeat(10) { assertSame(checked, poller.checkNow()) }
            assertEquals(1, calls)
            assertFalse(firstFinished)
            assertFalse(checked.isCompleted)
            gate.complete(Unit)
            withTimeout(5_000) { while (calls < 2) yield() }
            assertFalse(checked.isCompleted)
            manualGate.complete(Unit)
            withTimeout(5_000) { checked.await() }
            assertTrue(firstFinished)
            assertEquals(2, calls)
            assertEquals(listOf(false, true), modes)
        } finally { scope.cancel() }
    }

    @Test fun blockedDeviceOrTerminalAttemptDoesNotPoll() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        try {
            var calls = 0
            withTimeout(5_000) {
                OnlinePaymentPoller(scope, { false }, { true }, { calls++ }).checkNow().await()
                OnlinePaymentPoller(scope, { true }, { false }, { calls++ }).checkNow().await()
            }
            assertEquals(0, calls)
        } finally { scope.cancel() }
    }

    @Test fun firstManualCheckStartsOnlyOneRequestAndWaitsForItsResponse() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val gate = CompletableDeferred<Unit>()
        try {
            var calls = 0
            val poller = OnlinePaymentPoller(scope, { true }, { true }, { manual ->
                assertTrue(manual)
                calls++; gate.await()
            }, 60_000)
            val checked = poller.checkNow()
            assertEquals(1, calls)
            assertFalse(checked.isCompleted)
            gate.complete(Unit)
            withTimeout(5_000) { checked.await() }
            assertEquals(1, calls)
        } finally { scope.cancel() }
    }
}
