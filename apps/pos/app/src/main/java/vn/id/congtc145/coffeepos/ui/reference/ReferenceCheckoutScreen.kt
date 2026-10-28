package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.AlertDialog
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import vn.id.congtc145.coffeepos.domain.encodePaymentQr
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.domain.appendCashDigit
import vn.id.congtc145.coffeepos.domain.appendCashFactor
import vn.id.congtc145.coffeepos.domain.includedVatLabel
import vn.id.congtc145.coffeepos.ui.checkout.CheckoutUiState
import vn.id.congtc145.coffeepos.ui.checkout.CheckoutViewModel
import vn.id.congtc145.coffeepos.ui.checkout.PaymentMethod
import vn.id.congtc145.coffeepos.ui.order.OrderUiState
import vn.id.congtc145.coffeepos.ui.register.RegisterUiState
import androidx.compose.ui.platform.LocalContext

@Composable
fun ReferenceCheckoutScreen(
    viewModel: CheckoutViewModel,
    orderState: OrderUiState,
    registerState: RegisterUiState,
    onOpenRegister: () -> Unit,
    onNavigateBack: () -> Unit,
    onLockCashier: () -> Unit,
    onPaymentSuccess: (String) -> Unit
) {
    val fontScale = LocalDensity.current.fontScale
    CompositionLocalProvider(LocalDensity provides Density(1f, fontScale)) {
        ReferenceCheckoutContent(viewModel, orderState, registerState, onOpenRegister,
            onNavigateBack, onLockCashier, onPaymentSuccess)
    }
}

@Composable
private fun ReferenceCheckoutContent(
    viewModel: CheckoutViewModel,
    orderState: OrderUiState,
    registerState: RegisterUiState,
    onOpenRegister: () -> Unit,
    onNavigateBack: () -> Unit,
    onLockCashier: () -> Unit,
    onPaymentSuccess: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val preview = DesignPreviewMode.isActive(LocalContext.current)
    var showQr by remember { mutableStateOf(false) }
    LaunchedEffect(state.hasPendingOnline) { if (state.hasPendingOnline) showQr = true }
    LaunchedEffect(state.savedReceiptId) { state.savedReceiptId?.let(onPaymentSuccess) }
    Column(Modifier.fillMaxSize().background(ReferenceStyle.paper)) {
        ReferenceTopBar(
            title = "Thanh toán", storeName = orderState.storeAddressSummary,
            cashierName = state.cashierName, isOnline = orderState.isOnline,
            pendingSyncCount = orderState.pendingSyncCount,
            registerSession = registerState.openSession,
            registerLoaded = registerState.isLoaded,
            onRegisterClick = onOpenRegister,
            onLeadingClick = onNavigateBack, onLock = onLockCashier, checkout = true
        )
        Row(Modifier.fillMaxSize().padding(24.dp), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            ReceiptSummary(state, Modifier.width(419.dp).fillMaxHeight())
            Surface(
                shape = RoundedCornerShape(18.dp), color = ReferenceStyle.surface,
                border = BorderStroke(1.dp, ReferenceStyle.line),
                modifier = Modifier.weight(1f).fillMaxHeight()
            ) {
                Column(Modifier.padding(horizontal = 29.dp, vertical = 19.dp)) {
                    Text("Phương thức thanh toán", color = ReferenceStyle.ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(18.dp))
                    PaymentTabs(state.selectedMethod, !state.isSaving && !state.isCompleted,
                        preview || orderState.isOnline != false) { method ->
                        if (state.hasPendingOnline && method == PaymentMethod.CASH) {
                            showQr = true
                        }
                        viewModel.selectPaymentMethod(method)
                    }
                    Spacer(Modifier.height(18.dp))
                    if (!preview && !state.hasPendingOnline && registerState.isLoaded &&
                        registerState.openSession == null) {
                        RegisterRequired(onOpenRegister)
                    } else if (!preview && !registerState.isLoaded) {
                        Text("Đang kiểm tra phiên quỹ…", color = ReferenceStyle.muted)
                    } else if (state.selectedMethod == PaymentMethod.CASH) {
                        CashPayment(state, viewModel::setCashReceived, viewModel::addQuickCash, viewModel::completePayment)
                    } else {
                        QrPayment(state, preview) {
                            showQr = true
                            if (state.hasPendingOnline) {
                                viewModel.checkOnlinePayment()
                            } else {
                                viewModel.beginOnlinePayment()
                            }
                        }
                    }
                    state.errorMessage?.let { error ->
                        Spacer(Modifier.height(8.dp))
                        Text(error, color = ReferenceStyle.danger, fontSize = 13.sp)
                    }
                }
            }
        }
    }
    if (showQr && !state.isCompleted && (state.hasPendingOnline || state.isSaving)) {
        LivePaymentDialog(
            state = state,
            onCheck = viewModel::checkOnlinePayment,
            onCancel = viewModel::cancelOnlinePayment
        )
    }
}

