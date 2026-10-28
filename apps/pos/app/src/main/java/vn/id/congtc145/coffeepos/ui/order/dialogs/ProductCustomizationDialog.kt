package vn.id.congtc145.coffeepos.ui.order.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
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
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping
import vn.id.congtc145.coffeepos.ui.theme.CoffeeAmber
import vn.id.congtc145.coffeepos.ui.theme.CoffeeDarkRoast
import vn.id.congtc145.coffeepos.ui.theme.CoffeeMocha
import vn.id.congtc145.coffeepos.ui.theme.CoffeeWarmBrown
import vn.id.congtc145.coffeepos.ui.theme.SurfaceOffWhite
import vn.id.congtc145.coffeepos.ui.theme.TextPrimary
import vn.id.congtc145.coffeepos.ui.theme.TextSecondary
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProductCustomizationDialog(
    product: CatalogProduct,
    variants: List<ProductVariantEntity>,
    availableToppings: List<ToppingEntity>,
    onDismiss: () -> Unit,
    onConfirm: (
        product: CatalogProduct,
        variant: ProductVariantEntity,
        toppings: List<SelectedTopping>,
        note: String,
        quantity: Int
    ) -> Unit
) {
    val currencyFormatter = remember { NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN")) }

    var selectedVariant by remember(product.id, variants) {
        mutableStateOf(variants.firstOrNull { it.isDefault } ?: variants.firstOrNull())
    }
    val selectedToppingsMap = remember { mutableStateMapOf<String, Int>() }
    var note by remember { mutableStateOf("") }
    var drinkQuantity by remember { mutableIntStateOf(1) }

    // Tính tổng đơn giá tạm tính của 1 ly
    val toppingTotal = selectedToppingsMap.entries.sumOf { (topId, count) ->
        val top = availableToppings.firstOrNull { it.id == topId }
        (top?.price ?: 0L) * count
    }
    val singleDrinkPrice = (selectedVariant?.priceVnd ?: 0L) + toppingTotal
    val totalDialogPrice = singleDrinkPrice * drinkQuantity

    val isDrink = !product.category.contains("Bánh")

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .heightIn(max = 680.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Tiêu đề món & nút đóng
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = product.name,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeDarkRoast
                        )
                        Text(
                            text = "Giá gốc: ${currencyFormatter.format(product.basePrice)} • VAT ${product.taxRateBps / 100}%",
                            fontSize = 13.sp,
                            color = TextSecondary
                        )
                    }

                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(SurfaceOffWhite)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Đóng",
                            tint = TextSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Phần nội dung cuộn được
                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                ) {
                    if (isDrink) {
                        // 1. CHỌN SIZE
                        Text(
                            text = "KÍCH THƯỚC (SIZE)",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeMocha
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            variants.forEach { variant ->
                                val isSelected = selectedVariant?.id == variant.id
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) CoffeeMocha else SurfaceOffWhite,
                                    border = if (isSelected) null else androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5E7EB)),
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp)
                                        .clickable { selectedVariant = variant }
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.Center
                                    ) {
                                        Text(
                                            text = variant.sizeLabel,
                                            color = if (isSelected) Color.White else TextPrimary,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                            fontSize = 14.sp
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = currencyFormatter.format(variant.priceVnd),
                                            color = if (isSelected) CoffeeAmber else TextSecondary,
                                            fontSize = 12.sp
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // 2. TOPPING THÊM (Có hỗ trợ chọn số lượng >= 1 như "gấp đôi topping")
                        Text(
                            text = "THÊM TOPPING (Tối đa 3 phần mỗi loại)",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = CoffeeMocha
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            availableToppings.forEach { topping ->
                                val qty = selectedToppingsMap[topping.id] ?: 0
                                val isSelected = qty > 0

                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) CoffeeAmber.copy(alpha = 0.1f) else SurfaceOffWhite,
                                    border = androidx.compose.foundation.BorderStroke(
                                        1.dp,
                                        if (isSelected) CoffeeAmber else Color(0xFFE5E7EB)
                                    ),
                                    modifier = Modifier.padding(bottom = 4.dp)
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                                    ) {
                                        Column {
                                            Text(
                                                text = topping.name,
                                                fontSize = 13.sp,
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                                color = if (isSelected) CoffeeMocha else TextPrimary
                                            )
                                            Text(
                                                text = "+${currencyFormatter.format(topping.price)}",
                                                fontSize = 11.sp,
                                                color = TextSecondary
                                            )
                                        }

                                        Spacer(modifier = Modifier.width(10.dp))

                                        if (qty == 0) {
                                            IconButton(
                                                onClick = { selectedToppingsMap[topping.id] = 1 },
                                                modifier = Modifier
                                                    .size(26.dp)
                                                    .clip(CircleShape)
                                                    .background(CoffeeAmber)
                                            ) {
                                                Icon(
                                                    imageVector = Icons.Default.Add,
                                                    contentDescription = "Thêm topping",
                                                    tint = Color.White,
                                                    modifier = Modifier.size(16.dp)
                                                )
                                            }
                                        } else {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                IconButton(
                                                    onClick = {
                                                        if (qty > 1) {
                                                            selectedToppingsMap[topping.id] = qty - 1
                                                        } else {
                                                            selectedToppingsMap.remove(topping.id)
                                                        }
                                                    },
                                                    modifier = Modifier
                                                        .size(24.dp)
                                                        .clip(CircleShape)
                                                        .background(Color(0xFFE5E7EB))
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Remove,
                                                        contentDescription = "Giảm topping",
                                                        tint = TextPrimary,
                                                        modifier = Modifier.size(14.dp)
                                                    )
                                                }

                                                Text(
                                                    text = "$qty",
                                                    fontSize = 14.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = CoffeeMocha,
                                                    modifier = Modifier.padding(horizontal = 8.dp)
                                                )

                                                IconButton(
                                                    onClick = {
                                                        if (qty < 3) {
                                                            selectedToppingsMap[topping.id] = qty + 1
                                                        }
                                                    },
                                                    modifier = Modifier
                                                        .size(24.dp)
                                                        .clip(CircleShape)
                                                        .background(CoffeeAmber)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Default.Add,
                                                        contentDescription = "Tăng topping",
                                                        tint = Color.White,
                                                        modifier = Modifier.size(14.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // 3. GHI CHÚ
                    Text(
                        text = "GHI CHÚ PHA CHẾ",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = CoffeeMocha
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        placeholder = { Text("Ví dụ: Không đường, không đá, uống tại chỗ...", fontSize = 13.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Dưới cùng: Bộ chọn số lượng ly + Nút Thêm vào giỏ hàng
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Tăng giảm số lượng ly
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(SurfaceOffWhite)
                            .padding(horizontal = 6.dp, vertical = 4.dp)
                    ) {
                        IconButton(
                            onClick = { if (drinkQuantity > 1) drinkQuantity-- },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.Remove, contentDescription = "Giảm", tint = TextPrimary)
                        }

                        Text(
                            text = "$drinkQuantity",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            modifier = Modifier.padding(horizontal = 12.dp)
                        )

                        IconButton(
                            onClick = { drinkQuantity++ },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Tăng", tint = TextPrimary)
                        }
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    // Nút xác nhận thêm
                    Button(
                        onClick = {
                            val chosenToppings = selectedToppingsMap.mapNotNull { (topId, count) ->
                                val top = availableToppings.firstOrNull { it.id == topId }
                                if (top != null) SelectedTopping(top, count) else null
                            }
                            selectedVariant?.let { variant ->
                                onConfirm(product, variant, chosenToppings, note, drinkQuantity)
                            }
                        },
                        enabled = selectedVariant != null,
                        colors = ButtonDefaults.buttonColors(containerColor = CoffeeAmber),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Text(
                            text = "Thêm • ${currencyFormatter.format(totalDialogPrice)}",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }
                }
            }
        }
    }
}
