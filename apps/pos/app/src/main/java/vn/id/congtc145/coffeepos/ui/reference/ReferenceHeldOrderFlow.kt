package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import vn.id.congtc145.coffeepos.data.local.entity.DraftOrderEntity
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import vn.id.congtc145.coffeepos.ui.order.OrderUiState
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** The visible code is derived from the immutable local draft ID, never from list position. */
internal fun draftDisplayCode(id: String): String =
    if (id.startsWith("T-") && id.drop(2).all(Char::isDigit))
        "#T-${id.drop(2).toLongOrNull()?.toString()?.padStart(3, '0') ?: id.drop(2)}"
    else "#T-${id.take(8).uppercase(Locale.ROOT)}"

private fun draftSummary(draft: DraftOrderEntity): String {
    val lines = OrderJsonSerializer.deserializeOrderItems(draft.itemsJson)
    if (lines.isEmpty()) return "Không đọc được chi tiết món"
    return lines.joinToString(" · ") { item ->
        "${item.quantity} × ${item.product.name} · Size ${item.variant.sizeLabel}" +
            if (item.toppings.isEmpty()) "" else " · ${item.toppings.joinToString { it.topping.name }}"
    }
}

@Composable
internal fun ReferenceHoldOrderDialog(
    state: OrderUiState,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var label by remember(state.holdDraftId) { mutableStateOf("") }
    val code = draftDisplayCode(state.holdDraftId.orEmpty())
    Dialog(onDismissRequest = { if (!state.isDraftBusy) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(22.dp), color = ReferenceStyle.surface,
            modifier = Modifier.fillMaxWidth(0.92f).widthIn(max = 656.dp)) {
            Column(Modifier.padding(32.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(48.dp).background(ReferenceStyle.mint, RoundedCornerShape(13.dp)),
                        contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Layers, null, tint = ReferenceStyle.teal)
                    }
                    Spacer(Modifier.width(18.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Treo đơn hiện tại", color = ReferenceStyle.ink, fontSize = 23.sp,
                            fontWeight = FontWeight.Bold)
                        Text("Lưu để mở lại và thanh toán sau", color = ReferenceStyle.muted, fontSize = 13.sp)
                    }
                    IconButton(onClick = onDismiss, enabled = !state.isDraftBusy) {
                        Icon(Icons.Default.Close, contentDescription = "Đóng", tint = ReferenceStyle.muted)
                    }
                }
                Spacer(Modifier.height(18.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Spacer(Modifier.height(18.dp))
                Surface(color = ReferenceStyle.paper, shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(20.dp), verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f)) {
                            Text("Đơn $code", color = ReferenceStyle.ink, fontWeight = FontWeight.Bold,
                                fontSize = 17.sp)
                            Spacer(Modifier.height(8.dp))
                            Text(state.cartItems.joinToString(" · ") {
                                "${it.quantity} × ${it.product.name} · Size ${it.variant.sizeLabel}" +
                                    if (it.note.isBlank()) "" else " · ${it.note}"
                            }, color = ReferenceStyle.muted, fontSize = 13.sp,
                                maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        Spacer(Modifier.width(12.dp))
                        Text(money(state.totalAmount), color = ReferenceStyle.teal,
                            fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }
                }
                Spacer(Modifier.height(23.dp))
                Text("Tên gợi nhớ (không bắt buộc)", color = ReferenceStyle.ink,
                    fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(value = label, onValueChange = { label = it.take(80) },
                    placeholder = { Text("Ví dụ: Bàn 03, khách mang đi...") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(11.dp))
                Spacer(Modifier.height(7.dp))
                Text("Để trống sẽ hiển thị theo mã đơn $code.", color = ReferenceStyle.muted,
                    fontSize = 12.sp)
                Spacer(Modifier.height(18.dp))
                Surface(color = ReferenceStyle.mint, shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()) {
                    Text("Lưu trên thiết bị; chưa thanh toán, chưa trừ tồn kho.",
                        color = ReferenceStyle.teal, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 19.dp, vertical = 16.dp))
                }
                state.orderMessage?.let { message ->
                    Spacer(Modifier.height(8.dp))
                    Text(message, color = ReferenceStyle.danger, fontSize = 13.sp)
                }
                Spacer(Modifier.height(18.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onDismiss, enabled = !state.isDraftBusy,
                        shape = RoundedCornerShape(11.dp), modifier = Modifier.weight(1f).height(54.dp)) {
                        Text("Hủy", color = ReferenceStyle.teal, fontWeight = FontWeight.Bold)
                    }
                    Button(onClick = { onConfirm(label) }, enabled = !state.isDraftBusy,
                        colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                        shape = RoundedCornerShape(11.dp), modifier = Modifier.weight(2f).height(54.dp)) {
                        Text(if (state.isDraftBusy) "Đang lưu..." else "Lưu & tạo đơn mới",
                            fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
internal fun ReferenceHeldOrdersSheet(
    orders: List<DraftOrderEntity>,
    busy: Boolean,
    errorMessage: String?,
    onDismiss: () -> Unit,
    onOpen: (DraftOrderEntity) -> Unit,
    onDelete: (String) -> Unit,
    onRename: (String, String) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var deleteTarget by remember { mutableStateOf<DraftOrderEntity?>(null) }
    var renameTarget by remember { mutableStateOf<DraftOrderEntity?>(null) }
    var newLabel by remember { mutableStateOf("") }
    val filtered = remember(orders, query) {
        orders.sortedByDescending { it.heldAt }.filter { draft ->
            query.isBlank() || draft.customerName.orEmpty().contains(query, true) ||
                draftDisplayCode(draft.id).contains(query, true) || draftSummary(draft).contains(query, true)
        }
    }
    val timeFormat = remember { SimpleDateFormat("HH:mm · dd/MM", Locale.forLanguageTag("vi-VN")).apply {
        timeZone = TimeZone.getTimeZone("Asia/Ho_Chi_Minh")
    } }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
            Surface(color = ReferenceStyle.surface, modifier = Modifier.width(658.dp).fillMaxHeight()) {
                Column(Modifier.padding(horizontal = 24.dp, vertical = 16.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Đơn đang treo", color = ReferenceStyle.ink, fontSize = 23.sp,
                            fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(12.dp))
                        Surface(color = ReferenceStyle.mint, shape = RoundedCornerShape(18.dp)) {
                            Text("${orders.size} đơn", color = ReferenceStyle.teal, fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp))
                        }
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "Đóng danh sách", tint = ReferenceStyle.muted)
                        }
                    }
                    Text("Trên thiết bị này · Mới nhất trước", color = ReferenceStyle.muted, fontSize = 12.sp)
                    Spacer(Modifier.height(24.dp))
                    OutlinedTextField(value = query, onValueChange = { query = it },
                        leadingIcon = { Icon(Icons.Default.Search, null, tint = ReferenceStyle.muted) },
                        placeholder = { Text("Tìm theo tên, mã hoặc món...") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp))
                    Spacer(Modifier.height(18.dp))
                    if (filtered.isEmpty()) {
                        Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                            Text(if (orders.isEmpty()) "Chưa có đơn treo. Tạo đơn từ giỏ hiện tại."
                                else "Không tìm thấy đơn phù hợp.", color = ReferenceStyle.muted)
                        }
                    } else {
                        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(filtered, key = { it.id }) { draft ->
                                Surface(shape = RoundedCornerShape(14.dp), color = ReferenceStyle.surface,
                                    border = BorderStroke(1.dp, ReferenceStyle.line),
                                    modifier = Modifier.fillMaxWidth()) {
                                    Column(Modifier.padding(17.dp)) {
                                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                            Text(draftDisplayCode(draft.id), color = ReferenceStyle.teal,
                                                fontSize = 14.sp, fontWeight = FontWeight.Bold)
                                            Spacer(Modifier.width(18.dp))
                                            Text(draft.customerName?.takeIf { it.isNotBlank() } ?: "Chưa đặt tên",
                                                color = ReferenceStyle.ink, fontSize = 17.sp,
                                                fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f),
                                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                                            Text(money(draft.totalAmount), color = ReferenceStyle.ink,
                                                fontSize = 16.sp, fontWeight = FontWeight.Bold)
                                        }
                                        Spacer(Modifier.height(13.dp))
                                        Text(draftSummary(draft), color = ReferenceStyle.muted,
                                            fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        Spacer(Modifier.height(12.dp))
                                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.AccessTime, null, tint = ReferenceStyle.muted,
                                                modifier = Modifier.size(15.dp))
                                            Spacer(Modifier.width(8.dp))
                                            Text(timeFormat.format(Date(draft.heldAt)), color = ReferenceStyle.muted,
                                                fontSize = 12.sp)
                                            Spacer(Modifier.weight(1f))
                                            var menuOpen by remember { mutableStateOf(false) }
                                            Box {
                                                IconButton(onClick = { menuOpen = true }, enabled = !busy,
                                                    modifier = Modifier.size(48.dp)) {
                                                    Icon(Icons.Default.MoreHoriz, contentDescription = "Tùy chọn đơn")
                                                }
                                                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                                                    DropdownMenuItem(text = { Text("Đổi tên") }, onClick = {
                                                        menuOpen = false; renameTarget = draft; newLabel = draft.customerName.orEmpty()
                                                    })
                                                    DropdownMenuItem(text = { Text("Xóa đơn treo") }, onClick = {
                                                        menuOpen = false; deleteTarget = draft
                                                    })
                                                }
                                            }
                                            Spacer(Modifier.width(8.dp))
                                            Button(onClick = { onOpen(draft) }, enabled = !busy,
                                                colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                                                shape = RoundedCornerShape(11.dp),
                                                modifier = Modifier.width(153.dp).height(48.dp)) {
                                                Text("Mở đơn  →", fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    errorMessage?.let { Text(it, color = ReferenceStyle.danger, fontSize = 13.sp) }
                    Text("Tùy chọn đơn: đổi tên hoặc xóa (có xác nhận).", color = ReferenceStyle.muted,
                        fontSize = 12.sp)
                }
            }
        }
    }
    deleteTarget?.let { draft ->
        AlertDialog(onDismissRequest = { deleteTarget = null },
            title = { Text("Xóa ${draftDisplayCode(draft.id)}?") },
            text = { Text("Đơn treo sẽ bị xóa khỏi thiết bị này và không thể mở lại. Giỏ hiện tại không bị ảnh hưởng.") },
            confirmButton = { Button(onClick = { onDelete(draft.id); deleteTarget = null }) { Text("Xóa đơn treo") } },
            dismissButton = { OutlinedButton(onClick = { deleteTarget = null }) { Text("Ở lại") } })
    }
    renameTarget?.let { draft ->
        AlertDialog(onDismissRequest = { renameTarget = null },
            title = { Text("Đổi tên ${draftDisplayCode(draft.id)}") },
            text = { OutlinedTextField(value = newLabel, onValueChange = { newLabel = it.take(80) },
                label = { Text("Tên gợi nhớ") }, singleLine = true) },
            confirmButton = { Button(onClick = { onRename(draft.id, newLabel); renameTarget = null }) { Text("Lưu tên") } },
            dismissButton = { OutlinedButton(onClick = { renameTarget = null }) { Text("Hủy") } })
    }
}

@Composable
internal fun ReferenceCartConflictDialog(
    state: OrderUiState,
    target: DraftOrderEntity,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit
) {
    Dialog(onDismissRequest = { if (!state.isDraftBusy) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = RoundedCornerShape(22.dp), color = ReferenceStyle.surface,
            modifier = Modifier.fillMaxWidth(0.92f).widthIn(max = 655.dp)) {
            Column(Modifier.padding(32.dp)) {
                Text("Giỏ hiện tại đang có món", color = ReferenceStyle.ink,
                    fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Text("Chọn cách giữ giỏ trước khi mở đơn treo.", color = ReferenceStyle.muted, fontSize = 13.sp)
                Spacer(Modifier.height(19.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Spacer(Modifier.height(18.dp))
                Surface(color = ReferenceStyle.paper, shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(19.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text("GIỎ HIỆN TẠI", color = ReferenceStyle.muted, fontSize = 11.sp,
                                fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(7.dp))
                            Text("${state.totalItemCount} món · ${state.cartItems.firstOrNull()?.product?.name.orEmpty()}",
                                color = ReferenceStyle.ink, fontWeight = FontWeight.Bold)
                        }
                        Text(money(state.totalAmount), color = ReferenceStyle.ink, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(10.dp))
                Surface(color = ReferenceStyle.mint, shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(19.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text("ĐƠN SẮP MỞ", color = ReferenceStyle.teal, fontSize = 11.sp,
                                fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(7.dp))
                            Text("${draftDisplayCode(target.id)} · ${target.customerName ?: "Chưa đặt tên"}",
                                color = ReferenceStyle.ink, fontWeight = FontWeight.Bold)
                        }
                        Text(money(target.totalAmount), color = ReferenceStyle.teal, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(18.dp))
                Text("Giỏ hiện tại sẽ được lưu thành một đơn treo mới. Không có món nào bị xóa.",
                    color = ReferenceStyle.muted, fontSize = 13.sp)
                state.orderMessage?.let { message ->
                    Spacer(Modifier.height(8.dp))
                    Text(message, color = ReferenceStyle.danger, fontSize = 13.sp)
                }
                Spacer(Modifier.height(24.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Spacer(Modifier.height(20.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onDismiss, enabled = !state.isDraftBusy,
                        modifier = Modifier.weight(1f).height(54.dp), shape = RoundedCornerShape(11.dp)) {
                        Text("Ở lại", color = ReferenceStyle.teal, fontWeight = FontWeight.Bold)
                    }
                    Button(onClick = onConfirm, enabled = !state.isDraftBusy,
                        colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                        modifier = Modifier.weight(2f).height(54.dp), shape = RoundedCornerShape(11.dp)) {
                        Text(if (state.isDraftBusy) "Đang mở..." else "Treo giỏ này & mở ${draftDisplayCode(target.id)}",
                            fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
        }
    }
}
