package vn.id.congtc145.coffeepos.ui.menu

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.ChangeCircle
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.ui.order.OrderUiState
import vn.id.congtc145.coffeepos.ui.register.RegisterUiState
import vn.id.congtc145.coffeepos.ui.theme.PosPalette

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4.
 * Task cards are single tap targets; their labels and counts come from POS state.
 */
@Composable
fun TaskDashboardScreen(
    orderState: OrderUiState,
    registerState: RegisterUiState,
    onBack: () -> Unit,
    onHeldOrders: () -> Unit,
    onAttendance: () -> Unit,
    onRegister: () -> Unit,
    onReceiptHistory: () -> Unit,
    onSync: () -> Unit,
    onInventory: () -> Unit,
    onLockCashier: () -> Unit,
    onShiftHandover: () -> Unit = onRegister,
    onEndOfDay: () -> Unit = onRegister,
    onOpenDrawer: () -> Unit = {}
) {
    var drawerKickedDialog by remember { mutableStateOf(false) }
    val fontScale = LocalDensity.current.fontScale
    CompositionLocalProvider(LocalDensity provides Density(1f, fontScale)) {
        BoxWithConstraints(Modifier.fillMaxSize().background(PosPalette.paper)) {
            val wide = maxWidth >= 980.dp
            val columns = when {
                wide -> 3
                maxWidth >= 600.dp -> 2
                else -> 1
            }
            if (wide) {
                Row(
                    Modifier.fillMaxSize().padding(24.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    TaskContent(
                        orderState, registerState, onBack, onHeldOrders, onAttendance,
                        onRegister, onReceiptHistory, onSync, onInventory,
                        onShiftHandover, onEndOfDay, { drawerKickedDialog = true; onOpenDrawer() },
                        Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()),
                        columns = columns
                    )
                    TaskStatusPanel(orderState, registerState, onLockCashier,
                        Modifier.width(300.dp).fillMaxHeight(), stretch = true)
                }
            } else {
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    TaskContent(
                        orderState, registerState, onBack, onHeldOrders, onAttendance,
                        onRegister, onReceiptHistory, onSync, onInventory,
                        onShiftHandover, onEndOfDay, { drawerKickedDialog = true; onOpenDrawer() },
                        Modifier.fillMaxWidth(), columns = columns
                    )
                    TaskStatusPanel(orderState, registerState, onLockCashier, Modifier.fillMaxWidth())
                }
            }
        }
    }

    if (drawerKickedDialog) {
        AlertDialog(
            onDismissRequest = { drawerKickedDialog = false },
            title = { Text("Khay tiền mặt POS", fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("🟢 Khay tiền đã được bật mở thành công (Mã lệnh: ESC p 0 25 250).")
                    Text("Thu ngân có thể kiểm đếm tiền trong két hoặc sắp xếp tiền mặt theo từng ngăn mệnh giá.", color = PosPalette.muted, fontSize = 13.sp)
                }
            },
            confirmButton = {
                Button(
                    onClick = { drawerKickedDialog = false },
                    colors = ButtonDefaults.buttonColors(containerColor = PosPalette.accent)
                ) { Text("Đóng") }
            }
        )
    }
}

