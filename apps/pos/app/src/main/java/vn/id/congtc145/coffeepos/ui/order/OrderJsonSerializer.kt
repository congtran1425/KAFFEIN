package vn.id.congtc145.coffeepos.ui.order

import org.json.JSONArray
import org.json.JSONObject
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity

object OrderJsonSerializer {

    /** A draft must be restored whole; partial JSON recovery would silently drop ordered items. */
    fun deserializeOrderItemsStrict(jsonStr: String): List<OrderLineItem> {
        val expectedCount = JSONArray(jsonStr).length()
        val items = deserializeOrderItems(jsonStr)
        require(expectedCount > 0 && items.size == expectedCount && items.all {
            it.lineId.isNotBlank() && it.product.id.isNotBlank() && it.quantity > 0
        }) { "Dữ liệu giỏ hoặc đơn treo không đầy đủ." }
        return items
    }

    fun serializeOrderItems(items: List<OrderLineItem>): String {
        val array = JSONArray()
        for (item in items) {
            val itemObj = JSONObject().apply {
                put("lineId", item.lineId)
                put("size", item.variant.code)
                put("productVariantId", item.variant.id)
                put("variant", JSONObject().apply {
                    put("id", item.variant.id)
                    put("productId", item.variant.productId)
                    put("code", item.variant.code)
                    put("sizeLabel", item.variant.sizeLabel)
                    put("priceVnd", item.variant.priceVnd)
                    put("isDefault", item.variant.isDefault)
                })
                put("note", item.note)
                put("quantity", item.quantity)

                // Product
                val prodObj = JSONObject().apply {
                    put("id", item.product.id)
                    put("code", item.product.code)
                    put("name", item.product.name)
                    put("categoryId", item.product.categoryId)
                    put("category", item.product.category)
                    put("basePrice", item.product.basePrice)
                    put("taxRateBps", item.product.taxRateBps)
                    put("isAvailable", item.product.isAvailable)
                    put("description", item.product.description)
                    put("allowedToppingIdsJson", item.product.allowedToppingIdsJson)
                }
                put("product", prodObj)

                // Toppings
                val toppingArray = JSONArray()
                for (st in item.toppings) {
                    val stObj = JSONObject().apply {
                        put("quantity", st.quantity)
                        val topObj = JSONObject().apply {
                            put("id", st.topping.id)
                            put("name", st.topping.name)
                            put("price", st.topping.price)
                            put("isAvailable", st.topping.isAvailable)
                        }
                        put("topping", topObj)
                    }
                    toppingArray.put(stObj)
                }
                put("toppings", toppingArray)
            }
            array.put(itemObj)
        }
        return array.toString()
    }

    fun deserializeOrderItems(jsonStr: String): List<OrderLineItem> {
        if (jsonStr.isBlank()) return emptyList()
        val result = mutableListOf<OrderLineItem>()
        try {
            val array = JSONArray(jsonStr)
            for (i in 0 until array.length()) {
                val itemObj = array.getJSONObject(i)
                val lineId = itemObj.optString("lineId", java.util.UUID.randomUUID().toString())
                val sizeStr = itemObj.optString("size", "SIZE_M")
                val oldSize = try { DrinkSize.valueOf(sizeStr) } catch (_: Exception) { DrinkSize.SIZE_M }
                val note = itemObj.optString("note", "")
                val quantity = itemObj.optInt("quantity", 1)

                val prodObj = itemObj.getJSONObject("product")
                val product = CatalogProduct(
                    id = prodObj.optString("id", ""),
                    code = prodObj.optString("code", ""),
                    name = prodObj.optString("name", "Món không tên"),
                    categoryId = prodObj.optString("categoryId", prodObj.optString("category", "Khác")),
                    category = prodObj.optString("category", "Khác"),
                    basePrice = prodObj.optLong("basePrice", 0L),
                    taxRateBps = prodObj.optInt("taxRateBps", 0),
                    isAvailable = prodObj.optBoolean("isAvailable", true),
                    description = prodObj.optString("description", ""),
                    allowedToppingIdsJson = prodObj.optString("allowedToppingIdsJson", "[]")
                )

                val variantObj = itemObj.optJSONObject("variant")
                val variant = if (variantObj != null) {
                    ProductVariantEntity(
                        id = variantObj.optString("id", ""),
                        productId = product.id,
                        code = variantObj.optString("code", sizeStr),
                        sizeLabel = variantObj.optString("sizeLabel", sizeStr),
                        priceVnd = variantObj.optLong("priceVnd", product.basePrice),
                        isDefault = variantObj.optBoolean("isDefault", false)
                    )
                } else {
                    // Legacy held orders predate server variant IDs; checkout must reject them.
                    ProductVariantEntity(
                        id = "",
                        productId = product.id,
                        code = oldSize.name,
                        sizeLabel = "Size ${oldSize.label}",
                        priceVnd = product.basePrice + oldSize.extraPrice,
                        isDefault = false
                    )
                }

                val toppings = mutableListOf<SelectedTopping>()
                val toppingArray = itemObj.optJSONArray("toppings")
                if (toppingArray != null) {
                    for (j in 0 until toppingArray.length()) {
                        val stObj = toppingArray.getJSONObject(j)
                        val topQty = stObj.optInt("quantity", 1)
                        val topObj = stObj.getJSONObject("topping")
                        val topping = ToppingEntity(
                            id = topObj.optString("id", ""),
                            name = topObj.optString("name", ""),
                            price = topObj.optLong("price", 0L),
                            isAvailable = topObj.optBoolean("isAvailable", true)
                        )
                        toppings.add(SelectedTopping(topping, topQty))
                    }
                }

                result.add(
                    OrderLineItem(
                        lineId = lineId,
                        product = product,
                        variant = variant,
                        toppings = toppings,
                        note = note,
                        quantity = quantity
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return result
    }

    fun getItemsSummary(jsonStr: String): String {
        val items = deserializeOrderItems(jsonStr)
        if (items.isEmpty()) return "Không có thông tin món"
        return items.joinToString(", ") { "${it.quantity}x ${it.product.name}" }
    }
}
