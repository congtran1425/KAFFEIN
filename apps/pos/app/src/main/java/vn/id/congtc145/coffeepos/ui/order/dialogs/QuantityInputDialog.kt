package vn.id.congtc145.coffeepos.ui.order.dialogs

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeMocha
import vn.id.congtc145.coffeepos.ui.theme.SurfaceOffWhite
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary

@Composable
fun QuantityInputDialog(
    item: OrderLineItem,
    onDismiss: () -> Unit,
    onConfirmQuantity: (newQuantity: Int) -> Unit
) {
    var quantityText by remember { mutableStateOf(item.quantity.toString()) }

    fun appendDigit(d: String) {
        if (quantityText == "0") {
            quantityText = d
        } else if (quantityText.length < 3) {
            quantityText += d
        }
    }

    fun backspace() {
        if (quantityText.isNotEmpty()) {
            quantityText = quantityText.dropLast(1)
            if (quantityText.isEmpty()) quantityText = "0"
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            modifier = Modifier.width(320.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Nhập số lượng",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = CoffeeDarkRoast
                    )
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Đóng", tint = TextSecondary)
                    }
                }

                Text(
                    text = item.product.name,
                    fontSize = 13.sp,
                    color = TextSecondary,
                    modifier = Modifier.padding(top = 2.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Ô hiển thị số lượng to rõ
                Surface(
                    color = SurfaceOffWhite,
                    shape = RoundedCornerShape(8.dp),
                    border = androidx.compose.foundation.BorderStroke(1.dp, CoffeeAmber),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = quantityText,
                            fontSize = 28.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeMocha
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Numpad 3x4
                val keys = listOf(
                    listOf("1", "2", "3"),
                    listOf("4", "5", "6"),
                    listOf("7", "8", "9"),
                    listOf("C", "0", "DEL")
                )

                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    keys.forEach { row ->
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            row.forEach { key ->
                                Surface(
                                    color = if (key == "C" || key == "DEL") SurfaceOffWhite else Color.White,
                                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(48.dp)
                                        .clickable {
                                            when (key) {
                                                "C" -> quantityText = "0"
                                                "DEL" -> backspace()
                                                else -> appendDigit(key)
                                            }
                                        }
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        if (key == "DEL") {
                                            Icon(
                                                Icons.AutoMirrored.Filled.Backspace,
                                                contentDescription = "Xóa",
                                                modifier = Modifier.size(20.dp),
                                                tint = TextPrimary
                                            )
                                        } else {
                                            Text(
                                                text = key,
                                                fontSize = 18.sp,
                                                fontWeight = FontWeight.SemiBold,
                                                color = if (key == "C") Color.Red else TextPrimary
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = {
                        val parsed = quantityText.toIntOrNull() ?: 1
                        onConfirmQuantity(if (parsed < 1) 1 else parsed)
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp)
                ) {
                    Text(
                        text = "Xác nhận",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}