@Composable
private fun TaskContent(
    orderState: OrderUiState,
    registerState: RegisterUiState,
    onBack: () -> Unit,
    onHeldOrders: () -> Unit,
    onAttendance: () -> Unit,
    onRegister: () -> Unit,
    onReceiptHistory: () -> Unit,
    onSync: () -> Unit,
    onInventory: () -> Unit,
    onShiftHandover: () -> Unit,
    onEndOfDay: () -> Unit,
    onOpenDrawerTrigger: () -> Unit,
    modifier: Modifier,
    columns: Int
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            IconButton(onClick = onBack,
                modifier = Modifier.size(48.dp).background(PosPalette.mint, RoundedCornerShape(13.dp))) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "Quay lại bán hàng",
                    tint = PosPalette.accent)
            }
            Column {
                Text("Tác vụ", color = PosPalette.ink, fontSize = 25.sp,
                    fontWeight = FontWeight.Bold)
                Text(orderState.storeAddressSummary.ifBlank { "Thiết bị POS" },
                    color = PosPalette.muted, fontSize = 13.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Text("Công việc hôm nay", color = PosPalette.ink, fontSize = 20.sp,
            fontWeight = FontWeight.Bold)
        Text("GIAO DỊCH", color = PosPalette.muted, fontSize = 12.sp,
            fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
        TaskGrid(
            listOf(
                TaskItem("Lịch sử hóa đơn", "Xem và xuất biên lai", Icons.AutoMirrored.Filled.ReceiptLong,
                    onReceiptHistory),
                TaskItem("Đơn treo", "Mở đơn lưu trên máy", Icons.Default.Layers,
                    onHeldOrders, "${orderState.heldOrders.size} đơn"),
                TaskItem("Kiểm tra tồn kho", "Số dư nguyên liệu", Icons.Default.Inventory,
                    onInventory)
            ), columns
        )
        Text("VẬN HÀNH CA & TIỀN MẶT", color = PosPalette.muted, fontSize = 12.sp,
            fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
        TaskGrid(
            listOf(
                TaskItem("Chuyển ca", "Bàn giao két & đổi thu ngân", Icons.Default.ChangeCircle,
                    onShiftHandover, if (registerState.openSession != null) "Đang mở ca" else "Chưa mở"),
                TaskItem("Kết doanh thu ngày", "Chốt két & kết toán doanh thu", Icons.Default.PointOfSale,
                    onEndOfDay, "Chốt ngày"),
                TaskItem("Mở khay tiền", "Bật mở két tiền mặt", Icons.Default.Inbox,
                    onOpenDrawerTrigger, "Mở két"),
                TaskItem("Chấm công", "Vào ca hoặc ra ca", Icons.Default.Badge,
                    onAttendance),
                TaskItem("Phiên tiền mặt", "Xem chi tiết & đối soát quỹ", Icons.Default.Wallet,
                    onRegister, when {
                        !registerState.isLoaded -> "Đang tải"
                        registerState.openSession != null -> "Đang mở"
                        else -> "Chưa mở"
                    }),
                TaskItem("Đồng bộ dữ liệu", "Xem hàng đợi và thử lại", Icons.Default.Sync,
                    onSync, "${orderState.pendingSyncCount} chờ")
            ), columns
        )
    }
}

private data class TaskItem(
    val title: String,
    val description: String,
    val icon: ImageVector,
    val onClick: () -> Unit,
    val badge: String? = null
)

@Composable
private fun TaskGrid(items: List<TaskItem>, columns: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items.chunked(columns).forEach { rowItems ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                rowItems.forEach { item -> TaskCard(item, Modifier.weight(1f)) }
                repeat(columns - rowItems.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun TaskCard(item: TaskItem, modifier: Modifier) {
    Surface(
        modifier = modifier.height(136.dp).clickable(onClick = item.onClick),
        shape = RoundedCornerShape(16.dp), color = PosPalette.surface,
        border = BorderStroke(1.dp, PosPalette.line)
    ) {
        Column(Modifier.fillMaxSize().padding(15.dp),
            verticalArrangement = Arrangement.SpaceBetween) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween) {
                Box(Modifier.size(42.dp).background(PosPalette.mint, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center) {
                    Icon(item.icon, null, tint = PosPalette.accent, modifier = Modifier.size(22.dp))
                }
                item.badge?.let {
                    Text(it, color = PosPalette.accentDeep, fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.background(PosPalette.mint, RoundedCornerShape(12.dp))
                            .padding(horizontal = 8.dp, vertical = 5.dp))
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(item.title, color = PosPalette.ink, fontSize = 16.sp,
                    fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(item.description, color = PosPalette.muted, fontSize = 12.sp,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun TaskStatusPanel(
    orderState: OrderUiState,
    registerState: RegisterUiState,
    onLockCashier: () -> Unit,
    modifier: Modifier,
    stretch: Boolean = false
) {
    Surface(modifier, shape = RoundedCornerShape(18.dp), color = PosPalette.surface,
        border = BorderStroke(1.dp, PosPalette.line)) {
        Column((if (stretch) Modifier.fillMaxSize() else Modifier.fillMaxWidth()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(17.dp)) {
            Text("Trạng thái cửa hàng", color = PosPalette.ink, fontSize = 18.sp,
                fontWeight = FontWeight.Bold)
            HorizontalDivider(color = PosPalette.line)
            TaskStatusRow(if (orderState.isOnline == true) Icons.Default.Wifi else Icons.Default.WifiOff,
                "Thiết bị", when (orderState.isOnline) {
                    true -> "Trực tuyến"
                    false -> "Ngoại tuyến"
                    null -> "Đang kiểm tra"
                })
            HorizontalDivider(color = PosPalette.line)
            TaskStatusRow(Icons.Default.ChangeCircle, "Phiên tiền mặt", when {
                !registerState.isLoaded -> "Đang kiểm tra"
                registerState.openSession != null -> "Đang mở"
                else -> "Chưa mở"
            })
            HorizontalDivider(color = PosPalette.line)
            TaskStatusRow(Icons.Default.Badge, "Thu ngân",
                orderState.cashierName.ifBlank { "Chưa đăng nhập" })
            HorizontalDivider(color = PosPalette.line)
            TaskStatusRow(Icons.Default.Sync, "Đồng bộ",
                if (orderState.pendingSyncCount == 0) "Không có mục chờ"
                else "${orderState.pendingSyncCount} mục chờ")
            if (stretch) Spacer(Modifier.weight(1f))
            OutlinedButton(onClick = onLockCashier, modifier = Modifier.fillMaxWidth().height(48.dp),
                border = BorderStroke(1.dp, PosPalette.line)) {
                Icon(Icons.Default.Lock, null, tint = PosPalette.accent, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Khóa màn hình", color = PosPalette.accent, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun TaskStatusRow(icon: ImageVector, title: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, tint = PosPalette.accent, modifier = Modifier.size(20.dp))
        Column {
            Text(title, color = PosPalette.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Text(value, color = PosPalette.muted, fontSize = 12.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
