package vn.id.congtc145.coffeepos.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeWarmBrown
import vn.id.congtc145.coffeepos.ui.theme.SuccessGreen
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun PosTopAppBar(
    storeAddressSummary: String = "59C Nguyễn Đình Chiểu, P. Võ Thị Sáu",
    deviceCode: String = "POS-01",
    cashierName: String,
    isOnline: Boolean? = null,
    pendingSyncCount: Int = 0,
    rejectedSyncCount: Int = 0,
    onNavigateToMenu: () -> Unit,
    onLockCashier: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    // Live clock formatted in Asia/Ho_Chi_Minh
    var currentTimeString by remember {
        mutableStateOf(
            ZonedDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh"))
                .format(DateTimeFormatter.ofPattern("HH:mm - dd/MM/yyyy", Locale.forLanguageTag("vi-VN")))
        )
    }

    LaunchedEffect(Unit) {
        val formatter = DateTimeFormatter.ofPattern("HH:mm - dd/MM/yyyy", Locale.forLanguageTag("vi-VN"))
        val zone = ZoneId.of("Asia/Ho_Chi_Minh")
        while (true) {
            currentTimeString = ZonedDateTime.now(zone).format(formatter)
            delay(10000L) // Cập nhật mỗi 10 giây
        }
    }

    Surface(
        color = CoffeeDarkRoast,
        shadowElevation = 4.dp,
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            // CỤM 1 (BÊN TRÁI): ICON LOGOUT + TÊN NHÂN VIÊN
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Nút Đăng xuất / Khóa ca
                IconButton(
                    onClick = onLockCashier,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(CoffeeWarmBrown.copy(alpha = 0.5f))
                ) {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = "Khóa phiên thu ngân",
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }

                // Avatar + Tên nhân viên thu ngân
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(CoffeeWarmBrown.copy(alpha = 0.4f))
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(26.dp)
                            .clip(CircleShape)
                            .background(CoffeeAmber),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = cashierName.take(1),
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = cashierName,
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            // CỤM 2 (TRUNG TÂM): TÓM TẮT ĐỊA CHỈ CHI NHÁNH + SỐ MÁY POS
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(CoffeeWarmBrown.copy(alpha = 0.35f))
                    .padding(horizontal = 12.dp, vertical = 7.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Storefront,
                    contentDescription = "Chi nhánh",
                    tint = CoffeeAmber,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = "$storeAddressSummary • $deviceCode",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 0.2.sp
                )
            }

            // CỤM 3 (BÊN PHẢI): NGÀY GIỜ + TRẠNG THÁI MẠNG & SYNC + ICON MENU
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Ngày giờ thời gian thực (Live Clock)
                Text(
                    text = currentTimeString,
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Normal
                )

                // Trạng thái mạng & Đồng bộ Outbox (Sync Status)
                Surface(
                    color = CoffeeWarmBrown.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(if (rejectedSyncCount > 0) CoffeeAmber else if (isOnline == true) SuccessGreen else Color.Gray)
                        )
                        val syncText = when {
                            rejectedSyncCount > 0 -> "Cần đối soát ($rejectedSyncCount lỗi)"
                            isOnline == false && pendingSyncCount > 0 -> "Ngoại tuyến ($pendingSyncCount chờ)"
                            isOnline == false -> "Ngoại tuyến"
                            pendingSyncCount > 0 -> "Chờ đồng bộ ($pendingSyncCount)"
                            else -> "Không có đơn chờ"
                        }
                        Text(
                            text = syncText,
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                // Nút Menu chức năng POS (Grid 6 ô)
                IconButton(
                    onClick = onNavigateToMenu,
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(CoffeeAmber)
                ) {
                    Icon(
                        imageVector = Icons.Default.GridView,
                        contentDescription = "Menu chức năng",
                        tint = Color.White,
                        modifier = Modifier.size(22.dp)
                    )
                }
            }
        }
    }
}
