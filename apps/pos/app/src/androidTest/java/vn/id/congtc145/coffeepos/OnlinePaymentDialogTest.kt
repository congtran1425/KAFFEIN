package vn.id.congtc145.coffeepos

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.espresso.Espresso
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity
import vn.id.congtc145.coffeepos.ui.checkout.CheckoutUiState
import vn.id.congtc145.coffeepos.ui.checkout.PaymentMethod
import vn.id.congtc145.coffeepos.ui.reference.LivePaymentDialog
import vn.id.congtc145.coffeepos.ui.theme.CoffeePOSTheme

/** Stateless UI fixtures: no operational cart, credential or Room writes. */
class OnlinePaymentDialogTest {
    @get:Rule val compose = createComposeRule()
    private fun state(provider: String = "MOMO", status: String = "RECONCILING") = CheckoutUiState(
        totalAmount = 45_000, selectedMethod = PaymentMethod.MOMO_QR,
        onlineAttempt = OnlinePaymentAttemptEntity("sale", "1", "device", "register", "1000001",
            "Cashier", "[]", 45_000, 1, status, "payment", "hidden-expired-qr", 1, provider)
    )

    @Test fun pendingMomoCannotDismissAndClosesOnlyAfterServerCancelled() {
        val pending = mutableStateOf(state())
        var cancels = 0
        compose.setContent { CoffeePOSTheme {
            if (pending.value.hasPendingOnline) LivePaymentDialog(pending.value, {}, { cancels++ })
        } }
        compose.onNodeWithTag("online-payment-display-expired").assertIsDisplayed()
        compose.onNodeWithTag("online-payment-dismiss").assertDoesNotExist()
        Espresso.pressBack()
        compose.onNodeWithText("Thanh toán MoMo").assertIsDisplayed()
        compose.onNodeWithTag("online-payment-cancel").performClick()
        compose.onNodeWithText("Thanh toán MoMo").assertIsDisplayed()
        compose.runOnIdle {
            assertEquals(1, cancels)
            assertTrue(pending.value.hasPendingOnline)
            assertFalse(pending.value.canEdit)
            pending.value = pending.value.copy(onlineAttempt = pending.value.onlineAttempt!!.copy(status = "CANCELLED"))
        }
        compose.onNodeWithText("Thanh toán MoMo").assertDoesNotExist()
        compose.runOnIdle { assertTrue(pending.value.canEdit) }
    }

    @Test fun networkRequestKeepsDialogLockedUntilAuthoritativeResponse() {
        compose.setContent { CoffeePOSTheme {
            LivePaymentDialog(state().copy(isCheckingOnline = true), {}, {})
        } }
        compose.onNodeWithTag("online-payment-check").assertIsNotEnabled()
        compose.onNodeWithTag("online-payment-cancel").assertIsNotEnabled()
        compose.onNodeWithTag("online-payment-dismiss").assertDoesNotExist()
        Espresso.pressBack()
        compose.onNodeWithText("Thanh toán MoMo").assertIsDisplayed()
    }

    @Test fun zaloPayRetainsItsSupportedCancelAction() {
        var cancels = 0
        var checks = 0
        val pending = mutableStateOf(state(provider = "ZALOPAY"))
        compose.setContent { CoffeePOSTheme {
            LivePaymentDialog(pending.value, {
                checks++
                pending.value = pending.value.copy(isCheckingOnline = true)
            }, { cancels++ })
        } }
        compose.onNodeWithTag("online-payment-cancel").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals(1, cancels) }
        compose.onNodeWithTag("online-payment-check").performClick()
        compose.onNodeWithText("Đang kiểm tra…").assertIsDisplayed()
        compose.onNodeWithTag("online-payment-check").assertIsNotEnabled()
        compose.onNodeWithTag("online-payment-cancel").assertIsNotEnabled()
        compose.runOnIdle {
            assertEquals(1, checks)
            pending.value = pending.value.copy(isCheckingOnline = false,
                onlineCheckMessage = "17:50:00 · Máy chủ chưa có xác nhận thanh toán.")
        }
        compose.onNodeWithTag("online-payment-check-result").assertIsDisplayed()
        compose.onNodeWithTag("online-payment-check").assertIsEnabled()
        compose.onNodeWithText("Thanh toán ZaloPay").assertIsDisplayed()
    }

    @Test fun knownPaidCannotDismissCancelOrTakeCashBeforeReceiptImport() {
        val paid = state(status = "PAID_RECONCILING")
        compose.setContent { CoffeePOSTheme { LivePaymentDialog(paid, {}, {}) } }
        compose.onNodeWithText("Đã nhận tiền").assertIsDisplayed()
        compose.onNodeWithTag("online-payment-cancel").assertDoesNotExist()
        compose.onNodeWithTag("online-payment-dismiss").assertDoesNotExist()
        Espresso.pressBack()
        compose.onNodeWithText("Đã nhận tiền").assertIsDisplayed()
        compose.runOnIdle {
            assertFalse(paid.canEdit)
            assertEquals(PaymentMethod.MOMO_QR, paid.withPaymentMethod(PaymentMethod.CASH).selectedMethod)
        }
    }
}
