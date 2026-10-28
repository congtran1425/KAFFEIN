package vn.id.congtc145.coffeepos.ui.order

import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity

enum class DrinkSize(val label: String, val extraPrice: Long) {
    SIZE_S("S", 0L),
    SIZE_M("M", 6000L),
    SIZE_L("L", 10000L)
}

data class SelectedTopping(
    val topping: ToppingEntity,
    val quantity: Int = 1
) {
    val totalPrice: Long get() = topping.price * quantity
}

data class OrderLineItem(
    val lineId: String,
    val product: CatalogProduct,
    val variant: ProductVariantEntity,
    val toppings: List<SelectedTopping> = emptyList(),
    val note: String = "",
    val quantity: Int = 1
) {
    val unitPrice: Long
        get() {
            val toppingSum = toppings.sumOf { it.totalPrice }
            return variant.priceVnd + toppingSum
        }

    val totalLinePrice: Long
        get() = unitPrice * quantity

    fun getCustomizationSummary(): String {
        val parts = mutableListOf<String>()
        parts.add(variant.sizeLabel)
        toppings.forEach { st ->
            if (st.quantity > 1) {
                parts.add("${st.topping.name} x${st.quantity}")
            } else {
                parts.add(st.topping.name)
            }
        }
        if (note.isNotBlank()) {
            parts.add("Note: $note")
        }
        return parts.joinToString(" • ")
    }
}
