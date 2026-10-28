package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.json.JSONArray
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.ui.register.RegisterUiState
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.OrderUiState
import vn.id.congtc145.coffeepos.ui.order.OrderViewModel
import vn.id.congtc145.coffeepos.ui.order.CartCatalogReview
import vn.id.congtc145.coffeepos.ui.order.reviewCartAgainstCatalog
import vn.id.congtc145.coffeepos.ui.order.dialogs.QuantityInputDialog

@Composable
fun ReferenceOrderScreen(
    viewModel: OrderViewModel,
    registerState: RegisterUiState,
    onOpenRegister: () -> Unit,
    onNavigateToCheckout: () -> Unit,
    onNavigateToMenu: () -> Unit,
    onLockCashier: () -> Unit
) {
    val fontScale = LocalDensity.current.fontScale
    CompositionLocalProvider(LocalDensity provides Density(1f, fontScale)) {
        ReferenceOrderContent(viewModel, registerState, onOpenRegister, onNavigateToCheckout, onNavigateToMenu, onLockCashier)
    }
}

@Composable
private fun ReferenceOrderContent(
    viewModel: OrderViewModel,
    registerState: RegisterUiState,
    onOpenRegister: () -> Unit,
    onNavigateToCheckout: () -> Unit,
    onNavigateToMenu: () -> Unit,
    onLockCashier: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var confirmClear by remember { mutableStateOf(false) }
    var checkoutReview by remember { mutableStateOf<CartCatalogReview?>(null) }
    LaunchedEffect(state.lastHeldDraftId) {
        if (state.lastHeldDraftId != null) {
            val result = snackbar.showSnackbar("Đã lưu đơn trên thiết bị này", actionLabel = "Hoàn tác")
            if (result == SnackbarResult.ActionPerformed) viewModel.undoHold() else viewModel.clearHoldUndo()
        }
    }
    LaunchedEffect(state.orderMessage, state.isHoldOrderDialogOpen,
        state.isHeldOrdersDialogOpen, state.pendingRestoreDraft) {
        state.orderMessage?.takeIf { !state.isHoldOrderDialogOpen &&
            !state.isHeldOrdersDialogOpen && state.pendingRestoreDraft == null }?.let { message ->
            snackbar.showSnackbar(message)
            viewModel.clearOrderMessage()
        }
    }
    Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize().background(ReferenceStyle.paper)) {
        ReferenceTopBar(
            title = "Bán hàng", storeName = state.storeAddressSummary,
            cashierName = state.cashierName, isOnline = state.isOnline,
            pendingSyncCount = state.pendingSyncCount,
            registerSession = registerState.openSession,
            registerLoaded = registerState.isLoaded,
            onRegisterClick = onOpenRegister,
            onLeadingClick = onNavigateToMenu, onLock = onLockCashier
        )
        if (!DesignPreviewMode.isActive(LocalContext.current) &&
            registerState.isLoaded && registerState.openSession == null) {
            Row(
                Modifier.fillMaxWidth().background(ReferenceStyle.warning)
                    .padding(horizontal = 24.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Chưa mở phiên quỹ đầu ca", color = ReferenceStyle.ink,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                TextButton(onClick = onOpenRegister) {
                    Text("Mở ngay", color = ReferenceStyle.teal, fontWeight = FontWeight.Bold)
                }
            }
        }
        state.catalogSyncError?.let { error ->
            Text("Không thể cập nhật thực đơn: $error", color = Color.White,
                modifier = Modifier.fillMaxWidth().background(ReferenceStyle.danger).padding(8.dp))
        }
        if (!state.isCartReady) {
            Text(state.cartLoadError ?: "Đang mở giỏ hàng đã lưu. Chưa thể sửa đơn.", color = ReferenceStyle.ink,
                modifier = Modifier.fillMaxWidth().background(ReferenceStyle.warning).padding(8.dp))
        }
        Row(Modifier.fillMaxSize()) {
            CategoryRail(state, viewModel::selectCategory)
            CatalogPanel(state, viewModel::onSearchQueryChange,
                { product -> if (state.isCartReady && !state.isDraftBusy) viewModel.startCustomizingProduct(product) },
                modifier = Modifier.weight(1f))
            OrderCartPanel(
                state = state, onMinus = viewModel::decreaseQuantity,
                onPlus = viewModel::increaseQuantity, onEdit = viewModel::startEditingQuantity,
                onHold = viewModel::openHoldOrderDialog, onOpenHeld = viewModel::openHeldOrdersDialog,
                onClear = { confirmClear = true }, onCheckout = {
                    if (viewModel.canStartCheckout()) {
                        val review = reviewCartAgainstCatalog(state)
                        if (state.hasPendingOnlinePayment || review.messages.isEmpty()) onNavigateToCheckout() else checkoutReview = review
                    }
                }
            )
        }
    }
    SnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter))
    }

    state.customizingProduct?.let { product ->
        val allowed = runCatching {
            val ids = JSONArray(product.allowedToppingIdsJson)
            (0 until ids.length()).map { ids.getString(it) }.toSet()
        }.getOrDefault(emptySet())
        ReferenceCustomizationDialog(
            product = product,
            variants = state.availableVariants.filter { it.productId == product.id },
            toppings = state.availableToppings.filter { it.id in allowed },
            onDismiss = viewModel::dismissCustomization,
            onConfirm = viewModel::addCustomizedItemToCart
        )
    }
    if (state.isHeldOrdersDialogOpen) {
        ReferenceHeldOrdersSheet(state.heldOrders, state.isDraftBusy, state.orderMessage,
            viewModel::dismissHeldOrdersDialog, viewModel::requestRestoreOrder,
            viewModel::removeDraftOrder, viewModel::renameDraftOrder)
    }
    if (state.isHoldOrderDialogOpen) {
        ReferenceHoldOrderDialog(state, viewModel::dismissHoldOrderDialog, viewModel::holdCurrentOrder)
    }
    state.pendingRestoreDraft?.let { draft ->
        ReferenceCartConflictDialog(state, draft, viewModel::dismissPendingRestore) {
            viewModel.confirmHoldCurrentAndRestore(draft, "")
        }
    }
    if (confirmClear) {
        AlertDialog(onDismissRequest = { confirmClear = false },
            title = { Text("Xóa đơn hiện tại?") },
            text = { Text("Các món trong giỏ chưa thanh toán sẽ bị xóa. Đơn treo khác không bị ảnh hưởng.") },
            confirmButton = { Button(onClick = { viewModel.clearCart(); confirmClear = false }) { Text("Xóa đơn") } },
            dismissButton = { OutlinedButton(onClick = { confirmClear = false }) { Text("Ở lại") } })
    }
    checkoutReview?.let { review ->
        AlertDialog(onDismissRequest = { checkoutReview = null },
            title = { Text("Kiểm tra lại giỏ trước khi thu tiền") },
            text = { Text(review.messages.joinToString("\n\n")) },
            confirmButton = {
                if (review.canRefreshPrices) Button(onClick = {
                    viewModel.refreshCartPrices(); checkoutReview = null
                }) { Text("Cập nhật giá và VAT") }
            },
            dismissButton = { OutlinedButton(onClick = { checkoutReview = null }) {
                Text(if (review.canRefreshPrices) "Ở lại" else "Chỉnh giỏ")
            } })
    }
    state.editingQuantityItem?.let { item ->
        QuantityInputDialog(item, viewModel::dismissEditingQuantity) { viewModel.setQuantity(item.lineId, it) }
    }
}

