package vn.id.congtc145.coffeepos.ui.order

import java.text.NumberFormat
import java.util.Locale

data class CartCatalogReview(
    val messages: List<String>,
    val canRefreshPrices: Boolean
)

/** Compare draft price/availability snapshots with the latest catalog stored in Room. */
fun reviewCartAgainstCatalog(state: OrderUiState): CartCatalogReview {
    val format = NumberFormat.getNumberInstance(Locale.forLanguageTag("vi-VN"))
    val messages = mutableListOf<String>()
    var unavailable = false
    state.cartItems.forEach { line ->
        val product = state.allProducts.firstOrNull { it.id == line.product.id }
        val variant = state.availableVariants.firstOrNull {
            it.id == line.variant.id && it.productId == line.product.id
        }
        if (product == null || variant == null) {
            unavailable = true
            messages += "${line.product.name}: món hoặc size không còn bán. Hãy bỏ dòng này và chọn lại."
        } else {
            val invalidTopping = line.toppings.firstOrNull { selected ->
                state.availableToppings.none { it.id == selected.topping.id }
            }
            if (invalidTopping != null) {
                unavailable = true
                messages += "${line.product.name}: topping ${invalidTopping.topping.name} không còn bán. Hãy chọn lại món."
            } else {
                val newUnitPrice = variant.priceVnd + line.toppings.sumOf { selected ->
                    state.availableToppings.first { it.id == selected.topping.id }.price * selected.quantity
                }
                val changes = buildList {
                    if (newUnitPrice != line.unitPrice) {
                        add("đơn giá ${format.format(line.unitPrice)} → ${format.format(newUnitPrice)} đ")
                    }
                    if (product.taxRateBps != line.product.taxRateBps) {
                        add("VAT ${line.product.taxRateBps / 100.0}% → ${product.taxRateBps / 100.0}%")
                    }
                }
                if (changes.isNotEmpty()) {
                    messages += "${line.product.name}: ${changes.joinToString("; ")}. Cập nhật giỏ trước khi thu tiền."
                }
            }
        }
    }
    return CartCatalogReview(messages, messages.isNotEmpty() && !unavailable)
}
