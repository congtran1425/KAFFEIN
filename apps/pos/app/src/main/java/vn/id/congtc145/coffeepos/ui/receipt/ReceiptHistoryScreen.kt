package vn.id.congtc145.coffeepos.ui.receipt

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.map
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.ui.components.PosUtilityScaffold
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import vn.id.congtc145.coffeepos.ui.theme.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun ReceiptHistoryScreen(
    onOpenReceipt: (String) -> Unit,
    onBack: () -> Unit,
    initialSelectedReceiptId: String? = null
) {
    val context = LocalContext.current
    val flow = remember { AppDatabase.getDatabase(context).salesDao().observePaidSales() }
    val historyState by remember(flow) { flow.map { true to it } }
        .collectAsState(initial = false to emptyList())
    val localSales = historyState.second
    val storeId = remember(context) { DeviceCredentialStore(context).load()?.storeId }
    val sales = remember(localSales, storeId) { localSales.filter { it.storeId == storeId } }
    var query by rememberSaveable { mutableStateOf("") }
    var period by rememberSaveable { mutableStateOf(if (initialSelectedReceiptId.isNullOrBlank()) "TODAY" else "ALL") }
    var selectedId by rememberSaveable { mutableStateOf(initialSelectedReceiptId) }
    val zone = remember { ZoneId.of("Asia/Ho_Chi_Minh") }
    val today = LocalDate.now(zone)
    val namesBySale = remember(sales) { sales.associate { sale ->
        sale.id to OrderJsonSerializer.deserializeOrderItems(sale.itemsJson).joinToString(" ") { it.product.name }
    } }
    val visible = remember(sales, query, period, today, namesBySale) {
        sales.filter { sale ->
            val date = Instant.ofEpochMilli(sale.completedAt).atZone(zone).toLocalDate()
            val inPeriod = when (period) {
                "TODAY" -> date == today
                "WEEK" -> !date.isBefore(today.minusDays(6)) && !date.isAfter(today)
                else -> true
            }
            inPeriod && (query.isBlank() || sale.saleNumber.contains(query.trim(), ignoreCase = true) ||
                namesBySale[sale.id].orEmpty().contains(query.trim(), ignoreCase = true))
        }
    }
    val selected = visible.firstOrNull { it.id == selectedId } ?: visible.firstOrNull()

    PosUtilityScaffold("Lịch sử hóa đơn", onBack) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth >= 800.dp
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(value = query, onValueChange = { query = it },
                        label = { Text("Tìm mã biên lai hoặc tên món") }, singleLine = true,
                        modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("TODAY" to "Hôm nay", "WEEK" to "7 ngày", "ALL" to "Tất cả").forEach { (id, label) ->
                            FilterChip(selected = period == id, onClick = { period = id }, label = { Text(label) })
                        }
                    }
                    when {
                        !historyState.first -> Text("Đang tải lịch sử trên thiết bị…", color = TextSecondary)
                        sales.isEmpty() -> HistoryEmpty("Chưa có giao dịch đã thanh toán.", onBack, "Về bán hàng")
                        visible.isEmpty() -> HistoryEmpty("Không tìm thấy giao dịch.",
                            onAction = { query = ""; period = "ALL" }, actionLabel = "Xóa điều kiện lọc")
                        else -> LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(visible, key = { it.id }) { sale ->
                                HistoryRow(sale, selected?.id == sale.id && wide) {
                                    if (wide) selectedId = sale.id else onOpenReceipt(sale.id)
                                }
                            }
                        }
                    }
                    Text("${visible.size} giao dịch", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
                if (wide) {
                    Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (selected == null) {
                            Surface(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, color = SurfaceWhite) {
                                Text("Chọn một giao dịch để xem chi tiết.", Modifier.padding(24.dp), color = TextSecondary)
                            }
                        } else {
                            Surface(Modifier.weight(1f).fillMaxWidth(), shape = MaterialTheme.shapes.large,
                                color = SurfaceWhite) {
                                ReceiptDetails(selected, Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp))
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.Top) {
                                Button(onClick = { onOpenReceipt(selected.id) }, modifier = Modifier.weight(1f)) {
                                    Text("Mở biên lai")
                                }
                                ReceiptPdfAction(selected, Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryRow(sale: SaleEntity, selected: Boolean, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = if (selected) SuccessGreenLight else SurfaceWhite,
        border = androidx.compose.foundation.BorderStroke(1.dp,
            if (selected) SuccessGreen else CoffeeCardBorder)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(sale.saleNumber, color = CoffeeDarkRoast, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${receiptTime(sale.completedAt)} · Đã thanh toán",
                    color = TextSecondary, style = MaterialTheme.typography.bodySmall)
            }
            Text(moneyVnd(sale.totalVnd), color = CoffeeDarkRoast, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun HistoryEmpty(message: String, onAction: () -> Unit, actionLabel: String) {
    Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = TextSecondary)
        OutlinedButton(onClick = onAction) { Text(actionLabel) }
    }
}
