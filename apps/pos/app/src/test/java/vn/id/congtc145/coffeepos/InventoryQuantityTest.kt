package vn.id.congtc145.coffeepos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.decimalText
import vn.id.congtc145.coffeepos.data.local.parseNonNegative
import vn.id.congtc145.coffeepos.data.local.parseQuantity
import java.math.BigDecimal

class InventoryQuantityTest {
    @Test fun exactDecimalDeductionDoesNotRound() {
        val perItem = parseQuantity("0.125")
        val required = perItem.multiply(BigDecimal(3))
        val remaining = parseNonNegative("1.000").subtract(required)
        assertEquals("0.625", decimalText(remaining))
    }

    @Test fun rejectsZeroNegativeAndTooPreciseRecipeQuantities() {
        listOf("0", "-1", "0.0001", "oops").forEach { value ->
            assertThrows(Exception::class.java) { parseQuantity(value) }
        }
    }
}
