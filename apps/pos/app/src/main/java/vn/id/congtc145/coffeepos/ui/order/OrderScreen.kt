package vn.id.congtc145.coffeepos.ui.order

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BakeryDining
import androidx.compose.material.icons.filled.Coffee
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EmojiFoodBeverage
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.LocalCafe
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.AlertDialog
import org.json.JSONArray
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.ui.components.PosTopAppBar
import vn.id.congtc145.coffeepos.ui.order.dialogs.HeldOrdersDialog
import vn.id.congtc145.coffeepos.ui.order.dialogs.HoldOrderDialog
import vn.id.congtc145.coffeepos.ui.order.dialogs.ProductCustomizationDialog
import vn.id.congtc145.coffeepos.ui.order.dialogs.QuantityInputDialog
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCardBorder
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCream
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCreamSurface
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeMocha
import vn.id.congtc145.coffeepos.ui.theme.CoffeeWarmBrown
import vn.id.congtc145.coffeepos.ui.theme.ErrorCrimson
import vn.id.congtc145.coffeepos.ui.theme.SurfaceOffWhite
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import java.text.NumberFormat
import java.util.Locale

@Composable
fun OrderScreen(
    viewModel: OrderViewModel,
    onNavigateToCheckout: () -> Unit,
    onNavigateToMenu: () -> Unit,
    onNavigateToAttendance: () -> Unit,
    onLockCashier: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsState()
    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN")) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CoffeeCream)
    ) {
        // 1. TOP APP BAR
        PosTopAppBar(
            storeAddressSummary = uiState.storeAddressSummary,
            deviceCode = uiState.deviceCode,
            cashierName = uiState.cashierName,
            isOnline = uiState.isOnline,
            pendingSyncCount = uiState.pendingSyncCount,
            rejectedSyncCount = uiState.rejectedSyncCount,
            onNavigateToMenu = onNavigateToMenu,
            onLockCashier = onLockCashier
        )

        uiState.catalogSyncError?.let { error ->
            Text(
                text = "Chưa cập nhật được thực đơn: $error",
                color = Color.White,
                modifier = Modifier.fillMaxWidth().background(ErrorCrimson).padding(8.dp)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().background(SurfaceOffWhite).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically
        ) {
            uiState.catalogSyncMessage?.let { message ->
                Text(message, color = TextSecondary, fontSize = 12.sp)
            }
            TextButton(onClick = viewModel::refreshCatalog, enabled = !uiState.isCatalogSyncing) {
                Text(if (uiState.isCatalogSyncing) "Đang cập nhật…" else "Làm mới thực đơn")
            }
        }

        // 2. MAIN 3-PANEL BODY (Category Rail + Product Grid + Cart Panel)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            // PANEL 1: CATEGORY RAIL (Bên trái)
            CategoryRail(
                categories = uiState.categories,
                selectedCategory = uiState.selectedCategory,
                onSelectCategory = { viewModel.selectCategory(it) },
                modifier = Modifier
                    .width(130.dp)
                    .fillMaxHeight()
                    .background(CoffeeDarkRoast)
            )

            // PANEL 2: PRODUCT CATALOG GRID (Ở giữa)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(16.dp)
            ) {
                // Thanh tìm kiếm sản phẩm
                OutlinedTextField(
                    value = uiState.searchQuery,
                    onValueChange = { viewModel.onSearchQueryChange(it) },
                    placeholder = { Text("Tìm tên món hoặc mã món (vd: CF01, Trà sữa...)", fontSize = 14.sp) },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = "Tìm kiếm", tint = TextSecondary)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Lưới sản phẩm compact 3 cột (không ảnh, tối ưu diện tích)
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(bottom = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(uiState.displayedProducts, key = { it.id }) { product ->
                        ProductGridItem(
                            product = product,
                            currencyFormatter = currencyFormatter,
                            onClick = { viewModel.startCustomizingProduct(product) }
                        )
                    }
                }
            }

            // PANEL 3: CART PANEL (Bên phải - Giỏ hàng chi tiết)
            CartPanel(
                uiState = uiState,
                currencyFormatter = currencyFormatter,
                onIncreaseQty = { viewModel.increaseQuantity(it) },
                onDecreaseQty = { viewModel.decreaseQuantity(it) },
                onEditQty = { viewModel.startEditingQuantity(it) },
                onRemoveItem = { viewModel.removeItem(it) },
                onClearCart = { viewModel.clearCart() },
                onHoldOrder = { viewModel.openHoldOrderDialog() },
                onOpenHeldOrders = { viewModel.openHeldOrdersDialog() },
                onCheckout = onNavigateToCheckout,
                modifier = Modifier
                    .width(380.dp)
                    .fillMaxHeight()
                    .background(Color.White)
            )
        }
    }

    // Modal tùy biến món: size, topping và note. Đường/đá chỉ ghi trong note.
    uiState.customizingProduct?.let { product ->
        ProductCustomizationDialog(
            product = product,
            variants = uiState.availableVariants.filter { it.productId == product.id },
            availableToppings = uiState.availableToppings.filter { topping ->
                runCatching {
                    val ids = JSONArray(product.allowedToppingIdsJson)
                    (0 until ids.length()).any { ids.getString(it) == topping.id }
                }.getOrDefault(false)
            },
            onDismiss = { viewModel.dismissCustomization() },
            onConfirm = { prod, variant, toppings, note, qty ->
                viewModel.addCustomizedItemToCart(prod, variant, toppings, note, qty)
            }
        )
    }

    // Modal Danh sách Đơn treo
    if (uiState.isHeldOrdersDialogOpen) {
        HeldOrdersDialog(
            heldOrders = uiState.heldOrders,
            onDismiss = { viewModel.dismissHeldOrdersDialog() },
            onRestoreOrder = { draft ->
                viewModel.requestRestoreOrder(draft)
            },
            onDeleteOrder = { draftId ->
                viewModel.removeDraftOrder(draftId)
            }
        )
    }

    // Modal Nhập thông tin Treo đơn
    if (uiState.isHoldOrderDialogOpen) {
        HoldOrderDialog(
            itemCount = uiState.totalItemCount,
            totalAmount = uiState.totalAmount,
            onDismiss = { viewModel.dismissHoldOrderDialog() },
            onConfirmHold = { customerName ->
                viewModel.holdCurrentOrder(customerName)
            }
        )
    }

    // Hộp thoại xử lý khi Giỏ hàng đang có món mà mở lại đơn treo
    uiState.pendingRestoreDraft?.let { draft ->
        AlertDialog(
            onDismissRequest = { viewModel.dismissPendingRestore() },
            title = {
                Text(
                    text = "Giỏ Hàng Đang Có Món",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = CoffeeDarkRoast
                )
            },
            text = {
                Text(
                    text = "Giỏ hàng hiện tại đang có ${uiState.cartItems.size} món. Bạn có muốn treo tạm đơn hiện tại rồi mở lại đơn \"${draft.customerName ?: "Khách vãng lai"}\" không?",
                    fontSize = 14.sp,
                    color = TextPrimary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.confirmHoldCurrentAndRestore(draft, "Bàn đang phục vụ")
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Treo đơn hiện tại & mở đơn này", color = Color.White, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = {
                        viewModel.dismissPendingRestore()
                    },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Ở lại", color = CoffeeDarkRoast, fontWeight = FontWeight.SemiBold)
                }
            }
        )
    }

    // Modal Nhập nhanh số lượng lớn (Click vào con số trong giỏ hàng)
    uiState.editingQuantityItem?.let { item ->
        QuantityInputDialog(
            item = item,
            onDismiss = { viewModel.dismissEditingQuantity() },
            onConfirmQuantity = { newQty ->
                viewModel.setQuantity(item.lineId, newQty)
            }
        )
    }
}

