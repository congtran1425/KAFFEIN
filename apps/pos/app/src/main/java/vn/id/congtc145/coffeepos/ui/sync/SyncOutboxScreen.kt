package vn.id.congtc145.coffeepos.ui.sync

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.ui.components.PosUtilityScaffold
import vn.id.congtc145.coffeepos.ui.theme.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun SyncOutboxScreen(onBack: () -> Unit, viewModel: SyncOutboxViewModel = viewModel()) {
    val operations by viewModel.operations.collectAsState()
    val feedback by viewModel.feedback.collectAsState()
    val error by viewModel.error.collectAsState()
    val workState by viewModel.workState.collectAsState()
    var filter by rememberSaveable { mutableStateOf("ALL") }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    val formatter = remember { DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy").withZone(ZoneId.of("Asia/Ho_Chi_Minh")) }
    val all = operations.orEmpty()
    val visible = all.filter { filter == "ALL" || it.status == filter }
    val selected = visible.firstOrNull { it.operationId == selectedId } ?: visible.firstOrNull()
    val pending = all.count { it.status == "PENDING" }
    val failed = all.count { it.status == "FAILED" }
    val rejected = all.count { it.status == "REJECTED" }
    val synced = all.count { it.status == "SYNCED" }
    PosUtilityScaffold("Đồng bộ dữ liệu", onBack, actions = {
        TextButton(onClick = viewModel::syncNow, enabled = workState == SyncWorkState.IDLE) {
            Text(when (workState) {
                SyncWorkState.IDLE -> "Đồng bộ ngay"
                SyncWorkState.QUEUED -> "Đã xếp lịch"
                SyncWorkState.RUNNING -> "Đang đồng bộ…"
            }, color = SurfaceWhite)
        }
    }) {
        Surface(color = if (failed + rejected > 0) WarningOrangeLight else SuccessGreenLight,
            shape = MaterialTheme.shapes.large) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (failed + rejected > 0) "CÓ MỤC CẦN XỬ LÝ" else "TRẠNG THÁI ĐỒNG BỘ",
                    style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Text(when {
                    error != null -> "Không thể đọc hoạt động đồng bộ"
                    operations == null -> "Đang đọc hoạt động trên thiết bị…"
                    failed + rejected > 0 -> "${failed + rejected} mục cần xử lý"
                    pending > 0 -> "$pending mục đang chờ gửi"
                    synced > 0 -> "$synced mục đã được máy chủ xác nhận"
                    else -> "Chưa có hoạt động đồng bộ"
                }, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                    color = CoffeeDarkRoast)
            }
        }
        SyncStatusCards(filter, pending, failed, rejected, synced) { filter = it }
        error?.let { Text(it, color = ErrorCrimson) }
        feedback?.let { Text(it, color = CoffeeBronze, style = MaterialTheme.typography.bodySmall) }
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val wide = maxWidth >= 800.dp
            Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("HOẠT ĐỘNG GẦN ĐÂY", style = MaterialTheme.typography.labelMedium,
                        color = TextSecondary, fontWeight = FontWeight.Bold)
                    when {
                        operations == null -> Text("Đang đọc hàng đợi từ thiết bị…", color = TextSecondary)
                        visible.isEmpty() -> Text("Không có mục trong nhóm này.",
                            modifier = Modifier.padding(16.dp), color = TextSecondary)
                        else -> LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(visible, key = { it.operationId }) { operation ->
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    SyncOperationRow(operation, selected?.operationId == operation.operationId && wide,
                                        formatter) {
                                        selectedId = if (!wide && selectedId == operation.operationId) null
                                            else operation.operationId
                                    }
                                    if (!wide && selectedId == operation.operationId) {
                                        SyncOperationDetails(operation, formatter, viewModel::syncNow)
                                    }
                                }
                            }
                        }
                    }
                    Text("${visible.size} mục", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
                if (wide) {
                    Column(Modifier.weight(.8f).fillMaxHeight()) {
                        if (selected == null) {
                            Text("Chọn một hoạt động để xem chi tiết.", color = TextSecondary)
                        } else {
                            SyncOperationDetails(selected, formatter, viewModel::syncNow)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncStatusCards(filter: String, pending: Int, failed: Int, rejected: Int,
                            synced: Int, onSelect: (String) -> Unit) {
    val cards = listOf("PENDING" to ("Chờ gửi" to pending),
        "FAILED" to ("Lỗi kết nối" to failed),
        "REJECTED" to ("Cần đối soát" to rejected),
        "SYNCED" to ("Đã đồng bộ" to synced))
    BoxWithConstraints {
        if (maxWidth >= 700.dp) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                cards.forEach { (id, pair) ->
                    SyncStatusCard(id, pair.first, pair.second, filter == id, Modifier.weight(1f)) {
                        onSelect(if (filter == id) "ALL" else id)
                    }
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                cards.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { (id, pair) ->
                            SyncStatusCard(id, pair.first, pair.second, filter == id, Modifier.weight(1f)) {
                                onSelect(if (filter == id) "ALL" else id)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SyncStatusCard(id: String, label: String, count: Int, selected: Boolean,
                           modifier: Modifier, onClick: () -> Unit) {
    Surface(modifier = modifier.heightIn(min = 76.dp).clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium, color = if (selected) SuccessGreenLight else SurfaceWhite,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) SuccessGreen else CoffeeCardBorder)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.Center) {
            Text(count.toString(), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold,
                color = if (id == "REJECTED" && count > 0) ErrorCrimson else CoffeeDarkRoast)
            Text(label, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        }
    }
}

private fun operationLabel(type: String): String = when (type) {
    "CASH_SALE_COMPLETED" -> "Hoàn tất bán tiền mặt"
    "REGISTER_SESSION_OPENED" -> "Mở phiên tiền mặt"
    "REGISTER_SESSION_CLOSED" -> "Đóng phiên tiền mặt"
    else -> type.replace('_', ' ').lowercase().replaceFirstChar { it.titlecase() }
}

private fun statusLabel(status: String): String = when (status) {
    "PENDING" -> "Chờ gửi"
    "FAILED" -> "Lỗi kết nối"
    "REJECTED" -> "Cần đối soát"
    "SYNCED" -> "Đã đồng bộ"
    else -> status
}

@Composable
private fun SyncOperationRow(operation: OutboxOperationEntity, selected: Boolean,
                             formatter: DateTimeFormatter, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium, color = if (selected) SuccessGreenLight else SurfaceWhite,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) SuccessGreen else CoffeeCardBorder)) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(operationLabel(operation.operationType), fontWeight = FontWeight.Bold, color = TextPrimary)
                Text(formatter.format(Instant.ofEpochMilli(operation.createdAt)),
                    style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
            Text(statusLabel(operation.status), style = MaterialTheme.typography.bodySmall,
                color = if (operation.status == "REJECTED") ErrorCrimson else CoffeeDarkRoast)
        }
    }
}

@Composable
private fun SyncOperationDetails(operation: OutboxOperationEntity, formatter: DateTimeFormatter,
                                 onRetry: () -> Unit) {
    Surface(shape = MaterialTheme.shapes.large, color = SurfaceWhite) {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("CHI TIẾT THAO TÁC", style = MaterialTheme.typography.labelMedium, color = TextSecondary)
            Text(operationLabel(operation.operationType), style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold, color = CoffeeDarkRoast)
            HorizontalDivider()
            Text("Trạng thái: ${statusLabel(operation.status)}")
            Text("Thời gian: ${formatter.format(Instant.ofEpochMilli(operation.createdAt))}")
            Text("Số lần thử: ${operation.attemptCount}")
            Text("Loại: ${operation.operationType}", style = MaterialTheme.typography.bodySmall)
            Text("Mã thao tác: ${operation.operationId}", style = MaterialTheme.typography.bodySmall)
            operation.lastError?.takeIf { it.isNotBlank() }?.let {
                Text("Lỗi cuối: $it", color = ErrorCrimson)
            }
            if (operation.status == "FAILED") {
                OutlinedButton(onClick = onRetry) { Text("Thử đồng bộ lại") }
            }
            if (operation.status == "REJECTED") {
                Text("Cần đối soát giao dịch với máy chủ trước khi tiếp tục xử lý.", color = ErrorCrimson)
            }
        }
    }
}