@Composable
private fun CategoryRail(state: OrderUiState, onSelect: (String) -> Unit) {
    Column(Modifier.width(184.dp).fillMaxHeight().background(ReferenceStyle.surface).padding(horizontal = 12.dp)) {
        Spacer(Modifier.height(33.dp))
        Text("DANH MỤC", color = ReferenceStyle.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 12.dp))
        Spacer(Modifier.height(20.dp))
        state.categories.forEach { category ->
            val selected = category == state.selectedCategory
            Row(
                Modifier.fillMaxWidth()
                    .heightIn(min = 60.dp)
                    .background(if (selected) ReferenceStyle.mint else Color.Transparent, RoundedCornerShape(13.dp))
                    .clickable { onSelect(category) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = category,
                    color = if (selected) ReferenceStyle.teal else ReferenceStyle.ink,
                    fontSize = 14.sp,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                    lineHeight = 19.sp,
                    maxLines = 2,
                    modifier = Modifier.fillMaxWidth()
                )
            }
            Spacer(Modifier.height(8.dp))
        }
        Spacer(Modifier.weight(1f))
        HorizontalDivider(color = ReferenceStyle.line)
        Spacer(Modifier.height(21.dp))
        Text("MẸO THAO TÁC", color = ReferenceStyle.muted, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(start = 12.dp))
        Spacer(Modifier.height(12.dp))
        Text("Chọn món để thêm size và topping.", color = ReferenceStyle.muted, fontSize = 12.sp,
            lineHeight = 17.sp, modifier = Modifier.padding(start = 12.dp, bottom = 20.dp))
    }
}