// ---------------- SUB-COMPONENTS ----------------

@Composable
fun CategoryRail(
    categories: List<String>,
    selectedCategory: String,
    onSelectCategory: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier.padding(vertical = 12.dp, horizontal = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(categories) { category ->
            val isSelected = category == selectedCategory
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = if (isSelected) CoffeeAmber else CoffeeMocha.copy(alpha = 0.6f),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectCategory(category) }
            ) {
                Column(
                    modifier = Modifier.padding(vertical = 14.dp, horizontal = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    val icon = when {
                        category.contains("Cà Phê") -> Icons.Default.Coffee
                        category.contains("Trà Sữa") -> Icons.Default.EmojiFoodBeverage
                        category.contains("Trà") -> Icons.Default.LocalCafe
                        category.contains("Bánh") -> Icons.Default.BakeryDining
                        else -> Icons.Default.Fastfood
                    }

                    Icon(
                        imageVector = icon,
                        contentDescription = category,
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    Text(
                        text = category,
                        color = Color.White,
                        fontSize = 12.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        textAlign = TextAlign.Center,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
fun ProductGridItem(
    product: CatalogProduct,
    currencyFormatter: NumberFormat,
    onClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = androidx.compose.foundation.BorderStroke(1.dp, CoffeeCardBorder),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Tên sản phẩm hiển thị rộng rãi, không bị cắt '...'
            Text(
                text = product.name,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = CoffeeDarkRoast,
                maxLines = 2,
                minLines = 2,
                lineHeight = 18.sp,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Dòng Giá bán + Nút tròn nhỏ Thêm món
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = currencyFormatter.format(product.basePrice),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = CoffeeAmber
                )

                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(CoffeeAmber),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = "Thêm món",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun CartPanel(
    uiState: OrderUiState,
    currencyFormatter: NumberFormat,
    onIncreaseQty: (String) -> Unit,
    onDecreaseQty: (String) -> Unit,
    onEditQty: (OrderLineItem) -> Unit,
    onRemoveItem: (String) -> Unit,
    onClearCart: () -> Unit,
    onHoldOrder: () -> Unit,
    onOpenHeldOrders: () -> Unit,
    onCheckout: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        // HEADER GIỎ HÀNG
        Surface(
            color = SurfaceOffWhite,
            shadowElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.ShoppingCart,
                        contentDescription = "Giỏ hàng",
                        tint = CoffeeDarkRoast,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Đơn hiện tại (${uiState.totalItemCount})",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = CoffeeDarkRoast
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Nút [ 📥 Đơn treo (n) ] đặt ngay trên thanh tiêu đề giỏ hàng!
                    OutlinedButton(
                        onClick = onOpenHeldOrders,
                        shape = RoundedCornerShape(6.dp),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Inbox,
                            contentDescription = "Đơn treo",
                            tint = CoffeeAmber,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Đơn treo (${uiState.heldOrders.size})",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = CoffeeMocha
                        )
                    }

                    // Nút Xóa sạch giỏ hàng
                    if (uiState.cartItems.isNotEmpty()) {
                        IconButton(onClick = onClearCart, modifier = Modifier.size(32.dp)) {
                            Icon(
                                imageVector = Icons.Default.Delete,
                                contentDescription = "Xóa giỏ",
                                tint = ErrorCrimson,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }

        // DANH SÁCH CÁC MÓN TRONG GIỎ HÀNG
        if (uiState.cartItems.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.PointOfSale,
                        contentDescription = null,
                        tint = Color(0xFFD1D5DB),
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = "Chưa có món nào trong đơn",
                        color = TextSecondary,
                        fontSize = 14.sp
                    )
                    Text(
                        text = "Chạm vào món bên trái để thêm vào đơn",
                        color = Color(0xFF9CA3AF),
                        fontSize = 12.sp
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(uiState.cartItems, key = { it.lineId }) { item ->
                    CartLineItemRow(
                        item = item,
                        currencyFormatter = currencyFormatter,
                        onIncrease = { onIncreaseQty(item.lineId) },
                        onDecrease = { onDecreaseQty(item.lineId) },
                        onEditQty = { onEditQty(item) },
                        onRemove = { onRemoveItem(item.lineId) }
                    )
                }
            }
        }

        HorizontalDivider(color = Color(0xFFE5E7EB))

        // FOOTER TÍNH TIỀN & CÁC NÚT HÀNH ĐỘNG
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(SurfaceOffWhite)
                .navigationBarsPadding()
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Tạm tính", fontSize = 13.sp, color = TextSecondary)
                Text(
                    text = currencyFormatter.format(uiState.subtotal),
                    fontSize = 13.sp,
                    color = TextPrimary
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Thuế VAT (Đã gồm trong giá)",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
                Text(
                    text = currencyFormatter.format(uiState.totalVat),
                    fontSize = 12.sp,
                    color = TextSecondary
                )
            }

            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = Color(0xFFE5E7EB))
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "TỔNG THANH TOÁN",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = CoffeeDarkRoast
                )
                Text(
                    text = currencyFormatter.format(uiState.totalAmount),
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = CoffeeAmber
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // 2 NÚT HÀNH ĐỘNG: TREO ĐƠN & THANH TOÁN
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Nút Treo đơn
                OutlinedButton(
                    onClick = onHoldOrder,
                    enabled = uiState.cartItems.isNotEmpty(),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PauseCircle,
                        contentDescription = "Treo đơn",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(text = "Treo đơn", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }

                // Nút Thanh toán
                Button(
                    onClick = onCheckout,
                    enabled = uiState.cartItems.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .weight(1.5f)
                        .height(48.dp)
                ) {
                    Text(
                        text = "THANH TOÁN",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
fun CartLineItemRow(
    item: OrderLineItem,
    currencyFormatter: NumberFormat,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onEditQty: () -> Unit,
    onRemove: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.product.name,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = CoffeeDarkRoast
                    )

                    // Hiển thị tóm tắt tùy chỉnh: Size S • 70% đường • 50% đá • Trân châu x2
                    Text(
                        text = item.getCustomizationSummary(),
                        fontSize = 11.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }

                // Tổng tiền của món này
                Text(
                    text = currencyFormatter.format(item.totalLinePrice),
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = CoffeeMocha
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Bộ điều khiển tăng giảm số lượng trực tiếp trên từng món
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${currencyFormatter.format(item.unitPrice)} / ly",
                    fontSize = 11.sp,
                    color = Color.Gray
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(SurfaceOffWhite)
                ) {
                    // Nút trừ (-)
                    IconButton(onClick = onDecrease, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = Icons.Default.Remove,
                            contentDescription = "Giảm",
                            tint = TextPrimary,
                            modifier = Modifier.size(14.dp)
                        )
                    }

                    // Con số số lượng: Bấm trực tiếp để mở popup gõ số lượng lớn!
                    Surface(
                        color = Color.White,
                        shape = RoundedCornerShape(4.dp),
                        modifier = Modifier
                            .clickable(onClick = onEditQty)
                            .padding(horizontal = 4.dp)
                    ) {
                        Text(
                            text = "${item.quantity}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeMocha,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp)
                        )
                    }

                    // Nút cộng (+)
                    IconButton(onClick = onIncrease, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = "Tăng",
                            tint = TextPrimary,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }
        }
    }
}
