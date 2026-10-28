package vn.id.congtc145.coffeepos.ui.order

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.withTransaction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.DraftOrderEntity
import vn.id.congtc145.coffeepos.data.local.entity.ActiveCartEntity
import vn.id.congtc145.coffeepos.data.local.entity.DraftCodeSequenceEntity
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.data.sync.CatalogSyncRepository
import vn.id.congtc145.coffeepos.data.sync.DeviceHeartbeatCoordinator
import vn.id.congtc145.coffeepos.domain.calculateInclusiveVat
import java.util.UUID

data class OrderUiState(
    val categories: List<String> = emptyList(),
    val selectedCategory: String = "",
    val searchQuery: String = "",
    val allProducts: List<CatalogProduct> = emptyList(),
    val displayedProducts: List<CatalogProduct> = emptyList(),
    val availableToppings: List<ToppingEntity> = emptyList(),
    val availableVariants: List<ProductVariantEntity> = emptyList(),
    val catalogSyncError: String? = null,
    val isCatalogSyncing: Boolean = false,
    val catalogSyncMessage: String? = null,
    val cartItems: List<OrderLineItem> = emptyList(),
    val isCartReady: Boolean = false,
    val cartLoadError: String? = null,
    val pendingCartWrites: Int = 0,
    val isDraftBusy: Boolean = false,
    val orderMessage: String? = null,
    val lastHeldDraftId: String? = null,
    val holdDraftId: String? = null,
    val customizingProduct: CatalogProduct? = null,
    val isHeldOrdersDialogOpen: Boolean = false,
    val isHoldOrderDialogOpen: Boolean = false,
    val pendingRestoreDraft: DraftOrderEntity? = null,
    val heldOrders: List<DraftOrderEntity> = emptyList(),
    val editingQuantityItem: OrderLineItem? = null,
    val cashierName: String = "",
    val cashierCode: String = "",
    val storeAddressSummary: String = "",
    val deviceCode: String = "",
    val pendingSyncCount: Int = 0,
    val rejectedSyncCount: Int = 0,
    val isOnline: Boolean? = null,
    val hasPendingOnlinePayment: Boolean = false
) {
    val subtotal: Long get() = cartItems.sumOf { it.totalLinePrice }

    // Tính VAT Inclusive: tax = subtotal - subtotal / (1 + rate)
    val totalVat: Long
        get() = cartItems.sumOf { item ->
            calculateInclusiveVat(item.totalLinePrice, item.product.taxRateBps)
        }

    val totalAmount: Long get() = subtotal
    val totalItemCount: Int get() = cartItems.sumOf { it.quantity }
}

class OrderViewModel(application: Application) : AndroidViewModel(application) {
    private val designPreview = DesignPreviewMode.isActive(application)
    private val db = AppDatabase.getDatabase(application)
    private val catalogDao = db.catalogDao()
    private val draftDao = db.draftOrderDao()
    private val activeCartDao = db.activeCartDao()
    private val cartMutex = Mutex()
    private val credentialStore = DeviceCredentialStore(application)
    private val catalogSync = CatalogSyncRepository(db)

    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()

    fun setCashier(name: String, code: String) {
        val device = credentialStore.load()
        _uiState.update { it.copy(
            cashierName = name,
            cashierCode = code,
            storeAddressSummary = device?.storeName.orEmpty(),
            deviceCode = device?.deviceId?.take(8)?.uppercase().orEmpty()
        ) }
    }

    init {
        if (designPreview) {
            _uiState.value = DesignPreviewCatalog.initialState().copy(isCartReady = true)
        } else {
            viewModelScope.launch {
                db.onlinePaymentDao().observeLatest().collect { attempt ->
                    _uiState.update { it.copy(hasPendingOnlinePayment = attempt != null && attempt.status !in setOf("PAID", "FINAL_UNPAID", "CANCELLED")) }
                }
            }
            viewModelScope.launch {
                DeviceHeartbeatCoordinator.isOnline.collect { online -> _uiState.update { it.copy(isOnline = online) } }
            }
            viewModelScope.launch {
                loadActiveCart()
                loadCatalog()
                observeDraftOrders()
                viewModelScope.launch {
                    db.salesDao().observePendingOutboxCount().collect { count ->
                        _uiState.update { it.copy(pendingSyncCount = count) }
                    }
                }
                viewModelScope.launch {
                    db.salesDao().observeRejectedOutboxCount().collect { count ->
                        _uiState.update { it.copy(rejectedSyncCount = count) }
                    }
                }
                val session = credentialStore.load()
                if (session != null) {
                    pullCatalog()
                }
            }
        }
    }