@Composable
private fun CatalogPanel(
    state: OrderUiState,
    onSearch: (String) -> Unit,
    onProduct: (CatalogProduct) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier.fillMaxHeight().padding(horizontal = 24.dp, vertical = 24.dp)) {
        Text("Chọn món", color = ReferenceStyle.ink, fontSize = 25.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(5.dp))
        Text("Món được chọn sẽ xuất hiện trong đơn bên phải", color = ReferenceStyle.muted, fontSize = 13.sp)
        Spacer(Modifier.height(18.dp))
        OutlinedTextField(
            value = state.searchQuery, onValueChange = onSearch,
            leadingIcon = { Icon(Icons.Default.Search, null, tint = ReferenceStyle.muted) },
            placeholder = { Text("Tìm theo tên hoặc mã món...", fontSize = 14.sp) },
            modifier = Modifier.fillMaxWidth().height(54.dp),
            shape = RoundedCornerShape(13.dp), singleLine = true
        )
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(state.selectedCategory.ifEmpty { "Thực đơn" }, color = ReferenceStyle.ink,
                fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(6.dp))
            Text("${state.displayedProducts.size} món", color = ReferenceStyle.muted, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Surface(color = ReferenceStyle.surface, shape = RoundedCornerShape(20.dp)) {
                Text("●  Có sẵn", color = ReferenceStyle.teal, fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 19.dp, vertical = 8.dp))
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(state.displayedProducts, key = { it.id }) { product ->
                ProductTile(product) { onProduct(product) }
            }
        }
    }
}

