package vn.id.congtc145.coffeepos.ui.order.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import vn.id.congtc145.coffeepos.data.local.entity.DraftOrderEntity
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.ErrorCrimson
import vn.id.congtc145.coffeepos.ui.theme.SurfaceOffWhite
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun HeldOrdersDialog(
    heldOrders: List<DraftOrderEntity>,
    onDismiss: () -> Unit,
    onRestoreOrder: (DraftOrderEntity) -> Unit,
    onDeleteOrder: (orderId: String) -> Unit
) {
    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN")) }
    val timeFormatter = remember { SimpleDateFormat("HH:mm - dd/MM", Locale.getDefault()) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .heightIn(max = 600.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Inbox,
                            contentDescription = "Đơn treo",
                            tint = CoffeeAmber,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Danh sách đơn đang treo (${heldOrders.size})",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeDarkRoast
                        )
                    }

                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Đóng", tint = TextSecondary)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (heldOrders.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Hiện không có đơn hàng nào đang treo.",
                            fontSize = 14.sp,
                            color = TextSecondary
                        )
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f, fill = false)
                    ) {
                        items(heldOrders, key = { it.id }) { order ->
                            val itemsSummary = remember(order.itemsJson) {
                                vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer.getItemsSummary(order.itemsJson)
                            }
                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = SurfaceOffWhite,
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                                        Text(
                                            text = order.customerName ?: "Khách vãng lai",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 15.sp,
                                            color = TextPrimary
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = itemsSummary,
                                            fontSize = 12.sp,
                                            color = CoffeeDarkRoast,
                                            maxLines = 1,
                                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(
                                                text = timeFormatter.format(Date(order.heldAt)),
                                                fontSize = 11.sp,
                                                color = TextSecondary
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(text = "•", fontSize = 11.sp, color = TextSecondary)
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(
                                                text = currencyFormatter.format(order.totalAmount),
                                                fontSize = 13.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = CoffeeAmber
                                            )
                                        }
                                    }

                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        // Nút Hủy
                                        IconButton(
                                            onClick = { onDeleteOrder(order.id) },
                                            modifier = Modifier
                                                .size(36.dp)
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(Color(0xFFFEE2E2))
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Delete,
                                                contentDescription = "Hủy đơn",
                                                tint = ErrorCrimson,
                                                modifier = Modifier.size(20.dp)
                                            )
                                        }

                                        // Nút Phục hồi (Restore)
                                        Button(
                                            onClick = {
                                                onRestoreOrder(order)
                                                onDismiss()
                                            },
                                            colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                                            shape = RoundedCornerShape(8.dp),
                                            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                                                horizontal = 14.dp,
                                                vertical = 8.dp
                                            )
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Restore,
                                                contentDescription = "Mở lại",
                                                tint = Color.White,
                                                modifier = Modifier.size(18.dp)
                                            )
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text(text = "Mở lại", color = Color.White, fontSize = 13.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
