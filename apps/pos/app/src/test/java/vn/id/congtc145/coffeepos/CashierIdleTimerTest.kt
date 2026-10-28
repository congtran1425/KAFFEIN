package vn.id.congtc145.coffeepos

import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.CashierIdleTimer

class CashierIdleTimerTest {
    @Test fun locksAtExactlyFifteenMinutesAndResetsOnActivity() {
        var now = 0L
        val timer = CashierIdleTimer({ now })
        assertFalse(timer.isExpired())
        timer.start()
        now = 899_999L
        assertFalse(timer.isExpired())
        timer.recordActivity()
        now += 899_999L
        assertFalse(timer.isExpired())
        now++
        assertTrue(timer.isExpired())
        timer.start()
        assertFalse(timer.isExpired())
        timer.stop()
        now += 1_000_000L
        assertFalse(timer.isExpired())
    }

    @Test fun stoppedSessionCannotRestartFromLaterTouches() {
        var now = 0L
        val timer = CashierIdleTimer({ now })
        timer.start()
        now = 900_000L
        assertTrue(timer.isExpired())
        timer.stop()
        timer.recordActivity()
        now += 900_000L
        assertFalse(timer.isExpired())
        timer.start()
        assertFalse(timer.isExpired())
    }
}
