package vn.id.congtc145.coffeepos.domain

import vn.id.congtc145.coffeepos.ui.order.OrderLineItem

data class SaleLinePriceSnapshot(
    val baseUnitPriceVnd: Long,
    val unitPriceVnd: Long,
    val lineTotalVnd: Long,
    val taxRateBps: Int,
    val taxAmountVnd: Long,
    val subtotalVnd: Long
)

fun saleLinePriceSnapshot(item: OrderLineItem): SaleLinePriceSnapshot {
    require(item.quantity > 0 && item.variant.priceVnd >= 0)
    require(item.toppings.all { it.quantity > 0 && it.topping.price >= 0 })
    val tax = calculateInclusiveVat(item.totalLinePrice, item.product.taxRateBps)
    return SaleLinePriceSnapshot(
        baseUnitPriceVnd = item.variant.priceVnd,
        unitPriceVnd = item.unitPrice,
        lineTotalVnd = item.totalLinePrice,
        taxRateBps = item.product.taxRateBps,
        taxAmountVnd = tax,
        subtotalVnd = item.totalLinePrice - tax
    )
}
