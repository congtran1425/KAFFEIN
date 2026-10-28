package vn.id.congtc145.coffeepos.ui.receipt

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.map
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.ui.components.PosUtilityScaffold
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.SuccessGreen
import vn.id.congtc145.coffeepos.ui.theme.SuccessGreenLight
import vn.id.congtc145.coffeepos.ui.theme.SurfaceWhite
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary

@Composable
fun ReceiptScreen(
    receiptId: String,
    onNewOrder: () -> Unit,
    onBack: () -> Unit,
    onOpenHistory: (String) -> Unit,
    fromHistory: Boolean = false
) {
    val context = LocalContext.current
    val flow = remember(receiptId) { AppDatabase.getDatabase(context).salesDao().observeSale(receiptId) }
    val receiptState by remember(flow) { flow.map { true to it } }
        .collectAsState(initial = false to null)
    val storeId = remember(context) { DeviceCredentialStore(context).load()?.storeId }
    PosUtilityScaffold(if (fromHistory) "Xem biên lai" else "Thanh toán thành công", onBack) {
        val current = receiptState.second?.takeIf { it.status == "PAID" && it.storeId == storeId }
        if (current == null) {
            Text(if (receiptState.first) "Không tìm thấy biên lai đã thanh toán."
                else "Đang tải biên lai trên thiết bị…", color = TextSecondary)
            OutlinedButton(onClick = onBack) { Text("Quay lại") }
            return@PosUtilityScaffold
        }
        Text(if (fromHistory) "Biên lai đã thanh toán" else "Thanh toán thành công",
            style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
            color = CoffeeDarkRoast)
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth >= 800.dp
            if (wide) {
                Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                    Surface(Modifier.weight(1f).fillMaxHeight(), color = SurfaceWhite,
                        shape = MaterialTheme.shapes.large) {
                        ReceiptDetails(current, Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp))
                    }
                    ReceiptActions(current, fromHistory, onNewOrder, onBack, onOpenHistory,
                        Modifier.width(280.dp))
                }
            } else {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Surface(color = SurfaceWhite, shape = MaterialTheme.shapes.large) {
                        ReceiptDetails(current, Modifier.fillMaxWidth().padding(20.dp))
                    }
                    ReceiptActions(current, fromHistory, onNewOrder, onBack, onOpenHistory,
                        Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun ReceiptActions(
    sale: SaleEntity,
    fromHistory: Boolean,
    onNewOrder: () -> Unit,
    onBack: () -> Unit,
    onOpenHistory: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(color = SuccessGreenLight,
            shape = MaterialTheme.shapes.large) {
            Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("ĐÃ THANH TOÁN", color = SuccessGreen, style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold)
                Text(moneyVnd(sale.totalVnd), color = CoffeeDarkRoast,
                    style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(if (sale.paymentMethod == "CASH") "Tiền thừa ${moneyVnd(sale.changeVnd)}"
                    else "Qua ${if (sale.paymentMethod == "MOMO") "MoMo" else "ZaloPay"}", color = TextSecondary)
            }
        }
        if (fromHistory) {
            Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Về lịch sử hóa đơn") }
        } else {
            Button(onClick = onNewOrder, modifier = Modifier.fillMaxWidth()) { Text("Bắt đầu đơn mới") }
        }
        ReceiptPdfAction(sale, Modifier.fillMaxWidth())
        if (!fromHistory) {
            OutlinedButton(onClick = { onOpenHistory(sale.id) }, modifier = Modifier.fillMaxWidth()) {
                Text("Xem lịch sử hóa đơn")
            }
        }
    }
}
