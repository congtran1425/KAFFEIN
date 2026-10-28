package vn.id.congtc145.coffeepos

import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.domain.appendCashDigit
import vn.id.congtc145.coffeepos.domain.appendCashFactor
import vn.id.congtc145.coffeepos.domain.cashCheckoutValidationError
import vn.id.congtc145.coffeepos.domain.includedVatLabel
import vn.id.congtc145.coffeepos.ui.checkout.CheckoutUiState
import vn.id.congtc145.coffeepos.ui.checkout.PaymentMethod
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping

class CheckoutAmountsTest {
    private fun item(price: Long = 108_000L, rate: Int = 800, quantity: Int = 1): OrderLineItem {
        val product = CatalogProduct("10", "CF01", "Cà phê", "1", "Cà phê", price, rate,
            true, "", "[]")
        val variant = ProductVariantEntity("22", "10", "M", "M", price, true)
        return OrderLineItem("line-1", product, variant, quantity = quantity)
    }

    @Test fun acceptsInclusiveVatWithoutChargingItTwice() {
        assertNull(cashCheckoutValidationError(listOf(item()), 108_000, 8_000, 108_000, 110_000))
    }

    @Test fun rejectsVatAddedToGrossTotal() {
        assertNotNull(cashCheckoutValidationError(listOf(item()), 108_000, 8_000, 116_000, 120_000))
    }

    @Test fun rejectsMismatchedVat() {
        assertNotNull(cashCheckoutValidationError(listOf(item()), 108_000, 0, 108_000, 110_000))
    }

    @Test fun acceptsQuantityAndToppingSnapshot() {
        val line = item(40_000, 0, 2).copy(toppings = listOf(
            SelectedTopping(ToppingEntity("1", "Trân châu", 10_000), 3)))
        assertNull(cashCheckoutValidationError(listOf(line), 140_000, 0, 140_000, 150_000))
    }

    @Test fun rejectsEmptyAndInsufficientCash() {
        assertNotNull(cashCheckoutValidationError(emptyList(), 0, 0, 0, 0))
        assertNotNull(cashCheckoutValidationError(listOf(item()), 108_000, 8_000, 108_000, 100_000))
        assertNotNull(cashCheckoutValidationError(listOf(item()), 108_000, 8_000, 108_000, -1))
    }

    @Test fun rejectsInvalidQuantityAndTaxRate() {
        assertNotNull(cashCheckoutValidationError(listOf(item(quantity = 0)), 0, 0, 0, 0))
        assertNotNull(cashCheckoutValidationError(listOf(item(rate = -1)), 108_000, 0, 108_000, 108_000))
    }

    @Test fun rejectsOverflowRatherThanWritingWrappedAmounts() {
        assertNotNull(cashCheckoutValidationError(listOf(item(Long.MAX_VALUE, 0, 2)), -2, 0, -2, 0))
        assertNotNull(cashCheckoutValidationError(listOf(item(Long.MAX_VALUE, 800)), Long.MAX_VALUE,
            0, Long.MAX_VALUE, Long.MAX_VALUE))
    }

    @Test fun formatsActualVatRatesAndDoesNotInventOneForMixedRates() {
        assertEquals("VAT đã gồm (0%)", includedVatLabel(listOf(0, 0)))
        assertEquals("VAT đã gồm (8%)", includedVatLabel(listOf(800)))
        assertEquals("VAT đã gồm (8,25%)", includedVatLabel(listOf(825)))
        assertEquals("VAT đã gồm", includedVatLabel(listOf(0, 800)))
        assertEquals("VAT đã gồm", includedVatLabel(emptyList()))
    }

    @Test fun freezesAmountAndMethodWhileSavingOrAfterCompletion() {
        listOf(CheckoutUiState(isSaving = true, cashReceived = 100_000),
            CheckoutUiState(savedReceiptId = "sale", cashReceived = 100_000)).forEach { state ->
            assertFalse(state.canEdit)
            assertSame(state, state.withCashReceived(200_000))
            assertSame(state, state.withAddedCash(50_000))
            assertSame(state, state.withPaymentMethod(PaymentMethod.ZALOPAY_QR))
        }
    }

    @Test fun editableStateUpdatesAmountAndMethod() {
        val state = CheckoutUiState(cashReceived = 100_000)
        assertTrue(state.canEdit)
        assertEquals(150_000L, state.withAddedCash(50_000).cashReceived)
        assertEquals(0L, state.withCashReceived(-1).cashReceived)
        assertEquals(PaymentMethod.ZALOPAY_QR, state.withPaymentMethod(PaymentMethod.ZALOPAY_QR).selectedMethod)
    }

    @Test fun quickCashOverflowAndNegativeIncrementKeepOriginalAmount() {
        val state = CheckoutUiState(cashReceived = Long.MAX_VALUE)
        assertEquals(Long.MAX_VALUE, state.withAddedCash(1).cashReceived)
        assertNotNull(state.withAddedCash(1).errorMessage)
        assertEquals(Long.MAX_VALUE, state.withAddedCash(-1).cashReceived)
        assertNotNull(state.withAddedCash(-1).errorMessage)
    }

    @Test fun keypadClampsWithoutOverflow() {
        assertEquals(123L, appendCashDigit(12, 3))
        assertEquals(999_999_999L, appendCashDigit(Long.MAX_VALUE, 9))
        assertEquals(999_999_999L, appendCashDigit(999_999_999, 9))
        assertEquals(Long.MAX_VALUE, appendCashDigit(Long.MAX_VALUE, 9, Long.MAX_VALUE))
    }

    @Test fun keypadFactorMultipliesWithoutOverflow() {
        assertEquals(0L, appendCashFactor(0, 100))
        assertEquals(0L, appendCashFactor(0, 1000))
        assertEquals(115_000L, appendCashFactor(115, 1000))
        assertEquals(20_000L, appendCashFactor(200, 100))
        assertEquals(999_999_999L, appendCashFactor(999_999_999L, 1000))
        assertEquals(999_999_999L, appendCashFactor(1_000_000L, 1000))
    }
}

