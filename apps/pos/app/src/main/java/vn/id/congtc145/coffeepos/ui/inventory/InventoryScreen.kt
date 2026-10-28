package vn.id.congtc145.coffeepos.ui.inventory

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import vn.id.congtc145.coffeepos.data.local.entity.StockBalanceDisplayItem
import vn.id.congtc145.coffeepos.ui.components.PosUtilityScaffold
import vn.id.congtc145.coffeepos.ui.theme.*
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InventoryScreen(onBack: () -> Unit, onOpenSync: () -> Unit, viewModel: InventoryViewModel = viewModel()) {
    val balances by viewModel.balances.collectAsState()
    val error by viewModel.error.collectAsState()
    var search by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("ALL") }
    val visible = balances.orEmpty().filter { item ->
        val amount = item.quantity?.toBigDecimalOrNull()
        val matches = item.name.contains(search.trim(), true) || item.code.contains(search.trim(), true)
        matches && when (filter) {
            "ZERO" -> amount?.signum() == 0
            "UNKNOWN" -> amount == null
            else -> true
        }
    }
    PosUtilityScaffold("Tồn kho nguyên liệu", onBack, actions = {
        TextButton(onClick = onOpenSync) { Text("Xem đồng bộ", color = SurfaceWhite) }
    }) {
        Text("Số dư trên thiết bị", style = MaterialTheme.typography.labelMedium, color = TextSecondary)
        OutlinedTextField(
            value = search, onValueChange = { search = it }, label = { Text("Tìm tên hoặc mã nguyên liệu") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = CoffeeBronze, unfocusedBorderColor = CoffeeCardBorder, focusedLabelColor = CoffeeMocha, cursorColor = CoffeeMocha)
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("ALL" to "Tất cả", "ZERO" to "Hết hàng", "UNKNOWN" to "Chưa có số dư").forEach { (id, label) ->
                FilterChip(selected = filter == id, onClick = { filter = id }, label = { Text(label) })
            }
        }
        when {
            error != null -> Text(error!!, color = ErrorCrimson)
            balances == null -> Text("Đang đọc kho local…", color = TextSecondary)
            balances.orEmpty().isEmpty() -> InventoryEmpty("Chưa có dữ liệu nguyên liệu trên thiết bị.")
            visible.isEmpty() -> {
                InventoryEmpty("Không tìm thấy nguyên liệu phù hợp.")
                OutlinedButton(onClick = { search = ""; filter = "ALL" }) { Text("Xóa điều kiện lọc") }
            }
            else -> BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                val wide = maxWidth >= 700.dp
                LazyColumn(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    if (wide) item { InventoryTableHeader() }
                    items(visible, key = { it.id }) { item -> InventoryItemRow(item, wide) }
                }
            }
        }
        Text("${visible.size} nguyên liệu", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
    }
}

@Composable
private fun InventoryTableHeader() {
    Surface(color = CoffeeCreamSurface, shape = MaterialTheme.shapes.small) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("NGUYÊN LIỆU", Modifier.weight(2f), style = MaterialTheme.typography.labelSmall)
            Text("MÃ", Modifier.weight(1.4f), style = MaterialTheme.typography.labelSmall)
            Text("ĐƠN VỊ", Modifier.weight(.6f), style = MaterialTheme.typography.labelSmall)
            Text("SỐ DƯ", Modifier.weight(.8f), style = MaterialTheme.typography.labelSmall,
                textAlign = androidx.compose.ui.text.style.TextAlign.End)
        }
    }
}

@Composable
private fun InventoryItemRow(item: StockBalanceDisplayItem, wide: Boolean) {
    val amount = item.quantity?.toBigDecimalOrNull()
    val unknown = amount == null
    val invalid = amount?.signum() == -1
    val zero = amount?.signum() == 0
    val formatted = if (unknown) "Chưa có số dư" else if (invalid) "Số dư không hợp lệ" else {
        NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN"))
            .apply { maximumFractionDigits = 20 }.format(amount!!) + " ${item.baseUnit}"
    }
    Surface(color = if (zero || unknown || invalid) WarningOrangeLight else SurfaceWhite) {
        if (wide) {
            Row(Modifier.fillMaxWidth().heightIn(min = 54.dp).padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text(item.name, Modifier.weight(2f), fontWeight = FontWeight.SemiBold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis, color = TextPrimary)
                Text(item.code, Modifier.weight(1.4f), style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(item.baseUnit, Modifier.weight(.6f), color = TextSecondary)
                Text(formatted, Modifier.weight(.8f), fontWeight = FontWeight.Bold,
                    textAlign = androidx.compose.ui.text.style.TextAlign.End, color = CoffeeDarkRoast)
            }
        } else {
            Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(item.name, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                    Text(item.code, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
                Text(formatted, fontWeight = FontWeight.Bold, color = CoffeeDarkRoast)
            }
        }
    }
}

@Composable
private fun InventoryEmpty(message: String) {
    Text(message, modifier = Modifier.fillMaxWidth().padding(24.dp), color = TextSecondary)
}
