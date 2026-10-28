package vn.id.congtc145.coffeepos.data.sync

import org.json.JSONArray
import org.json.JSONObject
import vn.id.congtc145.coffeepos.data.local.InventorySalePlan
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.domain.saleLinePriceSnapshot
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem

fun buildCashSaleOutboxPayload(sale: SaleEntity, items: List<OrderLineItem>, plan: InventorySalePlan): String =
    JSONObject()
        .put("saleId", sale.id)
        .put("saleNumber", sale.saleNumber)
        .put("cashierCode", sale.cashierCode)
        .put("registerSessionId", sale.registerSessionId)
        .put("items", JSONArray().apply {
            items.forEach { item ->
                val price = saleLinePriceSnapshot(item)
                put(JSONObject()
                    .put("id", item.lineId)
                    .put("productId", item.product.id)
                    .put("productVariantId", item.variant.id)
                    .put("recipeVersionId", plan.lineSnapshots.getValue(item.lineId).first)
                    .put("consumptions", plan.lineSnapshots.getValue(item.lineId).second)
                    .put("quantity", item.quantity)
                    .put("baseUnitPriceVnd", price.baseUnitPriceVnd.toString())
                    .put("unitPriceVnd", price.unitPriceVnd.toString())
                    .put("lineTotalVnd", price.lineTotalVnd.toString())
                    .put("taxRateBps", price.taxRateBps)
                    .put("taxAmountVnd", price.taxAmountVnd.toString())
                    .put("subtotalVnd", price.subtotalVnd.toString())
                    .put("note", item.note)
                    .put("toppings", JSONArray().apply {
                        item.toppings.forEach { selected ->
                            put(JSONObject()
                                .put("toppingId", selected.topping.id)
                                .put("unitPriceVnd", selected.topping.price.toString())
                                .put("quantityPerItem", selected.quantity))
                        }
                    }))
            }
        })
        .put("subtotalVnd", sale.subtotalVnd)
        .put("taxVnd", sale.taxVnd)
        .put("totalVnd", sale.totalVnd)
        .put("paymentMethod", sale.paymentMethod)
        .put("completedAtEpochMs", sale.completedAt)
        .toString()
