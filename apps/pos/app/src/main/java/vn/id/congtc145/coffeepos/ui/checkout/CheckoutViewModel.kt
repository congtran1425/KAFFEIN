package vn.id.congtc145.coffeepos.ui.checkout

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.CashSaleRepository
import vn.id.congtc145.coffeepos.data.local.OnlinePaymentRepository
import vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.data.sync.SyncOutboxScheduler
import vn.id.congtc145.coffeepos.domain.cashCheckoutValidationError
import vn.id.congtc145.coffeepos.domain.OnlinePaymentPoller
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import java.time.LocalDate
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

enum class PaymentMethod(val label: String) {
    CASH("Tiền mặt"),
    ZALOPAY_QR("ZaloPay"),
    MOMO_QR("MoMo")
}

private fun String.toPaymentMethod() = if (this == "MOMO") PaymentMethod.MOMO_QR else PaymentMethod.ZALOPAY_QR

data class CheckoutUiState(
    val cartItems: List<OrderLineItem> = emptyList(),
    val subtotal: Long = 0L,
    val totalVat: Long = 0L,
    val totalAmount: Long = 0L,
    val cashierName: String = "",
    val cashierCode: String = "",
    val selectedMethod: PaymentMethod = PaymentMethod.CASH,
    val cashReceived: Long = 0L,
    val isSaving: Boolean = false,
    val isCheckingOnline: Boolean = false,
    val savedReceiptId: String? = null,
    val errorMessage: String? = null,
    val onlineCheckMessage: String? = null,
    val onlineAttempt: OnlinePaymentAttemptEntity? = null
) {
    val changeAmount: Long get() = if (cashReceived > totalAmount) cashReceived - totalAmount else 0L
    val isCashSufficient: Boolean get() = cashReceived >= totalAmount
    val isCompleted: Boolean get() = savedReceiptId != null
    val hasPendingOnline: Boolean get() = onlineAttempt?.status?.let { it !in setOf("PAID", "FINAL_UNPAID", "CANCELLED") } == true
    // Only the authoritative server response releases a pending checkout.
    val canCancelPendingOnline: Boolean get() = hasPendingOnline &&
        onlineAttempt?.status != "PAID_RECONCILING"
    val canEdit: Boolean get() = !isSaving && !isCheckingOnline && !isCompleted && !hasPendingOnline

    fun withPaymentMethod(method: PaymentMethod): CheckoutUiState {
        if (hasPendingOnline && method != onlineAttempt?.provider?.toPaymentMethod()) {
            return copy(errorMessage = if (onlineAttempt?.status == "PAID_RECONCILING")
                "Đơn đã nhận tiền. Chờ đồng bộ biên lai, không thu thêm tiền."
                else "Chờ hệ thống xác nhận QR kết thúc trước khi chuyển sang tiền mặt.")
        }
        return if (canEdit) copy(selectedMethod = method, errorMessage = null) else this
    }

    fun withCashReceived(amount: Long): CheckoutUiState =
        if (canEdit) copy(cashReceived = amount.coerceAtLeast(0), errorMessage = null) else this

    fun withAddedCash(amount: Long): CheckoutUiState {
        if (!canEdit) return this
        if (amount < 0 || amount > Long.MAX_VALUE - cashReceived) {
            return copy(errorMessage = "Số tiền khách đưa vượt giới hạn xử lý.")
        }
        return withCashReceived(cashReceived + amount)
    }
}

class CheckoutViewModel(application: Application) : AndroidViewModel(application) {
    private val database = AppDatabase.getDatabase(application)
    private val registerDao = database.registerSessionDao()
    private val credentialStore = DeviceCredentialStore(application)

    private val _uiState = MutableStateFlow(CheckoutUiState())
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()
    private val onlinePayments = OnlinePaymentRepository(database)
    private var recoveringSaleId: String? = null
    private val onlineActionMutex = Mutex()
    private val onlinePoller = OnlinePaymentPoller(viewModelScope,
        canPoll = { DeviceAccessState.block.value == null },
        hasUnresolved = { database.onlinePaymentDao().getUnresolved() != null },
        reconcile = { manual -> onlineActionMutex.withLock { runOnlineAction(manual = manual) } })

    init {
        if (!DesignPreviewMode.isActive(application)) viewModelScope.launch {
            database.onlinePaymentDao().observeLatest().collect { attempt ->
                if (attempt == null) return@collect
                publishOnlineAttempt(attempt)
                if (attempt.status !in setOf("PAID", "FINAL_UNPAID", "CANCELLED")) {
                    resumeOnlinePayment()
                }
            }
        }
    }

