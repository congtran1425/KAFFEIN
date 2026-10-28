package vn.id.congtc145.coffeepos

import android.graphics.Bitmap
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.input.key.Key
import androidx.navigation.compose.*
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.NumericCredentials
import vn.id.congtc145.coffeepos.ui.attendance.*
import vn.id.congtc145.coffeepos.ui.components.AuthKeypadInput
import vn.id.congtc145.coffeepos.ui.login.LoginScreenContent
import vn.id.congtc145.coffeepos.ui.login.LoginUiState
import vn.id.congtc145.coffeepos.ui.login.CashierLockViewModel
import vn.id.congtc145.coffeepos.ui.navigation.*
import vn.id.congtc145.coffeepos.ui.theme.CoffeePOSTheme
import java.io.File

class PosAuthenticationUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun loginUsesReferenceLayoutWithoutGuidanceAndAttendanceRemainsSeparate() {
        var opened = false
        compose.setContent {
            CoffeePOSTheme {
                LoginScreenContent(LoginUiState(storeName = "Chi nhánh kiểm thử"),
                    { opened = true }, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("Chào mừng trở lại").assertIsDisplayed()
        compose.onNodeWithText("Xóa hết").assertIsDisplayed()
        compose.onNodeWithText("Lưu ý quy định vận hành:").assertDoesNotExist()
        screenshot("01-login")
        compose.onNodeWithText("Chấm công  →").performClick()
        compose.runOnIdle { assertTrue(opened) }
    }

    @Test fun attendanceSelectsActionBeforeEnteringCredentialsAndRendersBothForms() {
        val action = mutableStateOf<AttendanceActionType?>(null)
        compose.setContent {
            CoffeePOSTheme {
                AttendanceScreenContent(AttendanceUiState(selectedAction = action.value),
                    "Chi nhánh kiểm thử", true, {}, { action.value = it }, { action.value = null },
                    {}, {}, {}, {})
            }
        }
        compose.onNodeWithTag("employee-code").assertDoesNotExist()
        screenshot("02-attendance")
        compose.onNodeWithText("Chọn vào ca  →").performClick()
        compose.onNodeWithText("Xác thực vào ca").assertIsDisplayed()
        compose.onNodeWithTag("employee-code").assertIsDisplayed()
        screenshot("03-check-in")
        compose.onNodeWithText("←  Chọn thao tác khác").performClick()
        compose.onNodeWithText("Chọn ra ca  →").performClick()
        compose.onNodeWithText("Xác thực ra ca").assertIsDisplayed()
        screenshot("04-check-out")
    }

    @Test fun offlineAttendanceDisablesActionsWithoutPretendingToSubmit() {
        compose.setContent {
            CoffeePOSTheme {
                AttendanceScreenContent(AttendanceUiState(), "Chi nhánh kiểm thử", false,
                    {}, {}, {}, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("Ngoại tuyến").assertIsDisplayed()
        compose.onNodeWithText("Chọn vào ca  →").assertIsNotEnabled()
        compose.onNodeWithText("Chọn ra ca  →").assertIsNotEnabled()
        compose.onNodeWithText("Đang vào ca…").assertDoesNotExist()
        compose.onNodeWithText("←  Quay lại").assertIsEnabled()
    }

    @Test fun sharedKeypadMasksPinAndClearIsScopedToSelectedField() {
        val input = mutableStateOf(NumericCredentials("1000001", "12", "PIN"))
        compose.setContent {
            CoffeePOSTheme {
                AuthKeypadInput(input.value.employeeCode, input.value.pin, input.value.activeField, false,
                    { input.value = input.value.select(it) },
                    { input.value = input.value.append(it) },
                    { input.value = input.value.backspace() },
                    { input.value = NumericCredentials() })
            }
        }
        compose.onNodeWithText("12").assertDoesNotExist()
        compose.onNodeWithText("Hiện").performClick()
        compose.onNodeWithText("Ẩn").assertIsDisplayed()
        compose.onNodeWithText("Ẩn").performClick()
        compose.onNodeWithText("Xóa hết").performClick()
        compose.runOnIdle {
            assertEquals("", input.value.employeeCode)
            assertEquals("", input.value.pin)
            assertEquals("CODE", input.value.activeField)
        }
        input.value = NumericCredentials("1000001", "", "PIN")
        compose.onNodeWithText("Xóa").performClick()
        compose.runOnIdle { assertEquals("100000", input.value.employeeCode) }
    }

    @Test fun timeoutRedirectDropsSellingBackStack() {
        val locked = mutableStateOf(false)
        var ended = 0
        lateinit var controller: androidx.navigation.NavHostController
        compose.setContent {
            CoffeePOSTheme {
                controller = rememberNavController()
                CashierSessionRedirect(locked.value, controller) { ended++; locked.value = false }
                NavHost(controller, startDestination = PosDestinations.ORDER) {
                    composable(PosDestinations.ORDER) { androidx.compose.material3.Text("Test order") }
                    composable(PosDestinations.CHECKOUT) { androidx.compose.material3.Text("Test checkout") }
                    composable(PosDestinations.LOGIN) { androidx.compose.material3.Text("Test login") }
                }
            }
        }
        compose.runOnIdle { controller.navigate(PosDestinations.CHECKOUT); locked.value = true }
        compose.onNodeWithText("Test login").assertIsDisplayed()
        compose.runOnIdle {
            assertNull(controller.previousBackStackEntry)
            assertFalse(controller.popBackStack())
            assertEquals(1, ended)
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test fun physicalKeyboardUsesTheSameCodeAndPinRules() {
        val input = mutableStateOf(NumericCredentials("100000", "", "CODE"))
        compose.setContent {
            CoffeePOSTheme {
                AuthKeypadInput(input.value.employeeCode, input.value.pin, input.value.activeField, false,
                    { input.value = input.value.select(it) }, { input.value = input.value.append(it) },
                    { input.value = input.value.backspace() }, { input.value = input.value.clearAll() })
            }
        }
        compose.onNodeWithTag("employee-code").performClick()
        compose.onRoot().performKeyInput { pressKey(Key.One) }
        compose.runOnIdle { assertEquals("PIN", input.value.activeField) }
        compose.onRoot().performKeyInput { pressKey(Key.Two) }
        compose.runOnIdle { assertEquals("2", input.value.pin) }
        compose.onRoot().performKeyInput { pressKey(Key.Backspace); pressKey(Key.Backspace) }
        compose.runOnIdle {
            assertEquals("100000", input.value.employeeCode)
            assertEquals("", input.value.pin)
        }
    }

    @Test fun postingDisablesControlsAndFailureRetainsEditableCredentials() {
        val loading = mutableStateOf(true)
        compose.setContent {
            CoffeePOSTheme {
                LoginScreenContent(LoginUiState(employeeCode = "1000001", pin = "12", activeField = "PIN",
                    isLoading = loading.value, errorMessage = if (loading.value) null else "PIN không hợp lệ"),
                    {}, {}, {}, {}, {})
            }
        }
        compose.onNodeWithText("Xóa hết").assertIsNotEnabled()
        compose.onNodeWithText("Chấm công  →").assertIsNotEnabled()
        compose.onNodeWithText("Đang đăng nhập…").assertIsDisplayed()
        compose.runOnIdle { loading.value = false }
        compose.onNodeWithText("PIN không hợp lệ").assertIsDisplayed()
        compose.onNodeWithText("2/4").assertIsDisplayed()
        compose.onNodeWithText("Xóa hết").assertIsEnabled()
    }

    @Test fun manualLockFromOrderAndCheckoutReturnsToLoginWithoutPinOverlay() {
        val application = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as android.app.Application
        val holder = androidx.lifecycle.ViewModelStore()
        lateinit var gate: CashierLockViewModel
        lateinit var controller: androidx.navigation.NavHostController
        var ended = 0
        compose.runOnIdle {
            gate = CashierLockViewModel(application) { 0L }
            holder.put("gate", gate)
            gate.beginSession("1000001", "Synthetic cashier")
        }
        try {
            compose.setContent {
                CoffeePOSTheme {
                    controller = rememberNavController()
                    val state by gate.state.collectAsState()
                    CashierSessionRedirect(state.isLocked, controller) { ended++; gate.endSession() }
                    NavHost(controller, startDestination = PosDestinations.ORDER) {
                        listOf(PosDestinations.ORDER, PosDestinations.CHECKOUT).forEach { route ->
                            composable(route) {
                                androidx.compose.material3.TextButton(onClick = gate::lock) {
                                    androidx.compose.material3.Text("Khóa thu ngân")
                                }
                            }
                        }
                        composable(PosDestinations.LOGIN) { androidx.compose.material3.Text("Test login") }
                    }
                }
            }
            listOf(PosDestinations.ORDER, PosDestinations.CHECKOUT).forEach { route ->
                compose.runOnIdle {
                    gate.beginSession("1000001", "Synthetic cashier")
                    controller.navigate(route)
                }
                compose.onNodeWithText("Khóa thu ngân").performClick()
                compose.onNodeWithText("Test login").assertIsDisplayed()
                compose.onNodeWithText("Phiên thu ngân đã khóa").assertDoesNotExist()
                compose.runOnIdle {
                    assertNull(controller.previousBackStackEntry)
                    assertEquals("", gate.state.value.employeeCode)
                }
            }
            compose.runOnIdle { assertEquals(2, ended) }
        } finally {
            compose.runOnIdle { holder.clear() }
        }
    }

    @Test fun manualLockAndFirstTouchAfterTimeoutBothRequireNewLogin() {
        val application = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as android.app.Application
        val holder = androidx.lifecycle.ViewModelStore()
        var now = 0L
        lateinit var gate: CashierLockViewModel
        compose.runOnIdle {
            gate = CashierLockViewModel(application) { now }
            holder.put("gate", gate)
            gate.lock()
            assertFalse(gate.state.value.isLocked) // Enrollment/login has no cashier to end.
            gate.beginSession("1000001", "Synthetic cashier")
            now = 899_999L
            gate.checkTimeout()
            assertFalse(gate.state.value.isLocked)
            now++
            gate.recordActivity()
            assertTrue(gate.state.value.isLocked)
            gate.endSession()
            assertEquals("", gate.state.value.employeeCode)
            gate.beginSession("1000002", "Another synthetic cashier")
            gate.lock()
            assertTrue(gate.state.value.isLocked)
            now++
            gate.recordActivity()
            gate.lock() // Duplicate taps cannot revive or create another session.
            assertTrue(gate.state.value.isLocked)
            gate.endSession()
            assertEquals("", gate.state.value.employeeCode)
            holder.clear()
        }
    }

    private fun screenshot(name: String) {
        // These previews contain only synthetic labels and EMPTY credentials.
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null),
            "auth-design-verification")
        directory.mkdirs()
        File(directory, "$name.png").outputStream().use {
            compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }
}
