package vn.id.congtc145.coffeepos.ui.enrollment

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import vn.id.congtc145.coffeepos.domain.DeviceAccessBlock
import vn.id.congtc145.coffeepos.ui.theme.CoffeeCream

@Composable
fun DeviceAccessBlockedScreen(reason: DeviceAccessBlock, storeName: String, pendingCount: Int) {
    Box(Modifier.fillMaxSize().background(CoffeeCream).padding(40.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 640.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text("KAFFEIN · POS", style = MaterialTheme.typography.titleMedium)
            Text(if (reason == DeviceAccessBlock.REVOKED) "Thiết bị đã bị thu hồi" else "Thiết bị không còn quyền truy cập",
                style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(storeName, style = MaterialTheme.typography.titleLarge)
            Text("Máy đã dừng bán hàng. Vui lòng liên hệ Owner để đối soát và xử lý thiết bị.", style = MaterialTheme.typography.bodyLarge)
            Text("Đơn hàng, giỏ hàng và phiên quỹ trên máy vẫn được giữ nguyên. Không xóa dữ liệu hoặc cài lại ứng dụng.", style = MaterialTheme.typography.bodyLarge)
            Text(if (pendingCount < 0) "Đang kiểm tra dữ liệu chờ đồng bộ…" else "$pendingCount thao tác chưa đồng bộ được giữ trên máy.", style = MaterialTheme.typography.titleMedium)
        }
    }
}
