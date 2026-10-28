package vn.id.congtc145.coffeepos

import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity
import vn.id.congtc145.coffeepos.ui.checkout.CheckoutUiState
import vn.id.congtc145.coffeepos.ui.checkout.PaymentMethod

class OnlinePaymentCheckoutStateTest {
    private fun state(provider: String = "MOMO", status: String = "RECONCILING") = CheckoutUiState(
        selectedMethod = if (provider == "MOMO") PaymentMethod.MOMO_QR else PaymentMethod.ZALOPAY_QR,
        totalAmount = 45_000,
        onlineAttempt = OnlinePaymentAttemptEntity("sale", "1", "device", "register", "1000001",
            "Cashier", "[]", 45_000, 1, status, expiresAt = 1, provider = provider)
    )

    @Test fun elapsedDisplayTimeDoesNotUnlockAnotherTender() {
        listOf("WAITING", "RECONCILING", "CREATING", "PAID_RECONCILING").forEach { status ->
            val pending = state(status = status)
            assertTrue(pending.hasPendingOnline)
            assertFalse(pending.canEdit)
            assertEquals(PaymentMethod.MOMO_QR, pending.withPaymentMethod(PaymentMethod.CASH).selectedMethod)
            assertSame(pending, pending.withCashReceived(50_000))
            assertSame(pending, pending.withAddedCash(50_000))
        }
    }

    @Test fun pendingCancelCapabilityMatchesExistingProviderContract() {
        assertTrue(state().canCancelPendingOnline)
        assertTrue(state(status = "WAITING").canCancelPendingOnline)
        assertTrue(state(provider = "ZALOPAY").canCancelPendingOnline)
        assertFalse(state(provider = "ZALOPAY", status = "PAID_RECONCILING").canCancelPendingOnline)
    }

    @Test fun onlyAuthoritativeFinalUnpaidAllowsAnotherTender() {
        val finalUnpaid = state(status = "FINAL_UNPAID")
        assertFalse(finalUnpaid.hasPendingOnline)
        assertTrue(finalUnpaid.canEdit)
        assertFalse(finalUnpaid.canCancelPendingOnline)
        assertEquals(PaymentMethod.CASH, finalUnpaid.withPaymentMethod(PaymentMethod.CASH).selectedMethod)
    }

    @Test fun serverCancelledAllowsNewTenderWithoutReusingCancelledAttempt() {
        val cancelled = state(status = "CANCELLED")
        assertFalse(cancelled.hasPendingOnline)
        assertTrue(cancelled.canEdit)
        assertFalse(cancelled.canCancelPendingOnline)
        assertEquals(PaymentMethod.CASH, cancelled.withPaymentMethod(PaymentMethod.CASH).selectedMethod)
    }
}