    private fun publishOnlineAttempt(attempt: OnlinePaymentAttemptEntity) {
        if (attempt.status !in setOf("PAID", "FINAL_UNPAID", "CANCELLED")) {
            recoveringSaleId = attempt.saleId
            val items = OrderJsonSerializer.deserializeOrderItemsStrict(attempt.itemsJson)
            _uiState.update { it.copy(cartItems = items, subtotal = attempt.totalVnd,
                totalAmount = attempt.totalVnd, totalVat = items.sumOf { line ->
                    vn.id.congtc145.coffeepos.domain.calculateInclusiveVat(line.totalLinePrice, line.product.taxRateBps)
                }, cashierCode = attempt.cashierCode, cashierName = attempt.cashierName,
                selectedMethod = attempt.provider.toPaymentMethod(), onlineAttempt = attempt, isSaving = false) }
        } else if (recoveringSaleId == attempt.saleId) {
            // A historical PAID row on startup must not clear today's cart or
            // reopen an old receipt. Only finish the attempt we are recovering.
            _uiState.update { it.copy(onlineAttempt = attempt, isSaving = false,
                selectedMethod = if (attempt.status == "FINAL_UNPAID") PaymentMethod.CASH else it.selectedMethod,
                savedReceiptId = if (attempt.status == "PAID") attempt.saleId else null,
                errorMessage = if (attempt.status == "FINAL_UNPAID") "QR đã kết thúc và chưa thanh toán. Có thể chọn phương thức khác." else null) }
        }
    }

    fun beginZaloPay() = beginOnlinePayment()

    fun beginOnlinePayment() {
        if (DesignPreviewMode.isActive(getApplication())) return
        val state = _uiState.value
        val provider = when (state.selectedMethod) {
            PaymentMethod.ZALOPAY_QR -> "ZALOPAY"
            PaymentMethod.MOMO_QR -> "MOMO"
            PaymentMethod.CASH -> return
        }
        if (!state.canEdit) return
        cashCheckoutValidationError(state.cartItems, state.subtotal, state.totalVat, state.totalAmount, state.totalAmount)?.let {
            _uiState.update { current -> current.copy(errorMessage = it) }; return
        }
        _uiState.update { it.copy(isSaving = true, errorMessage = null, onlineCheckMessage = null, onlineAttempt = null) }
        viewModelScope.launch {
            try {
                val session = credentialStore.load() ?: error("Thiết bị chưa được kích hoạt.")
                onlinePayments.prepare(session, state.cartItems, state.totalAmount, state.cashierCode, state.cashierName, provider)
                resumeOnlinePayment()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) { _uiState.update { it.copy(isSaving = false, errorMessage = error.message ?: "Không thể tạo QR.") } }
        }
    }

    fun cancelOnlinePayment() {
        if (DesignPreviewMode.isActive(getApplication())) return
        val state = _uiState.value
        val attempt = state.onlineAttempt ?: return
        if (state.isCheckingOnline || attempt.status in setOf("PAID", "PAID_RECONCILING", "FINAL_UNPAID", "CANCELLED")) return
        _uiState.update { it.copy(isCheckingOnline = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                onlineActionMutex.withLock { runOnlineAction(cancel = true) }
            } finally {
                _uiState.update { it.copy(isCheckingOnline = false) }
                // A cancel response can race with settlement; keep reconciling.
                onlinePoller.checkNow()
            }
        }
    }

