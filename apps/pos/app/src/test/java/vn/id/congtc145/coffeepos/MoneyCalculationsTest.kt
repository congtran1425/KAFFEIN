package vn.id.congtc145.coffeepos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.calculateInclusiveVat

class MoneyCalculationsTest {
    @Test
    fun zeroRateProducesNoVat() {
        assertEquals(0L, calculateInclusiveVat(55_000, 0))
    }

    @Test
    fun inclusiveTenPercentIsExtractedFromGrossPrice() {
        assertEquals(10_000L, calculateInclusiveVat(110_000, 1_000))
    }

    @Test
    fun rejectsRateOutsideDatabaseConstraint() {
        assertThrows(IllegalArgumentException::class.java) {
            calculateInclusiveVat(100_000, 10_001)
        }
    }
}