@Composable
private fun ProductTile(product: CatalogProduct, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = if (product.isAvailable) ReferenceStyle.surface else ReferenceStyle.paper,
        border = BorderStroke(1.dp, if (product.isAvailable) ReferenceStyle.line else ReferenceStyle.line.copy(alpha = 0.5f)),
        modifier = Modifier
            .fillMaxWidth()
            .height(88.dp)
            .clickable(enabled = product.isAvailable, onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = product.name,
                color = if (product.isAvailable) ReferenceStyle.ink else ReferenceStyle.muted.copy(alpha = 0.6f),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                lineHeight = 21.sp,
                maxLines = 3,
                modifier = Modifier.fillMaxWidth()
            )
            if (!product.isAvailable) {
                Surface(
                    color = ReferenceStyle.danger.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.align(Alignment.BottomCenter)
                ) {
                    Text(
                        "Tạm hết",
                        color = ReferenceStyle.danger,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun OrderCartPanel(
    state: OrderUiState,
    onMinus: (String) -> Unit,
    onPlus: (String) -> Unit,
    onEdit: (OrderLineItem) -> Unit,
    onHold: () -> Unit,
    onOpenHeld: () -> Unit,
    onClear: () -> Unit,
    onCheckout: () -> Unit
) {
    Column(Modifier.width(428.dp).fillMaxHeight().background(ReferenceStyle.surface).padding(horizontal = 20.dp, vertical = 24.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.ShoppingCart, null, tint = ReferenceStyle.teal, modifier = Modifier.size(26.dp))
            Spacer(Modifier.width(10.dp))
            Text("Đơn hiện tại", color = ReferenceStyle.ink, fontSize = 21.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Surface(color = ReferenceStyle.mint, shape = RoundedCornerShape(20.dp)) {
                Text("${state.totalItemCount} món", color = ReferenceStyle.teal, fontSize = 12.sp,
                    fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
            }
        }
        Spacer(Modifier.height(3.dp))
        Text("Đơn tại quầy · Chưa thanh toán", color = ReferenceStyle.muted, fontSize = 13.sp)
        Spacer(Modifier.height(13.dp))
        Surface(color = ReferenceStyle.mint, shape = RoundedCornerShape(11.dp),
            border = BorderStroke(1.dp, ReferenceStyle.line),
            onClick = { if (state.isCartReady && state.pendingCartWrites == 0 && !state.isDraftBusy) onOpenHeld() },
            modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Layers, null, tint = ReferenceStyle.teal, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text("Đơn treo (${state.heldOrders.size})", color = ReferenceStyle.teal,
                    fontSize = 14.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                Text("Mở  ›", color = ReferenceStyle.teal, fontSize = 14.sp,
                    fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = ReferenceStyle.line)
        LazyColumn(Modifier.weight(1f)) {
            items(state.cartItems, key = { it.lineId }) { item ->
                CartLine(item,
                    { if (!state.isDraftBusy) onMinus(it) },
                    { if (!state.isDraftBusy) onPlus(it) },
                    { if (!state.isDraftBusy) onEdit(it) })
                HorizontalDivider(color = ReferenceStyle.line)
            }
            if (state.cartItems.isEmpty()) {
                item { Text("Chưa có món trong đơn", color = ReferenceStyle.muted,
                    modifier = Modifier.padding(vertical = 24.dp)) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = onHold, enabled = state.cartItems.isNotEmpty() && state.isCartReady &&
                    state.pendingCartWrites == 0 && !state.isDraftBusy,
                colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.mint,
                    contentColor = ReferenceStyle.teal),
                shape = RoundedCornerShape(11.dp),
                modifier = Modifier.weight(1f).height(49.dp)) {
                Icon(Icons.Default.Layers, null, modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(8.dp))
                Text("Treo đơn này", color = ReferenceStyle.teal,
                    fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
            OutlinedButton(onClick = onClear,
                enabled = state.cartItems.isNotEmpty() && state.isCartReady &&
                    state.pendingCartWrites == 0 && !state.isDraftBusy,
                shape = RoundedCornerShape(11.dp), border = BorderStroke(1.dp, ReferenceStyle.line),
                modifier = Modifier.weight(1f).height(49.dp)) {
                Text("Xóa đơn", color = ReferenceStyle.danger, fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
        Spacer(Modifier.height(18.dp))
        HorizontalDivider(color = ReferenceStyle.line)
        Spacer(Modifier.height(14.dp))
        SummaryRow("Tạm tính", money(state.subtotal), true)
        Spacer(Modifier.height(10.dp))
        SummaryRow(vn.id.congtc145.coffeepos.domain.includedVatLabel(state.cartItems.map { it.product.taxRateBps }), money(state.totalVat), false)
        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = ReferenceStyle.line)
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Tổng phải thu", color = ReferenceStyle.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(Modifier.weight(1f))
            Text(money(state.totalAmount), color = ReferenceStyle.teal, fontWeight = FontWeight.Bold, fontSize = 27.sp)
        }
        Spacer(Modifier.height(13.dp))
        Button(onClick = onCheckout, enabled = state.cartItems.isNotEmpty() && state.isCartReady &&
                state.pendingCartWrites == 0 && !state.isDraftBusy,
            colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(57.dp)) {
            Icon(Icons.Default.ShoppingCart, null, modifier = Modifier.size(21.dp))
            Spacer(Modifier.width(10.dp))
            Text("Tiếp tục thanh toán", fontSize = 17.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CartLine(item: OrderLineItem, onMinus: (String) -> Unit, onPlus: (String) -> Unit, onEdit: (OrderLineItem) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 18.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(item.product.name, color = ReferenceStyle.ink, fontSize = 16.sp,
                fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(money(item.totalLinePrice), color = ReferenceStyle.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(7.dp))
        val details = buildList {
            add("Size ${item.variant.sizeLabel}")
            item.toppings.forEach { add("${it.quantity} ${it.topping.name.lowercase()}") }
            if (item.note.isNotBlank()) add(item.note)
        }.joinToString(" · ")
        Text(details, color = ReferenceStyle.muted, fontSize = 12.sp, maxLines = 2)
        Spacer(Modifier.height(10.dp))
        ReferenceStepper(item.quantity, { onMinus(item.lineId) }, { onPlus(item.lineId) },
            compact = true, onCountClick = { onEdit(item) })
    }
}

@Composable
internal fun SummaryRow(label: String, value: String, strong: Boolean) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = ReferenceStyle.muted, fontSize = 13.sp)
        Spacer(Modifier.weight(1f))
        Text(value, color = if (strong) ReferenceStyle.ink else ReferenceStyle.muted,
            fontSize = 14.sp, fontWeight = if (strong) FontWeight.Bold else FontWeight.Normal)
    }
}