    fun refreshCatalog() {
        if (designPreview) {
            _uiState.update { it.copy(catalogSyncError = "Chế độ xem trước không kết nối máy chủ.") }
            return
        }
        if (_uiState.value.isCatalogSyncing) return
        viewModelScope.launch { pullCatalog(forceSnapshot = true) }
    }

    private suspend fun pullCatalog(forceSnapshot: Boolean = false) {
        val session = credentialStore.load()
        if (session == null) {
            _uiState.update { it.copy(catalogSyncError = "Thiết bị chưa được kích hoạt.") }
            return
        }
        _uiState.update { it.copy(isCatalogSyncing = true, catalogSyncMessage = null) }
        try {
            catalogSync.pull(session, forceSnapshot)
            _uiState.update { it.copy(catalogSyncError = null, catalogSyncMessage = "Thực đơn đã được kiểm tra với máy chủ.") }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            _uiState.update { it.copy(catalogSyncError = error.message ?: "Không thể cập nhật thực đơn.") }
        } finally {
            _uiState.update { it.copy(isCatalogSyncing = false) }
        }
    }

    private suspend fun loadActiveCart() {
        runCatching {
            val saved = activeCartDao.get()
            val session = credentialStore.load()
            if (saved != null && (session == null || session.storeId != saved.storeId || session.deviceId != saved.deviceId)) {
                error("Giỏ cũ thuộc thiết bị hoặc chi nhánh khác; không ghi đè dữ liệu này.")
            }
            val items = saved?.let { OrderJsonSerializer.deserializeOrderItemsStrict(it.itemsJson) }.orEmpty()
            _uiState.update { it.copy(cartItems = items, isCartReady = true) }
        }.onFailure { error ->
            _uiState.update { it.copy(cartLoadError = error.message ?: "Không thể mở giỏ hàng đã lưu.") }
        }
    }

    private suspend fun saveActiveCart(items: List<OrderLineItem>) {
        db.withTransaction {
        check(db.onlinePaymentDao().getUnresolved() == null) { "Giao dịch QR đang chờ; giữ nguyên giỏ đã xác nhận." }
        if (items.isEmpty()) {
            activeCartDao.clear()
            return@withTransaction
        }
        val session = credentialStore.load() ?: error("Thiết bị chưa được kích hoạt.")
        activeCartDao.save(ActiveCartEntity(
            storeId = session.storeId,
            deviceId = session.deviceId,
            itemsJson = OrderJsonSerializer.serializeOrderItems(items),
            updatedAt = System.currentTimeMillis()
        ))
        }
    }

    private fun mutateCart(transform: (OrderUiState) -> OrderUiState) {
        if (designPreview) {
            _uiState.update(transform)
            return
        }
        _uiState.update { it.copy(pendingCartWrites = it.pendingCartWrites + 1) }
        viewModelScope.launch {
            try {
                cartMutex.withLock {
                    val current = _uiState.value
                    if (!current.isCartReady || current.isDraftBusy) return@withLock
                    val next = transform(current)
                    runCatching { saveActiveCart(next.cartItems) }
                        .onSuccess {
                            _uiState.update { latest -> latest.copy(
                                cartItems = next.cartItems,
                                customizingProduct = next.customizingProduct,
                                editingQuantityItem = next.editingQuantityItem
                            ) }
                        }
                        .onFailure { error ->
                            _uiState.update { it.copy(orderMessage = error.message ?: "Không lưu được giỏ hàng.") }
                        }
                }
            } finally {
                _uiState.update { it.copy(pendingCartWrites = (it.pendingCartWrites - 1).coerceAtLeast(0)) }
            }
        }
    }