@Composable
internal fun LivePaymentDialog(
    state: CheckoutUiState,
    onCheck: () -> Unit,
    onCancel: () -> Unit
) {
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    val attempt = state.onlineAttempt
    val remaining = ((attempt?.expiresAt ?: now) - now).coerceAtLeast(0) / 1000
    val isFinalUnpaid = attempt?.status == "FINAL_UNPAID"
    val isPaidReconciling = attempt?.status == "PAID_RECONCILING"
    val isExpired = attempt?.expiresAt != null && remaining <= 0
    val payload = attempt?.qrCode?.takeIf { attempt.status == "WAITING" && remaining > 0 }
    val matrix = remember(payload) { payload?.let { runCatching { encodePaymentQr(it) }.getOrNull() } }

    Dialog(onDismissRequest = {}, properties = DialogProperties(
        dismissOnBackPress = false, dismissOnClickOutside = false
    )) {
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White) {
            Column(Modifier.width(460.dp).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Thanh toán ${if (attempt?.provider == "MOMO") "MoMo" else "ZaloPay"}", color = ReferenceStyle.ink, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                Text(money(state.totalAmount), color = ReferenceStyle.teal, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(20.dp))
                if (matrix != null) {
                    Canvas(Modifier.size(260.dp).background(Color.White)) {
                        val cell = kotlin.math.floor(size.width / matrix.width).coerceAtLeast(1f)
                        val inset = (size.width - cell * matrix.width) / 2
                        for (y in 0 until matrix.height) for (x in 0 until matrix.width) {
                            if (matrix[x, y]) drawRect(Color.Black, Offset(inset + x * cell, inset + y * cell), Size(cell, cell))
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("Còn %02d:%02d".format(remaining / 60, remaining % 60), color = ReferenceStyle.muted, fontWeight = FontWeight.Bold)
                } else if (isFinalUnpaid) {
                    Text("QR đã kết thúc, chưa thanh toán.", color = ReferenceStyle.muted, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                } else if (isPaidReconciling) {
                    Text("Đã nhận tiền", color = ReferenceStyle.teal, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Spacer(Modifier.height(6.dp))
                    Text("Đang tải biên lai và đồng bộ kho…", color = ReferenceStyle.muted)
                } else if (isExpired) {
                    Text("Đã hết thời gian hiển thị QR. Giao dịch đang được đối soát.",
                        color = ReferenceStyle.muted, fontSize = 16.sp,
                        modifier = Modifier.testTag("online-payment-display-expired"))
                } else {
                    Text(if (state.isSaving || attempt?.status == "CREATING") "Đang tạo yêu cầu…" else "Đang đối soát với máy chủ",
                        color = ReferenceStyle.ink)
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    when {
                        isFinalUnpaid -> "Có thể chọn phương thức thanh toán khác"
                        isPaidReconciling -> "Không thu thêm tiền cho đơn này"
                        attempt?.provider == "MOMO" -> "Chờ MoMo xác nhận"
                        else -> "Chờ hệ thống xác nhận"
                    },
                    color = ReferenceStyle.teal,
                    fontWeight = FontWeight.Bold
                )
                state.errorMessage?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, color = ReferenceStyle.danger, fontSize = 13.sp)
                }
                if (!state.isCheckingOnline && state.errorMessage == null) state.onlineCheckMessage?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, color = ReferenceStyle.muted, fontSize = 13.sp,
                        modifier = Modifier.testTag("online-payment-check-result"))
                }
                Spacer(Modifier.height(18.dp))
                if (!isFinalUnpaid) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (state.canCancelPendingOnline) OutlinedButton(
                            onClick = onCancel,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = ReferenceStyle.danger),
                            border = BorderStroke(1.dp, ReferenceStyle.danger),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f).height(46.dp).testTag("online-payment-cancel"),
                            enabled = !state.isSaving && !state.isCheckingOnline
                        ) {
                            Text("Hủy thanh toán QR", fontWeight = FontWeight.Bold)
                        }
                        Button(
                            onClick = onCheck,
                            colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f).height(46.dp).testTag("online-payment-check"),
                            enabled = !state.isSaving && !state.isCheckingOnline
                        ) {
                            Text(if (state.isCheckingOnline) "Đang kiểm tra…" else "Kiểm tra trạng thái",
                                color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptSummary(state: CheckoutUiState, modifier: Modifier) {
    Surface(
        shape = RoundedCornerShape(18.dp), color = ReferenceStyle.surface,
        border = BorderStroke(1.dp, ReferenceStyle.line), modifier = modifier
    ) {
        Column(Modifier.fillMaxSize().padding(start = 25.dp, end = 25.dp, top = 17.dp, bottom = 18.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Tóm tắt đơn", color = ReferenceStyle.ink, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                Surface(color = ReferenceStyle.mint, shape = RoundedCornerShape(20.dp)) {
                    Text("${state.cartItems.sumOf { it.quantity }} món", color = ReferenceStyle.teal,
                        fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(if (state.onlineAttempt?.status == "PAID_RECONCILING") "Đã nhận tiền · Đang đồng bộ biên lai"
                else "Chưa thanh toán · Đơn tại quầy", color = ReferenceStyle.muted, fontSize = 13.sp)
            Spacer(Modifier.height(10.dp))
            HorizontalDivider(color = ReferenceStyle.line)
            // Only the item list scrolls. The amount due stays in the same place as the cart grows.
            LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                items(state.cartItems, key = { it.lineId }) { item ->
                    Column(Modifier.fillMaxWidth().padding(vertical = 14.dp)) {
                        Row(Modifier.fillMaxWidth()) {
                            Text("${item.quantity} × ${item.product.name}", color = ReferenceStyle.ink,
                                fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            Text(money(item.totalLinePrice), color = ReferenceStyle.ink,
                                fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(6.dp))
                        val detail = buildList {
                            add("Size ${item.variant.sizeLabel}")
                            item.toppings.forEach { add("${it.quantity} ${it.topping.name.lowercase()}") }
                            if (item.note.isNotBlank()) add(item.note)
                        }.joinToString(" · ")
                        Text(detail, color = ReferenceStyle.muted, fontSize = 12.sp)
                    }
                    HorizontalDivider(color = ReferenceStyle.line)
                }
            }
            Column(Modifier.fillMaxWidth().padding(top = 10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SummaryRow("Tạm tính", money(state.subtotal), true)
                SummaryRow(includedVatLabel(state.cartItems.map { it.product.taxRateBps }),
                    money(state.totalVat), false)
                Row(Modifier.fillMaxWidth().background(ReferenceStyle.mint,
                    RoundedCornerShape(12.dp)).padding(horizontal = 13.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text("Tổng phải thu", color = ReferenceStyle.ink,
                        fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Spacer(Modifier.weight(1f))
                    Text(money(state.totalAmount), color = ReferenceStyle.teal,
                        fontWeight = FontWeight.Bold, fontSize = 24.sp)
                }
            }
        }
    }
}

@Composable
private fun PaymentTabs(
    selected: PaymentMethod, enabled: Boolean, qrEnabled: Boolean,
    onSelect: (PaymentMethod) -> Unit
) {
    Row(Modifier.fillMaxWidth().height(58.dp).background(ReferenceStyle.paper, RoundedCornerShape(12.dp))
        .padding(3.dp)) {
        listOf(PaymentMethod.CASH, PaymentMethod.ZALOPAY_QR, PaymentMethod.MOMO_QR).forEach { method ->
            val active = selected == method
            Row(
                Modifier.weight(1f).fillMaxHeight()
                    .background(if (active) ReferenceStyle.teal else Color.Transparent, RoundedCornerShape(10.dp))
                    .clickable(enabled = enabled && (method == PaymentMethod.CASH || qrEnabled)) { onSelect(method) },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center
            ) {
                Icon(if (method == PaymentMethod.CASH) Icons.Default.Wallet else Icons.Default.QrCode,
                    null, tint = if (active) Color.White else ReferenceStyle.muted, modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(10.dp))
                Text(method.label,
                    color = if (active) Color.White else ReferenceStyle.muted,
                    fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun RegisterRequired(onOpenRegister: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(ReferenceStyle.warning, RoundedCornerShape(13.dp))
            .padding(22.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Chưa mở phiên quỹ", color = ReferenceStyle.ink, fontSize = 18.sp,
            fontWeight = FontWeight.Bold)
        Text("Mở phiên tiền mặt đầu ca trước khi tiếp tục thanh toán. Giỏ hàng vẫn được giữ nguyên.",
            color = ReferenceStyle.muted, fontSize = 14.sp)
        Button(
            onClick = onOpenRegister,
            colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
            shape = RoundedCornerShape(11.dp), modifier = Modifier.fillMaxWidth().height(55.dp)
        ) { Text("Mở phiên quỹ để tiếp tục", fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun CashPayment(
    state: CheckoutUiState,
    onAmount: (Long) -> Unit,
    onAddCash: (Long) -> Unit,
    onConfirm: () -> Unit
) {
    var typing by remember { mutableStateOf(false) }
    Text("Số tiền khách đưa", color = ReferenceStyle.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(10.dp))
    Surface(shape = RoundedCornerShape(12.dp), color = ReferenceStyle.surface,
        border = BorderStroke(2.dp, ReferenceStyle.teal), modifier = Modifier.fillMaxWidth().height(69.dp)) {
        Row(Modifier.padding(horizontal = 21.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(money(state.cashReceived).removeSuffix(" đ"), color = ReferenceStyle.ink,
                fontSize = 29.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text("đ", color = ReferenceStyle.muted, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
    }
    Spacer(Modifier.height(12.dp))
    Text("Chọn nhanh (cộng dồn mệnh giá)", color = ReferenceStyle.muted, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(8.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        listOf(10_000L, 20_000L, 50_000L, 100_000L, 200_000L, 500_000L).forEach { amount ->
            Surface(
                color = ReferenceStyle.paper,
                shape = RoundedCornerShape(10.dp),
                border = BorderStroke(1.dp, ReferenceStyle.line),
                modifier = Modifier.weight(1f).height(46.dp).clickable(enabled = state.canEdit) {
                    typing = false
                    onAddCash(amount)
                }
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("+${money(amount).removeSuffix(" đ")}",
                        color = ReferenceStyle.ink,
                        fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        Column(Modifier.width(312.dp)) {
            val numRows = listOf(
                listOf("1", "2", "3"),
                listOf("4", "5", "6"),
                listOf("7", "8", "9"),
                listOf(".00", "0", ".000")
            )
            numRows.forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    row.forEach { label ->
                        Surface(
                            color = ReferenceStyle.paper,
                            border = BorderStroke(1.dp, ReferenceStyle.line), shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f).height(45.dp).clickable(enabled = state.canEdit) {
                                when (label) {
                                    ".00" -> {
                                        val base = if (typing) state.cashReceived else 0L
                                        if (base > 0L) {
                                            onAmount(appendCashFactor(base, 100L))
                                            typing = true
                                        }
                                    }
                                    ".000" -> {
                                        val base = if (typing) state.cashReceived else 0L
                                        if (base > 0L) {
                                            onAmount(appendCashFactor(base, 1000L))
                                            typing = true
                                        }
                                    }
                                    "0" -> {
                                        if (typing) {
                                            onAmount(appendCashDigit(state.cashReceived, 0))
                                        } else {
                                            onAmount(0L)
                                            typing = true
                                        }
                                    }
                                    else -> {
                                        val base = if (typing) state.cashReceived else 0L
                                        onAmount(appendCashDigit(base, label.toInt()))
                                        typing = true
                                    }
                                }
                            }
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(label, color = ReferenceStyle.ink,
                                    fontSize = if (label.startsWith(".")) 14.sp else 17.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(7.dp))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Surface(
                    color = ReferenceStyle.paper,
                    border = BorderStroke(1.dp, ReferenceStyle.line), shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(1f).height(45.dp).clickable(enabled = state.canEdit) {
                        typing = false
                        onAmount(0L)
                    }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("Xóa", color = ReferenceStyle.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Surface(
                    color = ReferenceStyle.mint,
                    border = BorderStroke(1.dp, ReferenceStyle.teal), shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.weight(2f).height(45.dp).clickable(enabled = state.canEdit) {
                        typing = false
                        onAmount(state.totalAmount)
                    }
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text("Nhận đủ", color = ReferenceStyle.teal, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("Kiểm tra tiền nhận và tiền thối trước khi xác nhận.", color = ReferenceStyle.muted, fontSize = 12.sp)
        }
        Column(Modifier.weight(1f)) {
            Column(Modifier.fillMaxWidth().height(210.dp).background(ReferenceStyle.paper, RoundedCornerShape(13.dp)).padding(18.dp)) {
                Text("ĐỐI SOÁT TIỀN MẶT", color = ReferenceStyle.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(14.dp))
                SummaryRow("Cần thu", money(state.totalAmount), true)
                Spacer(Modifier.height(14.dp))
                SummaryRow("Khách đưa", money(state.cashReceived), true)
                Spacer(Modifier.height(20.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Spacer(Modifier.height(7.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Tiền thối", color = ReferenceStyle.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Text(money(state.changeAmount), color = ReferenceStyle.teal, fontSize = 27.sp, fontWeight = FontWeight.Bold)
                }
            }
            state.errorMessage?.let { error ->
                Text(error, color = ReferenceStyle.danger, fontSize = 12.sp, maxLines = 2)
                Spacer(Modifier.height(8.dp))
            }
            Button(onClick = onConfirm, enabled = state.isCashSufficient && state.canEdit && state.cartItems.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(66.dp)) {
                Icon(Icons.Default.Check, null)
                Spacer(Modifier.width(10.dp))
                Text(if (state.isSaving) "Đang lưu giao dịch…" else "Xác nhận đã nhận tiền", fontWeight = FontWeight.Bold, fontSize = 17.sp)
            }
        }
    }
}

@Composable
private fun ColumnScope.QrPayment(state: CheckoutUiState, preview: Boolean, onConfirm: () -> Unit) {
    if (!preview) {
        Column(Modifier.fillMaxWidth().weight(1f),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.QrCode, null, tint = ReferenceStyle.teal, modifier = Modifier.size(54.dp))
            Spacer(Modifier.height(12.dp))
            Text("Thanh toán QR / Chuyển khoản", color = ReferenceStyle.ink, fontWeight = FontWeight.Bold, fontSize = 21.sp)
            Spacer(Modifier.height(6.dp))
            Text("Chọn cổng thanh toán điện tử", color = ReferenceStyle.muted, fontSize = 13.sp)
            Spacer(Modifier.height(16.dp))

            Spacer(Modifier.height(18.dp))
            Text("Tổng tiền cần thanh toán", color = ReferenceStyle.muted, fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
            Text(money(state.totalAmount), color = ReferenceStyle.teal, fontWeight = FontWeight.Bold, fontSize = 30.sp)
            Spacer(Modifier.height(20.dp))
            Button(onClick = onConfirm, enabled = state.canEdit || state.hasPendingOnline,
                colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.height(52.dp).padding(horizontal = 20.dp)) {
                Text(if (state.hasPendingOnline) "Mở giao dịch đang chờ" else "Tạo QR ${if (state.selectedMethod == PaymentMethod.MOMO_QR) "MoMo" else "ZaloPay"}",
                    fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
        return
    }
    Row(
        Modifier.fillMaxWidth().height(48.dp).background(ReferenceStyle.info, RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically
    ) {
        Text("●  ${if (preview) "Đang chờ khách thanh toán" else "Chưa tạo yêu cầu thanh toán"}",
            color = Color(0xFF225B8D), fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        Text(if (preview) "Mẫu · 04:59" else "Chỉ trực tuyến", color = Color(0xFF225B8D), fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
    Spacer(Modifier.height(20.dp))
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        Spacer(Modifier.width(73.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            DecorativeQr()
            Spacer(Modifier.height(23.dp))
            Text("Mã QR minh họa · không quét", color = ReferenceStyle.muted, fontSize = 12.sp)
        }
        Spacer(Modifier.width(40.dp))
        Column(Modifier.weight(1f)) {
            Spacer(Modifier.height(15.dp))
            Text("Quét bằng ${if (state.selectedMethod == PaymentMethod.MOMO_QR) "MoMo" else "ZaloPay"}", color = ReferenceStyle.ink, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(17.dp))
            Text("Số tiền thanh toán", color = ReferenceStyle.muted, fontSize = 13.sp)
            Spacer(Modifier.height(4.dp))
            Text(money(state.totalAmount), color = ReferenceStyle.teal, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(22.dp))
            HorizontalDivider(color = ReferenceStyle.line)
            Spacer(Modifier.height(16.dp))
            Text("◷  Chờ hệ thống xác nhận", color = ReferenceStyle.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(11.dp))
            Text("Chỉ hoàn tất đơn khi trạng thái thanh toán được xác nhận thành công.",
                color = ReferenceStyle.muted, fontSize = 12.sp, lineHeight = 18.sp)
            Spacer(Modifier.height(31.dp))
            OutlinedButton(onClick = {}, enabled = false, shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, ReferenceStyle.line), modifier = Modifier.width(210.dp).height(49.dp)) {
                Text("Kiểm tra trạng thái", color = ReferenceStyle.teal, fontWeight = FontWeight.Bold)
            }
        }
    }
    Spacer(Modifier.weight(1f))
    Row(Modifier.fillMaxWidth().height(88.dp).background(ReferenceStyle.paper, RoundedCornerShape(13.dp))
        .padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Info, null, tint = ReferenceStyle.teal, modifier = Modifier.size(19.dp))
        Spacer(Modifier.width(12.dp))
        Column {
            Text("Giao dịch chưa xác nhận", color = ReferenceStyle.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Giữ nguyên đơn; không tạo biên lai ở bước này.", color = ReferenceStyle.muted, fontSize = 12.sp)
        }
        Spacer(Modifier.weight(1f))
        Surface(color = Color(0xFFEDF1EF), shape = RoundedCornerShape(12.dp)) {
            Text("Chờ thanh toán", color = ReferenceStyle.muted, fontWeight = FontWeight.Bold,
                fontSize = 13.sp, modifier = Modifier.padding(horizontal = 27.dp, vertical = 17.dp))
        }
    }
}

/** Intentionally non-scannable preview graphic. Never display it as a payment instrument. */
@Composable
private fun DecorativeQr() {
    Surface(shape = RoundedCornerShape(10.dp), color = Color.White,
        border = BorderStroke(1.dp, ReferenceStyle.line), modifier = Modifier.size(202.dp)) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(178.dp)) {
            val cells = 25
            val side = size.width / cells
            for (y in 0 until cells) for (x in 0 until cells) {
                val marker = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17)
                val center = x in 9..15 && y in 9..15
                val black = if (marker) {
                    val ox = if (x > 17) x - 18 else x
                    val oy = if (y > 17) y - 18 else y
                    ox == 0 || ox == 6 || oy == 0 || oy == 6 || (ox in 2..4 && oy in 2..4)
                } else !center && ((x * 17 + y * 31 + x * y * 7) % 11 < 5)
                if (black) drawRect(ReferenceStyle.ink, Offset(x * side, y * side), Size(side, side))
            }
        }
        Text("MẪU", color = ReferenceStyle.teal, fontWeight = FontWeight.Black, fontSize = 12.sp,
            modifier = Modifier.background(Color.White).padding(5.dp))
    }
    }
}
