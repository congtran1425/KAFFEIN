package vn.id.congtc145.coffeepos.ui.order.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.window.Dialog
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeMocha
import vn.id.congtc145.coffeepos.ui.theme.SurfaceOffWhite
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HoldOrderDialog(
    itemCount: Int,
    totalAmount: Long,
    onDismiss: () -> Unit,
    onConfirmHold: (customerName: String) -> Unit
) {
    var customerName by remember { mutableStateOf("") }
    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN")) }
    val quickChips = listOf("Bàn 1", "Bàn 2", "Bàn 3", "Bàn 4", "Bàn 5", "Mang đi", "Khách quen")

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            modifier = Modifier.fillMaxWidth(0.85f)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(CoffeeAmber),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.PauseCircle,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "Treo Đơn Hàng",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = CoffeeDarkRoast
                            )
                            Text(
                                text = "Lưu tạm đơn đang soạn vào bộ nhớ máy POS",
                                fontSize = 12.sp,
                                color = TextSecondary
                            )
                        }
                    }

                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Đóng", tint = TextSecondary)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Tóm tắt đơn
                Surface(
                    color = SurfaceOffWhite,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Tổng số lượng: $itemCount món",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = TextPrimary
                        )
                        Text(
                            text = currencyFormatter.format(totalAmount),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeAmber
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Ô nhập tên khách hoặc số bàn
                Text(
                    text = "TÊN KHÁCH HOẶC SỐ BÀN / GHI CHÚ",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = CoffeeMocha
                )
                Spacer(modifier = Modifier.height(6.dp))
                OutlinedTextField(
                    value = customerName,
                    onValueChange = { customerName = it },
                    placeholder = { Text("Ví dụ: Bàn 03, Anh Tuấn mang đi...", fontSize = 14.sp) },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = CoffeeAmber,
                        unfocusedBorderColor = Color(0xFFD1D5DB)
                    )
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Gợi ý chọn nhanh
                Text(
                    text = "Gợi ý chọn nhanh:",
                    fontSize = 11.sp,
                    color = TextSecondary
                )
                Spacer(modifier = Modifier.height(6.dp))
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    quickChips.forEach { chip ->
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (customerName == chip) CoffeeAmber else SurfaceOffWhite,
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp,
                                if (customerName == chip) CoffeeAmber else Color(0xFFE5E7EB)
                            ),
                            modifier = Modifier.clickable { customerName = chip }
                        ) {
                            Text(
                                text = chip,
                                fontSize = 12.sp,
                                fontWeight = if (customerName == chip) FontWeight.Bold else FontWeight.Medium,
                                color = if (customerName == chip) Color.White else TextPrimary,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Các nút hành động
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp)
                    ) {
                        Text("Hủy", color = TextSecondary, fontWeight = FontWeight.SemiBold)
                    }

                    Button(
                        onClick = {
                            val finalName = customerName.ifBlank { "Khách vãng lai" }
                            onConfirmHold(finalName)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(46.dp)
                    ) {
                        Text("Xác nhận treo", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