    fun canStartCheckout(): Boolean = _uiState.value.let {
        it.isCartReady && !it.isDraftBusy && it.pendingCartWrites == 0 && it.cartItems.isNotEmpty()
    }

    private fun loadCatalog() {
        viewModelScope.launch {
            catalogDao.getAllProducts().collect { products ->
                val categories = products.map { it.category }.distinct()
                _uiState.update { state ->
                    val activeCategory = if (state.selectedCategory in categories) {
                        state.selectedCategory
                    } else {
                        categories.firstOrNull() ?: ""
                    }
                    state.copy(
                        allProducts = products,
                        categories = categories,
                        selectedCategory = activeCategory,
                        displayedProducts = filterProducts(products, activeCategory, state.searchQuery)
                    )
                }
            }
        }
        viewModelScope.launch {
            catalogDao.getAllToppings().collect { toppings ->
                _uiState.update { it.copy(availableToppings = toppings) }
            }
        }
        viewModelScope.launch {
            catalogDao.getAllVariants().collect { variants ->
                _uiState.update { it.copy(availableVariants = variants) }
            }
        }
    }

    private fun observeDraftOrders() {
        viewModelScope.launch {
            draftDao.getAllDraftOrders().collect { drafts ->
                _uiState.update { it.copy(heldOrders = drafts) }
            }
        }
    }

    private fun filterProducts(
        products: List<CatalogProduct>,
        category: String,
        query: String
    ): List<CatalogProduct> {
        return products.filter { p ->
            val matchCat = category.isBlank() || p.category == category
            val matchQuery = query.isBlank() ||
                    p.name.contains(query, ignoreCase = true) ||
                    p.code.contains(query, ignoreCase = true)
            matchCat && matchQuery
        }
    }

    fun selectCategory(category: String) {
        _uiState.update { state ->
            state.copy(
                selectedCategory = category,
                displayedProducts = filterProducts(state.allProducts, category, state.searchQuery)
            )
        }
    }

    fun onSearchQueryChange(query: String) {
        _uiState.update { state ->
            state.copy(
                searchQuery = query,
                displayedProducts = filterProducts(state.allProducts, state.selectedCategory, query)
            )
        }
    }

    fun startCustomizingProduct(product: CatalogProduct) {
        _uiState.update { it.copy(customizingProduct = product) }
    }

    fun dismissCustomization() {
        _uiState.update { it.copy(customizingProduct = null) }
    }

    fun addCustomizedItemToCart(
        product: CatalogProduct,
        variant: ProductVariantEntity,
        toppings: List<SelectedTopping>,
        note: String,
        quantity: Int
    ) {
        val newItem = OrderLineItem(
            lineId = UUID.randomUUID().toString(),
            product = product,
            variant = variant,
            toppings = toppings,
            note = note,
            quantity = quantity
        )

        mutateCart { state ->
            // Kiểm tra xem đã có item y hệt thuộc tính trong cart chưa
            val existingIndex = state.cartItems.indexOfFirst {
                it.product.id == newItem.product.id &&
                        it.variant.id == newItem.variant.id &&
                        it.note == newItem.note &&
                        it.toppings == newItem.toppings
            }

            val updatedCart = if (existingIndex >= 0) {
                state.cartItems.toMutableList().also {
                    val old = it[existingIndex]
                    it[existingIndex] = old.copy(quantity = old.quantity + quantity)
                }
            } else {
                state.cartItems + newItem
            }

            state.copy(cartItems = updatedCart, customizingProduct = null)
        }
    }

    fun increaseQuantity(lineId: String) {
        mutateCart { state ->
            val updated = state.cartItems.map {
                if (it.lineId == lineId) it.copy(quantity = it.quantity + 1) else it
            }
            state.copy(cartItems = updated)
        }
    }

    fun decreaseQuantity(lineId: String) {
        mutateCart { state ->
            val updated = state.cartItems.mapNotNull {
                if (it.lineId == lineId) {
                    if (it.quantity > 1) it.copy(quantity = it.quantity - 1) else null
                } else it
            }
            state.copy(cartItems = updated)
        }
    }

