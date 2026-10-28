package vn.id.congtc145.coffeepos.ui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.ChangeCircle
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.PointOfSale
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCream
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeMocha
import vn.id.congtc145.coffeepos.ui.theme.CoffeeWarmBrown
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import vn.id.congtc145.coffeepos.ui.theme.WarningOrange
import vn.id.congtc145.coffeepos.ui.theme.InfoBlue

data class PosFunctionItem(
    val id: String,
    val title: String,
    val description: String,
    val icon: ImageVector,
    val accentColor: Color,
    val badge: String? = null,
    val enabled: Boolean = true
)

@Composable
fun FunctionsMenuScreen(
    onNavigateBackToOrder: () -> Unit,
    onNavigateToAttendance: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onNavigateToReceiptHistory: () -> Unit,
    onNavigateToSync: () -> Unit,
    onNavigateToInventory: () -> Unit
) {
    val functionItems = listOf(
        PosFunctionItem(
            id = "order",
            title = "Bán hàng",
            description = "Trang tạo order, thêm món và thanh toán",
            icon = Icons.Default.PointOfSale,
            accentColor = CoffeeAmber
        ),
        PosFunctionItem(
            id = "attendance",
            title = "Attendance",
            description = "Vào ca, Ra ca bằng mã nhân viên và PIN",
            icon = Icons.Default.Badge,
            accentColor = Color(0xFF10B981)
        ),
        PosFunctionItem(
            id = "receipts",
            title = "Lịch sử hóa đơn",
            description = "Xem lại giao dịch đã thanh toán và xuất PDF",
            icon = Icons.AutoMirrored.Filled.ReceiptLong,
            accentColor = Color(0xFF0F766E)
        ),
        PosFunctionItem(
            id = "shift",
            title = "Bàn giao ca làm việc",
            description = "Đối soát tiền mặt, đóng ca và in phiếu ca",
            icon = Icons.Default.ChangeCircle,
            accentColor = Color(0xFF3B82F6),
            badge = "Bắt buộc"
        ),
        PosFunctionItem(
            id = "inventory",
            title = "Kiểm tra tồn kho",
            description = "Xem mức nguyên liệu cà phê, sữa, đường",
            icon = Icons.Default.Inventory,
            accentColor = WarningOrange
        ),
        PosFunctionItem(
            id = "sync",
            title = "Đồng bộ hóa dữ liệu",
            description = "Hàng đợi đồng bộ Outbox với máy chủ",
            icon = Icons.Default.Sync,
            accentColor = InfoBlue
        ),
        PosFunctionItem(
            id = "settings",
            title = "Cài đặt thiết bị & Máy in",
            description = "Cấu hình thiết bị POS, máy in nhiệt 80mm",
            icon = Icons.Default.Settings,
            accentColor = CoffeeMocha,
            badge = "Đang phát triển",
            enabled = false
        )
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CoffeeCream)
    ) {
        // TOP BAR
        Surface(
            color = CoffeeDarkRoast,
            shadowElevation = 4.dp,
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBackToOrder) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Quay lại",
                        tint = Color.White
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Text(
                    text = "MENU CHỨC NĂNG HỆ THỐNG",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
            }
        }

        // GRID 6 CHỨC NĂNG
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            contentPadding = PaddingValues(24.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 40.dp)
        ) {
            items(functionItems, key = { it.id }) { item ->
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp)
                        .clickable(enabled = item.enabled) {
                            when (item.id) {
                                "order" -> onNavigateBackToOrder()
                                "attendance" -> onNavigateToAttendance()
                                "shift" -> onNavigateToRegister()
                                "receipts" -> onNavigateToReceiptHistory()
                                "sync" -> onNavigateToSync()
                                "inventory" -> onNavigateToInventory()
                                else -> Unit
                            }
                        }
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(20.dp),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(item.accentColor.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = item.icon,
                                    contentDescription = item.title,
                                    tint = item.accentColor,
                                    modifier = Modifier.size(28.dp)
                                )
                            }

                            item.badge?.let { badgeText ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFDCFCE7),
                                    modifier = Modifier.padding(top = 2.dp)
                                ) {
                                    Text(
                                        text = badgeText,
                                        color = Color(0xFF16A34A),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }

                        Column {
                            Text(
                                text = item.title,
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = item.description,
                                fontSize = 12.sp,
                                color = TextSecondary,
                                lineHeight = 16.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
