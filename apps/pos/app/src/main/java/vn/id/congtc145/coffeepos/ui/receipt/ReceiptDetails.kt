package vn.id.congtc145.coffeepos.ui.receipt

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val businessTime = DateTimeFormatter.ofPattern("HH:mm · dd/MM/yyyy")
    .withZone(ZoneId.of("Asia/Ho_Chi_Minh"))

internal fun moneyVnd(value: Long): String =
    NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN")).format(value) + " đ"

internal fun receiptTime(epochMillis: Long): String = businessTime.format(Instant.ofEpochMilli(epochMillis))

/** One immutable sale snapshot for both the payment result and historical preview. */
@Composable
fun ReceiptDetails(sale: SaleEntity, modifier: Modifier = Modifier) {
    val lines = remember(sale.itemsJson) { OrderJsonSerializer.deserializeOrderItems(sale.itemsJson) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("BIÊN LAI BÁN HÀNG", style = MaterialTheme.typography.labelMedium, color = TextSecondary)
        Text("#${sale.saleNumber}", style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold, color = CoffeeDarkRoast)
        Text("${sale.storeName}  ·  ${receiptTime(sale.completedAt)}",
            style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
        Text("Thu ngân: ${sale.cashierName}", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        HorizontalDivider()
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("MÓN ĐÃ BÁN", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
            Text("THÀNH TIỀN", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
        }
        lines.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text("${item.quantity} × ${item.product.name}", fontWeight = FontWeight.SemiBold,
                        color = CoffeeDarkRoast)
                    Text(item.getCustomizationSummary().replace("Note:", "Ghi chú:"),
                        style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
                Text(moneyVnd(item.totalLinePrice), fontWeight = FontWeight.SemiBold,
                    color = CoffeeDarkRoast, textAlign = TextAlign.End)
            }
        }
        HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
        ReceiptAmountRow("Tạm tính", moneyVnd(sale.subtotalVnd))
        ReceiptAmountRow("VAT đã gồm", moneyVnd(sale.taxVnd))
        HorizontalDivider()
        ReceiptAmountRow("Tổng thanh toán", moneyVnd(sale.totalVnd), prominent = true)
        HorizontalDivider()
        if (sale.paymentMethod == "CASH") {
            Text("THANH TOÁN TIỀN MẶT", style = MaterialTheme.typography.labelMedium, color = TextSecondary)
            ReceiptAmountRow("Khách đưa", moneyVnd(sale.cashReceivedVnd))
            ReceiptAmountRow("Tiền thừa", moneyVnd(sale.changeVnd))
        } else {
            ReceiptAmountRow("Thanh toán", if (sale.paymentMethod == "MOMO") "MoMo" else "ZaloPay")
        }
    }
}

@Composable
private fun ReceiptAmountRow(label: String, amount: String, prominent: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), color = if (prominent) CoffeeDarkRoast else TextSecondary,
            fontWeight = if (prominent) FontWeight.Bold else FontWeight.Normal)
        Text(amount, color = CoffeeDarkRoast, textAlign = TextAlign.End,
            style = if (prominent) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold)
    }
}

@Composable
fun ReceiptPdfAction(sale: SaleEntity, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var exporting by remember(sale.id) { mutableStateOf(false) }
    var result by remember(sale.id) { mutableStateOf<String?>(null) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedButton(
            modifier = Modifier.fillMaxWidth(), enabled = !exporting,
            onClick = {
                exporting = true
                result = null
                scope.launch {
                    result = runCatching {
                        withContext(Dispatchers.IO) { ReceiptPdfExporter.export(context, sale) }
                    }.fold(
                        onSuccess = { "Đã lưu biên lai PDF." },
                        onFailure = { it.message ?: "Không thể xuất biên lai PDF." }
                    )
                    exporting = false
                }
            }
        ) { Text(if (exporting) "Đang xuất PDF…" else "Xuất biên lai PDF") }
        result?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = TextSecondary) }
    }
}