    fun setQuantity(lineId: String, newQty: Int) {
        mutateCart { state ->
            val updated = state.cartItems.mapNotNull {
                if (it.lineId == lineId) {
                    if (newQty > 0) it.copy(quantity = newQty) else null
                } else it
            }
            state.copy(cartItems = updated, editingQuantityItem = null)
        }
    }

    fun startEditingQuantity(item: OrderLineItem) {
        _uiState.update { it.copy(editingQuantityItem = item) }
    }

    fun dismissEditingQuantity() {
        _uiState.update { it.copy(editingQuantityItem = null) }
    }

    fun removeItem(lineId: String) {
        mutateCart { state ->
            state.copy(cartItems = state.cartItems.filterNot { it.lineId == lineId })
        }
    }

    fun clearCart() {
        mutateCart { it.copy(cartItems = emptyList()) }
    }

    /** Checkout already removed active_cart in the paid-sale transaction. */
    fun clearCartAfterPayment(paidLineIds: Set<String>? = null) {
        _uiState.update { state ->
            state.copy(cartItems = if (paidLineIds == null) emptyList()
                else state.cartItems.filterNot { it.lineId in paidLineIds })
        }
    }

    fun refreshCartPrices() {
        mutateCart { state ->
            if (!reviewCartAgainstCatalog(state).canRefreshPrices) return@mutateCart state
            state.copy(cartItems = state.cartItems.map { line ->
                val product = state.allProducts.first { it.id == line.product.id }
                val variant = state.availableVariants.first { it.id == line.variant.id }
                line.copy(product = product, variant = variant,
                    toppings = line.toppings.map { selected ->
                        selected.copy(topping = state.availableToppings.first { it.id == selected.topping.id })
                    })
            })
        }
    }

    fun openHoldOrderDialog() {
        if (!canStartCheckout()) return
        if (designPreview) {
            _uiState.update {
                it.copy(isHoldOrderDialogOpen = true, holdDraftId = "T-${it.heldOrders.size + 22}",
                    orderMessage = null)
            }
            return
        }
        viewModelScope.launch {
            cartMutex.withLock {
                if (_uiState.value.isHoldOrderDialogOpen || _uiState.value.cartItems.isEmpty()) return@withLock
                runCatching { "T-${draftDao.reserveDraftNumber(DraftCodeSequenceEntity())}" }
                    .onSuccess { id -> _uiState.update { it.copy(isHoldOrderDialogOpen = true, holdDraftId = id,
                        orderMessage = null) } }
                    .onFailure { error -> _uiState.update { it.copy(orderMessage = error.message ?: "Không cấp được mã đơn treo.") } }
            }
        }
    }

    fun dismissHoldOrderDialog() {
        if (!_uiState.value.isDraftBusy) _uiState.update { it.copy(isHoldOrderDialogOpen = false, holdDraftId = null) }
    }

    fun holdCurrentOrder(customerName: String = "") {
        val initial = _uiState.value
        if (initial.cartItems.isEmpty() || initial.isDraftBusy || !initial.isCartReady) return
        val draftId = initial.holdDraftId ?: return
        val label = customerName.trim().ifBlank { null }
        if (designPreview) {
            val draft = DraftOrderEntity(
                id = draftId, customerName = label,
                itemsJson = OrderJsonSerializer.serializeOrderItems(initial.cartItems),
                totalAmount = initial.totalAmount
            )
            _uiState.update {
                it.copy(cartItems = emptyList(), heldOrders = listOf(draft) + it.heldOrders,
                    isHoldOrderDialogOpen = false, holdDraftId = null, lastHeldDraftId = draft.id,
                    orderMessage = null)
            }
            return
        }
        viewModelScope.launch {
            cartMutex.withLock {
                if (_uiState.value.isDraftBusy) return@withLock
                _uiState.update { it.copy(isDraftBusy = true) }
                runCatching {
                    val state = _uiState.value
                    check(state.cartItems.isNotEmpty()) { "Giỏ hàng đang trống." }
                    val draft = DraftOrderEntity(
                        id = draftId, customerName = label, heldAt = System.currentTimeMillis(),
                        itemsJson = OrderJsonSerializer.serializeOrderItems(state.cartItems),
                        totalAmount = state.totalAmount
                    )
                    db.withTransaction {
                        check(db.onlinePaymentDao().getUnresolved() == null) { "Không thể treo đơn đang chờ QR." }
                        draftDao.insertDraftOrder(draft)
                        activeCartDao.clear()
                    }
                    draft
                }.onSuccess { draft ->
                    _uiState.update { it.copy(cartItems = emptyList(), isDraftBusy = false,
                        isHoldOrderDialogOpen = false, holdDraftId = null, lastHeldDraftId = draft.id,
                        orderMessage = null) }
                }.onFailure { error ->
                    _uiState.update { it.copy(isDraftBusy = false,
                        orderMessage = error.message ?: "Không thể lưu đơn treo; giỏ vẫn được giữ nguyên.") }
                }
            }
        }
    }

