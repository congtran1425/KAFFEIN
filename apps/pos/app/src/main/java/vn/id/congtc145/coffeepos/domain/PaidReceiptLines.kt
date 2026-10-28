package vn.id.congtc145.coffeepos.domain

import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping

data class PaidReceiptLine(
    val id: String,
    val productId: String,
    val variantId: String,
    val productName: String,
    val variantName: String,
    val baseUnitPriceVnd: Long,
    val taxRateBps: Int,
    val quantity: Int,
    val note: String,
    val toppings: List<SelectedTopping>
)

/** Sale-item IDs belong to the server, not to the cart. Match a complete
 * immutable quote one-to-one (including repeated identical lines), never by
 * name, list position, or just total. Keep local IDs for precise cart removal. */
fun matchPaidReceiptLines(original: List<OrderLineItem>, receipt: List<PaidReceiptLine>): List<OrderLineItem> {
    check(original.isNotEmpty() && receipt.size == original.size &&
        original.map { it.lineId }.toSet().size == original.size &&
        receipt.all { it.id.isNotBlank() } && receipt.map { it.id }.toSet().size == receipt.size) {
        "Số dòng biên lai không khớp giỏ đã xác nhận."
    }
    fun toppingsKey(toppings: List<SelectedTopping>) = toppings.map {
        Triple(it.topping.id, it.quantity, it.topping.price)
    }.sortedWith(compareBy({ it.first }, { it.second }, { it.third }))
    fun matches(local: OrderLineItem, remote: PaidReceiptLine) =
        local.product.id == remote.productId && local.variant.id == remote.variantId &&
        local.quantity == remote.quantity && local.note == remote.note &&
        local.variant.priceVnd == remote.baseUnitPriceVnd && local.product.taxRateBps == remote.taxRateBps &&
        toppingsKey(local.toppings) == toppingsKey(remote.toppings)

    val remaining = original.toMutableList()
    return receipt.map { remote ->
        val sameId = remaining.indexOfFirst { it.lineId == remote.id }
        val index = if (sameId >= 0) sameId else remaining.indexOfFirst { matches(it, remote) }
        check(index >= 0 && matches(remaining[index], remote)) {
            "Nội dung biên lai không khớp giỏ đã xác nhận."
        }
        val local = remaining.removeAt(index)
        local.copy(
            product = local.product.copy(name = remote.productName),
            variant = local.variant.copy(sizeLabel = remote.variantName),
            toppings = remote.toppings
        )
    }
}
