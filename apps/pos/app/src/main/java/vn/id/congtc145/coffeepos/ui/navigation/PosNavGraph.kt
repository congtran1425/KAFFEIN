package vn.id.congtc145.coffeepos.ui.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.activity.compose.BackHandler
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.ui.enrollment.DeviceAccessBlockedScreen
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.material3.Text
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.navArgument
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.currentBackStackEntryAsState
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.ui.attendance.AttendanceScreen
import vn.id.congtc145.coffeepos.ui.attendance.AttendanceViewModel
import vn.id.congtc145.coffeepos.ui.checkout.CheckoutViewModel
import vn.id.congtc145.coffeepos.ui.enrollment.EnrollmentScreen
import vn.id.congtc145.coffeepos.ui.enrollment.EnrollmentViewModel
import vn.id.congtc145.coffeepos.ui.login.LoginScreen
import vn.id.congtc145.coffeepos.ui.login.LoginViewModel
import vn.id.congtc145.coffeepos.ui.login.CashierLockViewModel
import vn.id.congtc145.coffeepos.ui.inventory.InventoryScreen
import vn.id.congtc145.coffeepos.ui.sync.SyncOutboxScreen
import vn.id.congtc145.coffeepos.ui.menu.TaskDashboardScreen
import vn.id.congtc145.coffeepos.ui.order.OrderViewModel
import vn.id.congtc145.coffeepos.ui.reference.ReferenceOrderScreen
import vn.id.congtc145.coffeepos.ui.reference.ReferenceCheckoutScreen
import vn.id.congtc145.coffeepos.ui.receipt.ReceiptHistoryScreen
import vn.id.congtc145.coffeepos.ui.receipt.ReceiptScreen
import vn.id.congtc145.coffeepos.ui.register.RegisterScreen
import vn.id.congtc145.coffeepos.ui.register.RegisterViewModel

object PosDestinations {
    const val ENROLLMENT = "enrollment"
    const val LOGIN = "login"
    const val ORDER = "order"
    const val MENU = "menu"
    const val ATTENDANCE = "attendance"
    const val CHECKOUT = "checkout"
    const val REGISTER = "register"
    const val RECEIPT_HISTORY = "receipt-history"
    const val RECEIPT = "receipt"
    const val SYNC_OUTBOX = "sync-outbox"
    const val INVENTORY = "inventory"
}