    fun clearOrderMessage() { _uiState.update { it.copy(orderMessage = null) } }
    fun clearHoldUndo() { _uiState.update { it.copy(lastHeldDraftId = null) } }

    fun undoHold() {
        val id = _uiState.value.lastHeldDraftId ?: return
        if (designPreview) {
            val draft = _uiState.value.heldOrders.firstOrNull { it.id == id } ?: return
            _uiState.update { it.copy(cartItems = OrderJsonSerializer.deserializeOrderItemsStrict(draft.itemsJson),
                heldOrders = it.heldOrders.filterNot { held -> held.id == id }, lastHeldDraftId = null) }
            return
        }
        viewModelScope.launch {
            cartMutex.withLock {
                runCatching {
                    check(_uiState.value.cartItems.isEmpty()) { "Giỏ mới đã có món. Hãy mở đơn từ danh sách đơn treo." }
                    val draft = draftDao.getDraftOrder(id) ?: error("Đơn treo không còn tồn tại.")
                    val items = readDraftItems(draft)
                    db.withTransaction {
                        saveActiveCart(items)
                        draftDao.deleteDraftOrder(id)
                    }
                    items
                }.onSuccess { items ->
                    _uiState.update { it.copy(cartItems = items, lastHeldDraftId = null) }
                }.onFailure { error ->
                    _uiState.update { it.copy(lastHeldDraftId = null, orderMessage = error.message) }
                }
            }
        }
    }

    fun openHeldOrdersDialog() {
        if (_uiState.value.isCartReady && _uiState.value.pendingCartWrites == 0) _uiState.update { it.copy(isHeldOrdersDialogOpen = true,
            orderMessage = null) }
    }

    fun dismissHeldOrdersDialog() {
        _uiState.update { it.copy(isHeldOrdersDialogOpen = false) }
    }

    fun requestRestoreOrder(draft: DraftOrderEntity) {
        if (_uiState.value.isDraftBusy || !_uiState.value.isCartReady) return
        if (_uiState.value.cartItems.isEmpty()) {
            restoreOrder(draft.id)
        } else {
            _uiState.update {
                it.copy(
                    isHeldOrdersDialogOpen = false,
                    pendingRestoreDraft = draft,
                    orderMessage = null
                )
            }
        }
    }

    fun dismissPendingRestore() {
        _uiState.update { it.copy(pendingRestoreDraft = null) }
    }

