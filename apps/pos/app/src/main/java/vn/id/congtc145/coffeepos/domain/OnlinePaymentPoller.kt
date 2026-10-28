package vn.id.congtc145.coffeepos.domain

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** Manual checks wake the existing poll loop, without cancelling an HTTP
 * create/import or starting a competing settlement. Requests are coalesced. */
class OnlinePaymentPoller(
    private val scope: CoroutineScope,
    private val canPoll: () -> Boolean,
    private val hasUnresolved: suspend () -> Boolean,
    private val reconcile: suspend (manual: Boolean) -> Unit,
    private val intervalMs: Long = 3_000
) {
    private var job: Job? = null
    private val requests = Channel<Unit>(Channel.CONFLATED)
    private var manualCheck: CompletableDeferred<Unit>? = null

    fun resume() {
        if (!canPoll() || job?.isActive == true) return
        job = scope.launch {
            try {
                while (canPoll() && hasUnresolved()) {
                    val check = manualCheck
                    try {
                        reconcile(check != null)
                        check?.complete(Unit)
                    } catch (error: Throwable) {
                        check?.completeExceptionally(error)
                        throw error
                    }
                    if (manualCheck === check) manualCheck = null
                    if (!hasUnresolved()) break
                    withTimeoutOrNull(intervalMs) { requests.receive() }
                }
            } finally {
                // A terminal payment or blocked device may stop the loop before
                // a queued check starts. Never leave its loading state waiting.
                manualCheck?.complete(Unit)
                manualCheck = null
                requests.tryReceive()
            }
        }
    }

    fun checkNow(): Deferred<Unit> {
        manualCheck?.takeUnless { it.isCompleted }?.let { return it }
        val completion = CompletableDeferred<Unit>()
        manualCheck = completion
        if (!canPoll()) {
            manualCheck = null
            completion.complete(Unit)
            return completion
        }
        if (job?.isActive == true) requests.trySend(Unit)
        resume()
        return completion
    }
}
