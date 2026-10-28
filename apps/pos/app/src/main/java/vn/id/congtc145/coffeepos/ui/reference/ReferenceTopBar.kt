package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.local.entity.RegisterSessionEntity

@Composable
internal fun ReferenceTopBar(
    title: String,
    storeName: String,
    cashierName: String,
    isOnline: Boolean?,
    pendingSyncCount: Int,
    registerSession: RegisterSessionEntity?,
    registerLoaded: Boolean,
    onRegisterClick: () -> Unit,
    onLeadingClick: () -> Unit,
    onLock: () -> Unit,
    checkout: Boolean = false
) {
    val preview = DesignPreviewMode.isActive(LocalContext.current)
    var clock by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val formatter = DateTimeFormatter.ofPattern("HH:mm")
        while (true) {
            clock = ZonedDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")).format(formatter)
            delay(10_000)
        }
    }
    BoxWithConstraints(Modifier.fillMaxWidth().height(76.dp).background(ReferenceStyle.header)) {
        // Keep the register action visible on the 1280px tablet without crowding the toolbar.
        val compact = maxWidth < 1360.dp
        Row(
            Modifier.fillMaxWidth().height(76.dp).padding(horizontal = if (compact) 12.dp else 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (compact) 9.dp else 14.dp)
        ) {
            IconButton(
                onClick = onLeadingClick,
                modifier = Modifier.size(48.dp).background(ReferenceStyle.tealDeep, RoundedCornerShape(13.dp))
            ) {
                Icon(
                    if (checkout) Icons.AutoMirrored.Filled.ArrowBack else Icons.Default.GridView,
                    contentDescription = if (checkout) "Quay lại bán hàng" else "Menu chức năng hệ thống",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
            androidx.compose.foundation.layout.Column(Modifier.width(if (compact) 150.dp else 205.dp)) {
                if (!checkout || preview) Text(if (preview) "POS · XEM TRƯỚC" else "POS",
                    color = Color(0xFF89B6AA), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(title, color = Color.White, fontSize = if (compact) 18.sp else 21.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
            Row(
                Modifier.width(if (compact) 170.dp else 228.dp)
                    .background(ReferenceStyle.headerChip, RoundedCornerShape(13.dp))
                    .padding(horizontal = 13.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(Modifier.size(10.dp).background(Color(0xFF8CE0AD), CircleShape))
                Text(storeName, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (!preview) {
                Row(
                    Modifier.background(
                        if (registerSession == null) Color(0xFF79562D) else ReferenceStyle.headerChip,
                        RoundedCornerShape(13.dp)
                    ).clickable(enabled = registerLoaded, onClick = onRegisterClick)
                        .padding(horizontal = 12.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp)
                ) {
                    Box(
                        Modifier.size(9.dp).background(
                            if (registerSession == null) Color(0xFFFFD78A) else Color(0xFF8CE0AD),
                            CircleShape
                        )
                    )
                    Text(
                        when {
                            !registerLoaded -> "Đang kiểm tra quỹ"
                            registerSession == null -> "Mở quỹ"
                            compact -> "Quỹ mở"
                            registerSession.actualCashVnd != null -> "Đang chốt quỹ"
                            else -> "Quỹ mở"
                        },
                        color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            if (!compact) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(if (isOnline == true) Icons.Default.Wifi else Icons.Default.WifiOff,
                        null, tint = if (isOnline == true) Color(0xFF9CDBCA) else Color(0xFFFFD78A),
                        modifier = Modifier.size(17.dp))
                    Text(if (isOnline == true) "Trực tuyến" else "Ngoại tuyến", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            } else {
                Icon(if (isOnline == true) Icons.Default.Wifi else Icons.Default.WifiOff,
                    contentDescription = if (isOnline == true) "Trực tuyến" else "Ngoại tuyến",
                    tint = if (isOnline == true) Color(0xFF9CDBCA) else Color(0xFFFFD78A),
                    modifier = Modifier.size(18.dp))
            }
            Row(
                Modifier.background(ReferenceStyle.headerChip, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                Icon(Icons.Default.Sync, null, tint = Color(0xFFA7E0D3), modifier = Modifier.size(17.dp))
                Text(if (pendingSyncCount == 0) "Đã đồng bộ" else "$pendingSyncCount chờ đồng bộ", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }
            Text(clock, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Row(
                Modifier.background(ReferenceStyle.headerChip, RoundedCornerShape(13.dp))
                    .padding(horizontal = 9.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(Modifier.size(29.dp).background(Color(0xFFD6E7DF), CircleShape), contentAlignment = Alignment.Center) {
                    Text(cashierName.split(' ').takeLast(2).mapNotNull { it.firstOrNull() }.joinToString("").uppercase().take(2), color = ReferenceStyle.header, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
                if (!compact) Text(cashierName, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            }
            IconButton(
                onClick = onLock,
                modifier = Modifier.size(48.dp).background(ReferenceStyle.headerChip, RoundedCornerShape(13.dp))
            ) { Icon(Icons.Default.Lock, contentDescription = "Khóa phiên thu ngân", tint = Color.White, modifier = Modifier.size(19.dp)) }
        }
    }
}
