package vn.id.congtc145.coffeepos.domain

/** Monotonic clock prevents wall-clock/timezone changes from bypassing idle lock. */
class CashierIdleTimer(
    private val nowMs: () -> Long,
    private val timeoutMs: Long = 15 * 60 * 1000L
) {
    private var lastActivityMs: Long? = null
    fun start() { lastActivityMs = nowMs() }
    fun stop() { lastActivityMs = null }
    fun recordActivity() { if (lastActivityMs != null) lastActivityMs = nowMs() }
    fun isExpired(): Boolean = lastActivityMs?.let { nowMs() - it >= timeoutMs } ?: false
}