    fun checkOnlinePayment() {
        if (DesignPreviewMode.isActive(getApplication())) return
        if (_uiState.value.isCheckingOnline || !_uiState.value.hasPendingOnline) return
        _uiState.update { it.copy(isCheckingOnline = true, errorMessage = null, onlineCheckMessage = null) }
        viewModelScope.launch {
            try {
                onlinePoller.checkNow().await()
                _uiState.update { current ->
                    if (!current.hasPendingOnline || current.errorMessage != null) current
                    else {
                        val time = DateTimeFormatter.ofPattern("HH:mm:ss")
                            .withZone(ZoneId.of("Asia/Ho_Chi_Minh")).format(Instant.now())
                        current.copy(onlineCheckMessage = if (current.onlineAttempt?.status == "PAID_RECONCILING")
                            "$time · Đã nhận tiền, đang đồng bộ biên lai."
                        else "$time · Máy chủ chưa có xác nhận thanh toán.")
                    }
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                _uiState.update { it.copy(errorMessage = error.message ?: "Không thể kiểm tra trạng thái. Hãy thử lại.") }
            } finally {
                _uiState.update { it.copy(isCheckingOnline = false) }
            }
        }
    }

    private suspend fun runOnlineAction(cancel: Boolean = false, manual: Boolean = false) {
        val attempt = database.onlinePaymentDao().getUnresolved() ?: return
        try {
            val session = credentialStore.load() ?: error("Thiết bị chưa được kích hoạt.")
            if (cancel) onlinePayments.cancel(session, attempt) else onlinePayments.reconcile(session, attempt, refresh = manual)
            _uiState.update { it.copy(errorMessage = null) }
            database.onlinePaymentDao().get(attempt.saleId)?.let(::publishOnlineAttempt)
            if (cancel && _uiState.value.hasPendingOnline) {
                _uiState.update { it.copy(errorMessage = "QR chưa kết thúc. Giữ nguyên giỏ và chờ đối soát, không thu thêm tiền.") }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) {
            _uiState.update { it.copy(isSaving = false, onlineCheckMessage = null,
                errorMessage = error.message ?: "Đang chờ đối soát thanh toán.") }
        }
    }

    fun resumeOnlinePayment() {
        onlinePoller.resume()
    }

    fun initCheckout(
        items: List<OrderLineItem>,
        subtotal: Long,
        vat: Long,
        total: Long,
        cashierName: String,
        cashierCode: String
    ) {
        if (_uiState.value.isSaving || _uiState.value.hasPendingOnline) return
        recoveringSaleId = null
        _uiState.value = CheckoutUiState(
            cartItems = items,
            subtotal = subtotal,
            totalVat = vat,
            totalAmount = total,
            cashierName = cashierName,
            cashierCode = cashierCode,
            cashReceived = 0L
        )
    }

    fun selectPaymentMethod(method: PaymentMethod) {
        _uiState.update { it.withPaymentMethod(method) }
    }

    fun setCashReceived(amount: Long) {
        _uiState.update { it.withCashReceived(amount) }
    }

    fun addQuickCash(amount: Long) {
        _uiState.update { it.withAddedCash(amount) }
    }

    fun completePayment() {
        if (DesignPreviewMode.isActive(getApplication())) {
            _uiState.update { it.copy(errorMessage = "Chế độ xem trước: không thể tạo giao dịch.") }
            return
        }
        val state = _uiState.value
        if (!state.canEdit) return
        if (state.selectedMethod != PaymentMethod.CASH) {
            _uiState.update { it.copy(errorMessage = "ZaloPay chỉ mở khi adapter Sandbox được cấu hình và xác nhận online.") }
            return
        }
        cashCheckoutValidationError(state.cartItems, state.subtotal, state.totalVat,
            state.totalAmount, state.cashReceived)?.let { message ->
            _uiState.update { it.copy(errorMessage = message) }
            return
        }
        if (state.cartItems.any { item ->
                item.variant.id.isBlank() || !item.variant.id.all(Char::isDigit) ||
                    item.product.id.isBlank() || !item.product.id.all(Char::isDigit) ||
                    item.toppings.any { it.topping.id.isBlank() || !it.topping.id.all(Char::isDigit) }
            }) {
            _uiState.update {
                it.copy(errorMessage = "Đơn có mã món cũ từ dữ liệu mẫu. Hãy đồng bộ thực đơn và tạo lại đơn.")
            }
            return
        }

        _uiState.update { it.copy(isSaving = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                check(database.catalogDao().getSyncState()?.hasBootstrap == true) {
                    "Cần đồng bộ dữ liệu chi nhánh lần đầu trước khi bán hàng."
                }
                val session = credentialStore.load()
                    ?: error("Thiết bị chưa được kích hoạt.")
                val register = registerDao.getOpenSession()
                    ?: error("Phải mở phiên tiền mặt trước khi hoàn tất cash sale.")
                val saleId = UUID.randomUUID().toString()
                val operationId = UUID.randomUUID().toString()
                val now = System.currentTimeMillis()
                val businessDate = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh"))
                    .format(DateTimeFormatter.BASIC_ISO_DATE)
                val saleNumber = "${businessDate}-${saleId.take(8).uppercase()}"
                val itemsJson = OrderJsonSerializer.serializeOrderItems(state.cartItems)

                val sale = SaleEntity(
                    id = saleId,
                    saleNumber = saleNumber,
                    storeId = session.storeId,
                    storeName = session.storeName,
                    cashierCode = state.cashierCode,
                    cashierName = state.cashierName,
                    registerSessionId = register.id,
                    itemsJson = itemsJson,
                    subtotalVnd = state.totalAmount - state.totalVat,
                    taxVnd = state.totalVat,
                    totalVnd = state.totalAmount,
                    paymentMethod = "CASH",
                    cashReceivedVnd = state.cashReceived,
                    changeVnd = state.changeAmount,
                    completedAt = now
                )
                CashSaleRepository(database).complete(sale, state.cartItems, operationId)
                saleId
            }.onSuccess { saleId ->
                _uiState.update { it.copy(isSaving = false, savedReceiptId = saleId) }
                SyncOutboxScheduler.enqueueNow(getApplication())
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errorMessage = error.message ?: "Không thể lưu giao dịch."
                    )
                }
            }
        }
    }
}