@Composable
fun PosNavGraph(
    navController: NavHostController = rememberNavController(),
    loginViewModel: LoginViewModel = viewModel(),
    orderViewModel: OrderViewModel = viewModel(),
    checkoutViewModel: CheckoutViewModel = viewModel(),
    attendanceViewModel: AttendanceViewModel = viewModel(),
    enrollmentViewModel: EnrollmentViewModel = viewModel(),
    registerViewModel: RegisterViewModel = viewModel(),
    cashierLockViewModel: CashierLockViewModel = viewModel()
) {
    val designPreview = DesignPreviewMode.isActive(androidx.compose.ui.platform.LocalContext.current)
    val context = androidx.compose.ui.platform.LocalContext.current
    val device = remember { DeviceCredentialStore(context).load() }
    val deviceBlock by DeviceAccessState.block.collectAsState()
    if (!designPreview && deviceBlock != null) {
        val pending by remember { AppDatabase.getDatabase(context).salesDao().observePendingOutboxCount() }.collectAsState(initial = -1)
        LaunchedEffect(deviceBlock) {
            loginViewModel.leaveScreen()
            attendanceViewModel.leaveScreen()
            cashierLockViewModel.endSession()
        }
        BackHandler { /* Never reveal the previous selling destination. */ }
        DeviceAccessBlockedScreen(deviceBlock!!, device?.storeName.orEmpty(), pending)
        return
    }
    val lockState by cashierLockViewModel.state.collectAsState()
    val checkoutState by checkoutViewModel.uiState.collectAsState()
    val registerState by registerViewModel.uiState.collectAsState()
    val currentEntry by navController.currentBackStackEntryAsState()
    // Observe completion outside the checkout destination: its composition may
    // have been removed by timeout while the paid-sale transaction was in flight.
    LaunchedEffect(checkoutState.savedReceiptId) {
        if (checkoutState.savedReceiptId != null) {
            orderViewModel.clearCartAfterPayment(checkoutState.cartItems.map { it.lineId }.toSet())
        }
    }
    CashierSessionRedirect(!designPreview && lockState.isLocked, navController) {
        loginViewModel.leaveScreen()
        attendanceViewModel.leaveScreen()
        orderViewModel.setCashier("", "")
        registerViewModel.setCashier("", "")
        cashierLockViewModel.endSession()
    }
    Box {
    NavHost(
        navController = navController,
        startDestination = if (designPreview) {
            PosDestinations.ORDER
        } else if (enrollmentViewModel.isEnrolled()) {
            PosDestinations.LOGIN
        } else {
            PosDestinations.ENROLLMENT
        }
    ) {
        composable(PosDestinations.ENROLLMENT) {
            EnrollmentScreen(
                viewModel = enrollmentViewModel,
                onEnrollmentSuccess = {
                    loginViewModel.refreshDeviceIdentity()
                    navController.navigate(PosDestinations.LOGIN) {
                        popUpTo(PosDestinations.ENROLLMENT) { inclusive = true }
                    }
                }
            )
        }

        // 0. Màn hình Đăng nhập Thu ngân mở ca bán hàng
        composable(PosDestinations.LOGIN) {
            LoginScreen(
                viewModel = loginViewModel,
                onLoginSuccess = { cashierName, cashierCode ->
                    cashierLockViewModel.beginSession(cashierCode, cashierName)
                    orderViewModel.setCashier(cashierName, cashierCode)
                    registerViewModel.setCashier(cashierCode, cashierName)
                    registerViewModel.receiveHandover { received ->
                        navController.navigate(if (received) PosDestinations.ORDER else PosDestinations.REGISTER) {
                            popUpTo(PosDestinations.LOGIN) { inclusive = true }
                        }
                    }
                },
                onNavigateToAttendance = {
                    navController.navigate(PosDestinations.ATTENDANCE)
                }
            )
        }

        // 1. Màn hình Tạo đơn / Bán hàng
        composable(PosDestinations.ORDER) {
            ReferenceOrderScreen(
                viewModel = orderViewModel,
                registerState = registerState,
                onOpenRegister = { navController.navigate(PosDestinations.REGISTER) },
                onNavigateToCheckout = {
                    val state = orderViewModel.uiState.value
                    checkoutViewModel.initCheckout(
                        items = state.cartItems,
                        subtotal = state.subtotal,
                        vat = state.totalVat,
                        total = state.totalAmount,
                        cashierName = state.cashierName,
                        cashierCode = state.cashierCode
                    )
                    navController.navigate(PosDestinations.CHECKOUT)
                },
                onNavigateToMenu = {
                    navController.navigate(PosDestinations.MENU)
                },
                onLockCashier = if (designPreview) ({}) else cashierLockViewModel::lock
            )
        }

        // 2. Màn hình tác vụ
        composable(PosDestinations.MENU) {
            TaskDashboardScreen(
                orderState = orderViewModel.uiState.collectAsState().value,
                registerState = registerState,
                onBack = {
                    navController.popBackStack()
                },
                onHeldOrders = {
                    orderViewModel.openHeldOrdersDialog()
                    navController.popBackStack()
                },
                onAttendance = {
                    navController.navigate(PosDestinations.ATTENDANCE)
                },
                onRegister = {
                    navController.navigate(PosDestinations.REGISTER)
                },
                onShiftHandover = {
                    navController.navigate("${PosDestinations.REGISTER}/HANDOVER")
                },
                onEndOfDay = {
                    navController.navigate("${PosDestinations.REGISTER}/END_OF_DAY")
                },
                onReceiptHistory = {
                    navController.navigate(PosDestinations.RECEIPT_HISTORY)
                },
                onSync = {
                    navController.navigate(PosDestinations.SYNC_OUTBOX)
                },
                onInventory = {
                    navController.navigate(PosDestinations.INVENTORY)
                },
                onLockCashier = if (designPreview) ({}) else cashierLockViewModel::lock
            )
        }

        // 3. Màn hình Điểm danh & Chấm công
        composable(PosDestinations.ATTENDANCE) {
            AttendanceScreen(
                viewModel = attendanceViewModel,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        // 4. Màn hình Thanh toán
        composable(PosDestinations.CHECKOUT) {
            ReferenceCheckoutScreen(
                viewModel = checkoutViewModel,
                orderState = orderViewModel.uiState.collectAsState().value,
                registerState = registerState,
                onOpenRegister = { navController.navigate(PosDestinations.REGISTER) },
                onNavigateBack = {
                    navController.popBackStack()
                },
                onLockCashier = if (designPreview) ({}) else cashierLockViewModel::lock,
                onPaymentSuccess = { receiptId ->
                    // A completed Room transaction survives expiry, but must never
                    // navigate over login if its UI callback arrives after timeout.
                    val currentCashier = cashierLockViewModel.state.value
                    if (designPreview || (currentCashier.employeeCode.isNotBlank() && !currentCashier.isLocked)) {
                        navController.navigate("${PosDestinations.RECEIPT}/$receiptId") {
                            popUpTo(PosDestinations.CHECKOUT) { inclusive = true }
                        }
                    }
                }
            )
        }

        composable(PosDestinations.REGISTER) {
            RegisterScreen(
                viewModel = registerViewModel,
                mode = "DEFAULT",
                onBack = { navController.popBackStack() },
                onHandoverComplete = {
                    if (designPreview) {
                        navController.popBackStack()
                    } else {
                        cashierLockViewModel.lock()
                        navController.navigate(PosDestinations.LOGIN) {
                            popUpTo(PosDestinations.ORDER) { inclusive = true }
                        }
                    }
                }
            )
        }

        composable(
            "${PosDestinations.REGISTER}/{mode}",
            arguments = listOf(navArgument("mode") {
                type = NavType.StringType
                defaultValue = "DEFAULT"
            })
        ) { backStackEntry ->
            val mode = backStackEntry.arguments?.getString("mode") ?: "DEFAULT"
            RegisterScreen(
                viewModel = registerViewModel,
                mode = mode,
                onBack = { navController.popBackStack() },
                onHandoverComplete = {
                    if (designPreview) {
                        navController.popBackStack()
                    } else {
                        cashierLockViewModel.lock()
                        navController.navigate(PosDestinations.LOGIN) {
                            popUpTo(PosDestinations.ORDER) { inclusive = true }
                        }
                    }
                }
            )
        }

        composable(PosDestinations.SYNC_OUTBOX) {
            SyncOutboxScreen(onBack = { navController.popBackStack() })
        }
        composable(PosDestinations.INVENTORY) {
            InventoryScreen(
                onBack = { navController.popBackStack() },
                onOpenSync = { navController.navigate(PosDestinations.SYNC_OUTBOX) }
            )
        }

        composable(
            "${PosDestinations.RECEIPT_HISTORY}?selectedReceiptId={selectedReceiptId}",
            arguments = listOf(navArgument("selectedReceiptId") {
                type = NavType.StringType
                defaultValue = ""
            })
        ) { entry ->
            ReceiptHistoryScreen(
                onOpenReceipt = { receiptId ->
                    navController.navigate("${PosDestinations.RECEIPT}/${Uri.encode(receiptId)}?source=history")
                },
                onBack = { navController.popBackStack() },
                initialSelectedReceiptId = entry.arguments?.getString("selectedReceiptId")
            )
        }

        composable(
            "${PosDestinations.RECEIPT}/{receiptId}?source={source}",
            arguments = listOf(navArgument("source") {
                type = NavType.StringType
                defaultValue = "payment"
            })
        ) { entry ->
            val receiptId = entry.arguments?.getString("receiptId").orEmpty()
            ReceiptScreen(
                receiptId = receiptId,
                onNewOrder = {
                    navController.navigate(PosDestinations.ORDER) {
                        popUpTo(PosDestinations.ORDER) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() },
                onOpenHistory = { selectedId ->
                    navController.navigate("${PosDestinations.RECEIPT_HISTORY}?selectedReceiptId=${Uri.encode(selectedId)}")
                },
                fromHistory = entry.arguments?.getString("source") == "history"
            )
        }
    }
    if (designPreview && currentEntry?.destination?.route !in setOf(PosDestinations.ORDER, PosDestinations.CHECKOUT)) {
        Text(
            text = "XEM TRƯỚC GIAO DIỆN · Không lưu giao dịch",
            color = Color.White,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .background(Color(0xFF6B3700))
                .padding(horizontal = 12.dp, vertical = 5.dp)
        )
    }
    }
}
