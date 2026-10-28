package vn.id.congtc145.coffeepos

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.CashCountInput
import vn.id.congtc145.coffeepos.ui.register.CashCountLayout
import vn.id.congtc145.coffeepos.ui.register.CashCountMode
import vn.id.congtc145.coffeepos.ui.login.LoginScreenContent
import vn.id.congtc145.coffeepos.ui.login.LoginUiState
import vn.id.congtc145.coffeepos.ui.theme.CoffeePOSTheme
import java.io.File

/** Stateless Compose fixtures: no enrollment, database, cashier login or register mutation. */
class CashCountUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun quantityControlsReplaceAddAndClearOnlyTheSelectedRow() {
        val input = mutableStateOf(CashCountInput())
        var reviews = 0
        compose.setContent { CoffeePOSTheme {
            CashCountLayout(CashCountMode.OPEN, input.value, { input.value = it }, null,
                "Thu ngân thử nghiệm", "Chi nhánh thử nghiệm", null, false, null, {}, { reviews++ })
        } }
        compose.onNodeWithTag("cash-plus-500000").performClick()
        compose.onNodeWithTag("cash-quantity-200000").performClick()
        compose.onNodeWithTag("cash-key-2").performClick()
        compose.onNodeWithTag("cash-quick-10").performClick()
        compose.onNodeWithTag("cash-quick-20").performClick()
        compose.onNodeWithTag("cash-quick-50").performClick()
        compose.runOnIdle { assertEquals(82, input.value.quantity) }
        compose.onNodeWithTag("cash-minus-200000").performClick()
        compose.onNodeWithTag("cash-key-⌫").performClick()
        compose.runOnIdle { assertEquals(8, input.value.quantity) }
        compose.onNodeWithTag("cash-key-Xóa hết").performClick()
        compose.runOnIdle { assertEquals(500000L, input.value.total) }
        compose.onNodeWithTag("cash-review").performClick()
        compose.runOnIdle { assertEquals(1, reviews) }
    }

    @Test fun threeModesShareCashTableAndFixedReviewAction() {
        val mode = mutableStateOf(CashCountMode.OPEN)
        val input = CashCountInput(counts = mapOf(500000L to 3, 200000L to 4, 100000L to 3,
            50000L to 3, 20000L to 3, 10000L to 2, 5000L to 1), selected = 10000L)
        compose.setContent { CoffeePOSTheme {
            CashCountLayout(mode.value, input, {}, if (mode.value == CashCountMode.OPEN) null else 2845000L,
                "Trần Chí Công", "Chi nhánh Thảo Điền", if (mode.value == CashCountMode.OPEN) null else "Mở lúc 06:00 · 19/10",
                false, null, {}, {})
        } }
        CashCountMode.entries.forEach { variant ->
            compose.runOnIdle { mode.value = variant }
            compose.onNodeWithText(variant.title).assertIsDisplayed()
            compose.onNodeWithTag("cash-review").assertIsDisplayed().assertIsEnabled()
            compose.onNodeWithTag("cash-quick-10").assertIsDisplayed()
            compose.onNodeWithText("Theo sổ").assertDoesNotExist()
            compose.onNodeWithText("Chênh lệch").assertDoesNotExist()
            assertTrue("All nine denominations must fit above the total",
                compose.onNodeWithTag("cash-row-1000").getUnclippedBoundsInRoot().bottom <=
                    compose.onNodeWithTag("cash-count-total").getUnclippedBoundsInRoot().top)
            compose.onNodeWithText("Khay tiền đã mở tự động").assertDoesNotExist()
            screenshot("cash-count-${variant.name.lowercase()}")
        }
    }

    @Test fun authenticationReusesLoginFormWithoutInstructionNotes() {
        compose.setContent { CoffeePOSTheme {
            LoginScreenContent(LoginUiState(storeName = "Chi nhánh Thảo Điền"), {}, {}, {}, {}, {},
                sectionTitle = "XÁC THỰC THU NGÂN", headline = "Bàn giao quỹ", actionLabel = "Quay lại", showInputStatus = false)
        } }
        compose.onNodeWithText("XÁC THỰC THU NGÂN").assertIsDisplayed()
        compose.onNodeWithTag("employee-code").assertIsDisplayed()
        compose.onNodeWithTag("pin-field").assertIsDisplayed()
        compose.onNodeWithText("ĐANG NHẬP: MÃ NHÂN VIÊN").assertDoesNotExist()
        screenshot("cash-count-auth")
    }

    @Test fun savingDisablesCountingAndDuplicateConfirmation() {
        compose.setContent { CoffeePOSTheme {
            CashCountLayout(CashCountMode.CLOSE, CashCountInput(), {}, 500000L,
                "Thu ngân", "Chi nhánh", "Mở lúc 06:00", true, null, {}, {})
        } }
        compose.onNodeWithTag("cash-review").assertIsNotEnabled()
        compose.onNodeWithTag("cash-quick-50").assertIsNotEnabled()
        compose.onNodeWithTag("cash-plus-200000").assertIsNotEnabled()
    }

    @Test fun compensationSharesNotesTableAndRequiresAtLeastTheShortage() {
        val input = mutableStateOf(CashCountInput())
        var closes = 0
        compose.setContent { CoffeePOSTheme {
            CashCountLayout(CashCountMode.HANDOVER, input.value, { input.value = it }, null,
                "Thu ngân", "Chi nhánh", "Quỹ thiếu: -35.000 đ", false, null, {}, { closes++ },
                shortage = 35000, title = "Nộp tiền bù quỹ két thiếu", actionLabel = "Xác nhận nộp bù & hoàn tất")
        } }
        compose.onNodeWithTag("cash-review").assertIsNotEnabled()
        compose.onNodeWithTag("cash-plus-10000").performClick()
        compose.onNodeWithTag("cash-review").assertIsNotEnabled()
        compose.onNodeWithTag("cash-plus-50000").performClick()
        compose.onNodeWithTag("cash-review").assertIsEnabled().performClick()
        compose.onNodeWithText("Theo sổ").assertDoesNotExist()
        compose.onNodeWithText("Chênh lệch").assertDoesNotExist()
        compose.runOnIdle { assertEquals(1, closes); assertEquals(60000L, input.value.total) }
        screenshot("cash-count-compensation")
    }

    private fun screenshot(name: String) {
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "verification-screenshots")
        directory.mkdirs()
        File(directory, "$name.png").outputStream().use { output ->
            compose.onNode(isRoot()).captureToImage().asAndroidBitmap()
                .compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output)
        }
    }
}