    fun confirmHoldCurrentAndRestore(draft: DraftOrderEntity, currentCustomerName: String) {
        if (_uiState.value.isDraftBusy || !_uiState.value.isCartReady) return
        if (designPreview) {
            val currentDraft = DraftOrderEntity(
                id = UUID.randomUUID().toString(),
                customerName = currentCustomerName.trim().ifBlank { null },
                itemsJson = OrderJsonSerializer.serializeOrderItems(_uiState.value.cartItems),
                totalAmount = _uiState.value.totalAmount
            )
            val restored = readDraftItems(draft)
            _uiState.update { it.copy(cartItems = restored,
                heldOrders = listOf(currentDraft) + it.heldOrders.filterNot { held -> held.id == draft.id },
                pendingRestoreDraft = null, isHeldOrdersDialogOpen = false) }
            return
        }
        viewModelScope.launch {
            cartMutex.withLock {
                if (_uiState.value.isDraftBusy) return@withLock
                _uiState.update { it.copy(isDraftBusy = true) }
                runCatching {
                    val state = _uiState.value
                    val selected = draftDao.getDraftOrder(draft.id) ?: error("Đơn treo không còn tồn tại.")
                    val restored = readDraftItems(selected)
                    db.withTransaction {
                        check(state.cartItems.isNotEmpty()) { "Giỏ hiện tại đang trống." }
                        val currentDraft = DraftOrderEntity(
                            id = "T-${draftDao.reserveDraftNumber(DraftCodeSequenceEntity())}",
                            customerName = currentCustomerName.trim().ifBlank { null },
                            heldAt = System.currentTimeMillis(),
                            itemsJson = OrderJsonSerializer.serializeOrderItems(state.cartItems),
                            totalAmount = state.totalAmount
                        )
                        draftDao.insertDraftOrder(currentDraft)
                        saveActiveCart(restored)
                        draftDao.deleteDraftOrder(selected.id)
                    }
                    restored
                }.onSuccess { restored ->
                    _uiState.update { it.copy(cartItems = restored, pendingRestoreDraft = null,
                        isHeldOrdersDialogOpen = false, isDraftBusy = false, orderMessage = null) }
                }.onFailure { error ->
                    _uiState.update { it.copy(isDraftBusy = false,
                        orderMessage = error.message ?: "Không thể mở đơn treo; giỏ vẫn được giữ nguyên.") }
                }
            }
        }
    }

    private fun readDraftItems(draft: DraftOrderEntity): List<OrderLineItem> =
        OrderJsonSerializer.deserializeOrderItemsStrict(draft.itemsJson).also {
            check(it.isNotEmpty()) { "Đơn treo không có món hoặc dữ liệu không đọc được." }
        }

    private fun restoreOrder(draftId: String) {
        if (designPreview) {
            val draft = _uiState.value.heldOrders.firstOrNull { it.id == draftId } ?: return
            _uiState.update { it.copy(cartItems = readDraftItems(draft), isHeldOrdersDialogOpen = false,
                heldOrders = it.heldOrders.filterNot { held -> held.id == draftId }) }
            return
        }
        viewModelScope.launch {
            cartMutex.withLock {
                if (_uiState.value.isDraftBusy) return@withLock
                _uiState.update { it.copy(isDraftBusy = true) }
                runCatching {
                    check(_uiState.value.cartItems.isEmpty()) { "Giỏ hiện tại đang có món." }
                    val draft = draftDao.getDraftOrder(draftId) ?: error("Đơn treo không còn tồn tại.")
                    val items = readDraftItems(draft)
                    db.withTransaction {
                        saveActiveCart(items)
                        draftDao.deleteDraftOrder(draftId)
                    }
                    items
                }.onSuccess { items ->
                    _uiState.update { it.copy(cartItems = items, isHeldOrdersDialogOpen = false,
                        isDraftBusy = false, lastHeldDraftId = null, orderMessage = null) }
                }.onFailure { error ->
                    _uiState.update { it.copy(isDraftBusy = false,
                        orderMessage = error.message ?: "Không thể mở đơn treo.") }
                }
            }
        }
    }

    fun removeDraftOrder(draftId: String) {
        if (designPreview) {
            _uiState.update { it.copy(heldOrders = it.heldOrders.filterNot { draft -> draft.id == draftId }) }
            return
        }
        viewModelScope.launch {
            cartMutex.withLock {
                runCatching { draftDao.deleteDraftOrder(draftId) }
                    .onFailure { error -> _uiState.update { it.copy(orderMessage = error.message ?: "Không thể xóa đơn treo.") } }
            }
        }
    }

    fun renameDraftOrder(draftId: String, label: String) {
        if (designPreview) {
            _uiState.update { it.copy(heldOrders = it.heldOrders.map { draft ->
                if (draft.id == draftId) draft.copy(customerName = label.trim().ifBlank { null }) else draft
            }) }
            return
        }
        viewModelScope.launch {
            runCatching { draftDao.renameDraftOrder(draftId, label.trim().ifBlank { null }) }
                .onFailure { error -> _uiState.update { it.copy(orderMessage = error.message ?: "Không thể đổi tên đơn treo.") } }
        }
    }
}
