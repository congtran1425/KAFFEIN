package vn.id.congtc145.coffeepos

import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.CashCountInput
import vn.id.congtc145.coffeepos.domain.validCashCountSnapshot
import vn.id.congtc145.coffeepos.domain.validCashCompensation
import vn.id.congtc145.coffeepos.domain.mergeCashCounts

class CashCountTest {
    @Test fun compensationAcceptsExactOrOverpaidNotesButNeverInventsChange() {
        assertFalse(validCashCompensation(-35000, mapOf(10000L to 3)))
        assertTrue(validCashCompensation(-35000, mapOf(20000L to 1, 10000L to 1, 5000L to 1)))
        assertTrue(validCashCompensation(-35000, mapOf(50000L to 1)))
        assertFalse(validCashCompensation(0, mapOf(50000L to 1)))
        assertEquals(mapOf(50000L to 1, 20000L to 1, 5000L to 1),
            mergeCashCounts(mapOf(20000L to 1, 5000L to 1), mapOf(50000L to 1)))
    }
    @Test fun selectingRowReplacesQuantityAndQuickAddsAccumulate() {
        var input = CashCountInput().adjust(200_000, 20)
        input = input.select(200_000).digit("3").digit("4")
        assertEquals(34, input.quantity)
        input = input.adjust(200_000, 10).adjust(200_000, 20).adjust(200_000, 50)
        assertEquals(114, input.quantity)
        assertEquals(22_800_000L, input.total)
    }

    @Test fun clearAndBackspaceOnlyAffectSelectedDenomination() {
        val input = CashCountInput().adjust(500_000, 2).adjust(1_000, 123)
        val shortened = input.backspace()
        assertEquals(12, shortened.quantity)
        val cleared = shortened.clearSelected()
        assertEquals(0, cleared.quantity)
        assertEquals(2, cleared.counts[500_000])
        assertEquals(1_000_000L, cleared.total)
        assertEquals(0, cleared.adjust(1_000, -1).quantity)
    }

    @Test fun rejectedOverflowPreservesPreviousCountsAndCanBeCorrected() {
        val input = CashCountInput().adjust(500_000, 1999)
        val rejected = input.adjust(500_000, 50)
        assertNotNull(rejected.error)
        assertEquals(input.counts, rejected.counts)
        assertNull(rejected.backspace().error)
        assertEquals(input, input.digit("x"))
    }

    @Test fun snapshotMustMatchRecognizedDenominationsAndActualTotal() {
        assertTrue(validCashCountSnapshot(500_000, mapOf(200_000L to 2, 100_000L to 1)))
        assertFalse(validCashCountSnapshot(400_000, mapOf(200_000L to 1)))
        assertFalse(validCashCountSnapshot(10, mapOf(10L to 1)))
        assertFalse(validCashCountSnapshot(-1000, mapOf(1000L to -1)))
        assertTrue(validCashCountSnapshot(0, emptyMap()))
    }
}
