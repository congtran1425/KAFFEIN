package vn.id.congtc145.coffeepos.ui.reference

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping

@Composable
internal fun ReferenceCustomizationDialog(
    product: CatalogProduct,
    variants: List<ProductVariantEntity>,
    toppings: List<ToppingEntity>,
    onDismiss: () -> Unit,
    onConfirm: (CatalogProduct, ProductVariantEntity, List<SelectedTopping>, String, Int) -> Unit
) {
    val previewBacXiu = DesignPreviewMode.isActive(LocalContext.current) && product.code == "CF03"
    var selectedVariant by remember(product.id, variants) {
        mutableStateOf(
            if (previewBacXiu) variants.firstOrNull { it.sizeLabel == "L" } ?: variants.firstOrNull()
            else variants.firstOrNull { it.isDefault } ?: variants.firstOrNull()
        )
    }
    val quantities = remember(product.id) {
        mutableStateMapOf<String, Int>().apply {
            if (previewBacXiu) toppings.firstOrNull { it.name.contains("Trân châu", true) }?.let { put(it.id, 1) }
        }
    }
    var note by remember(product.id) { mutableStateOf(if (previewBacXiu) "Ít đá" else "") }
    var quantity by remember(product.id) { mutableIntStateOf(1) }
    val total = ((selectedVariant?.priceVnd ?: 0L) + toppings.sumOf { (quantities[it.id] ?: 0) * it.price }) * quantity
    val fontScale = LocalDensity.current.fontScale

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        CompositionLocalProvider(LocalDensity provides Density(1f, fontScale)) {
        Surface(
            shape = RoundedCornerShape(24.dp),
            color = ReferenceStyle.surface,
            modifier = Modifier.widthIn(max = 760.dp).fillMaxWidth().heightIn(max = 650.dp)
        ) {
            Column(Modifier.padding(horizontal = 32.dp, vertical = 25.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text("Tùy chỉnh ${product.name}", fontSize = 25.sp, fontWeight = FontWeight.Bold, color = ReferenceStyle.ink)
                        Spacer(Modifier.height(6.dp))
                        Text("Giá gốc ${money(product.basePrice)} · Giá đã gồm VAT", fontSize = 13.sp, color = ReferenceStyle.muted)
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp).background(ReferenceStyle.paper, RoundedCornerShape(14.dp))) {
                        Icon(Icons.Default.Close, contentDescription = "Đóng tùy chỉnh", tint = ReferenceStyle.muted)
                    }
                }
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                    Spacer(Modifier.height(14.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Kích thước", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ReferenceStyle.ink)
                        Text("Chọn 1", fontSize = 13.sp, color = ReferenceStyle.muted)
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                        variants.forEach { variant ->
                            val selected = selectedVariant?.id == variant.id
                            Surface(
                                color = if (selected) ReferenceStyle.mint else ReferenceStyle.surface,
                                border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) ReferenceStyle.teal else ReferenceStyle.line),
                                shape = RoundedCornerShape(13.dp),
                                modifier = Modifier.weight(1f).height(72.dp).clickable { selectedVariant = variant }
                            ) {
                                Row(Modifier.padding(horizontal = 17.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        Modifier.size(21.dp).background(if (selected) ReferenceStyle.teal else ReferenceStyle.surface, CircleShape),
                                        contentAlignment = Alignment.Center
                                    ) { Text(if (selected) "✓" else "○", color = if (selected) Color.White else ReferenceStyle.muted, fontSize = 16.sp) }
                                    Spacer(Modifier.width(13.dp))
                                    Text(variant.sizeLabel, color = ReferenceStyle.ink, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Spacer(Modifier.weight(1f))
                                    Text(money(variant.priceVnd), color = if (selected) ReferenceStyle.teal else ReferenceStyle.ink, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(21.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Topping", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ReferenceStyle.ink)
                        Text("Tối đa 3 phần / loại", fontSize = 13.sp, color = ReferenceStyle.muted)
                    }
                    Spacer(Modifier.height(11.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                        toppings.forEach { topping ->
                            val count = quantities[topping.id] ?: 0
                            Surface(
                                color = if (count > 0) ReferenceStyle.mint else ReferenceStyle.surface,
                                border = BorderStroke(if (count > 0) 2.dp else 1.dp, if (count > 0) ReferenceStyle.teal else ReferenceStyle.line),
                                shape = RoundedCornerShape(13.dp),
                                modifier = Modifier.weight(1f).height(84.dp)
                            ) {
                                Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(topping.name, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = ReferenceStyle.ink)
                                        Text("+${money(topping.price)} / phần", fontSize = 13.sp, color = ReferenceStyle.muted)
                                    }
                                    ReferenceStepper(count, onMinus = {
                                        if (count <= 1) quantities.remove(topping.id) else quantities[topping.id] = count - 1
                                    }, onPlus = { if (count < 3) quantities[topping.id] = count + 1 }, compact = true)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(22.dp))
                    Text("Ghi chú pha chế", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = ReferenceStyle.ink)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        modifier = Modifier.fillMaxWidth().height(70.dp),
                        placeholder = { Text("Ví dụ: ít đá, không đường…") },
                        shape = RoundedCornerShape(13.dp),
                        singleLine = false
                    )
                    Text("Ghi chú được lưu cùng đơn và in trên biên lai.", modifier = Modifier.padding(start = 17.dp, top = 4.dp), fontSize = 11.sp, color = ReferenceStyle.muted)
                }
                Spacer(Modifier.height(14.dp))
                HorizontalDivider(color = ReferenceStyle.line)
                Spacer(Modifier.height(24.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    ReferenceStepper(quantity, onMinus = { if (quantity > 1) quantity-- }, onPlus = { quantity++ }, compact = false)
                    Button(onClick = onDismiss, colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.surface), border = BorderStroke(1.dp, ReferenceStyle.line), shape = RoundedCornerShape(12.dp), modifier = Modifier.width(130.dp).height(58.dp)) {
                        Text("Hủy", color = ReferenceStyle.teal, fontWeight = FontWeight.Bold)
                    }
                    Button(
                        onClick = {
                            selectedVariant?.let { variant ->
                                val selected = toppings.mapNotNull { topping ->
                                    quantities[topping.id]?.takeIf { it > 0 }?.let { SelectedTopping(topping, it) }
                                }
                                onConfirm(product, variant, selected, note, quantity)
                            }
                        },
                        enabled = selectedVariant != null,
                        colors = ButtonDefaults.buttonColors(containerColor = ReferenceStyle.teal),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.weight(1f).height(58.dp)
                    ) { Text("Thêm vào đơn · ${money(total)}", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold) }
                }
            }
        }
        }
    }
}

@Composable
internal fun ReferenceStepper(
    count: Int,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    compact: Boolean,
    onCountClick: (() -> Unit)? = null
) {
    Row(
        modifier = Modifier
            .background(ReferenceStyle.paper, RoundedCornerShape(11.dp))
            .padding(horizontal = if (compact) 2.dp else 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        if (count > 0) {
            IconButton(onClick = onMinus, modifier = Modifier.size(if (compact) 40.dp else 42.dp)) {
                Icon(Icons.Default.Remove, contentDescription = "Giảm số lượng", tint = ReferenceStyle.muted, modifier = Modifier.size(18.dp))
            }
            Text(count.toString(), modifier = Modifier.width(if (compact) 26.dp else 34.dp)
                .clickable(enabled = onCountClick != null) { onCountClick?.invoke() },
                color = ReferenceStyle.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        IconButton(onClick = onPlus, modifier = Modifier.size(if (compact) 40.dp else 42.dp)) {
            Icon(Icons.Default.Add, contentDescription = "Tăng số lượng", tint = ReferenceStyle.teal, modifier = Modifier.size(20.dp))
        }
    }
}
