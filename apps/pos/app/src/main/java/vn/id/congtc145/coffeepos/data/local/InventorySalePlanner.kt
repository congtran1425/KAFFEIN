package vn.id.congtc145.coffeepos.data.local

import org.json.JSONArray
import org.json.JSONObject
import vn.id.congtc145.coffeepos.data.local.dao.InventoryDao
import vn.id.congtc145.coffeepos.data.local.entity.LocalStockMovementEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleItemConsumptionEntity
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import java.math.BigDecimal
import java.util.UUID

data class InventorySalePlan(
    val lineSnapshots: Map<String, Pair<String, JSONArray>>,
    val consumptions: List<SaleItemConsumptionEntity>,
    val movements: List<LocalStockMovementEntity>,
    val balancesAfter: Map<String, String>
)

/** Called only inside the same Room transaction that persists the sale and outbox. */
class InventorySalePlanner(private val dao: InventoryDao) {
    suspend fun plan(
        items: List<OrderLineItem>,
        saleId: String,
        operationId: String,
        storeId: String,
        now: Long
    ): InventorySalePlan {
        val lineSnapshots = mutableMapOf<String, Pair<String, JSONArray>>()
        val consumptions = mutableListOf<SaleItemConsumptionEntity>()
        val totalDeductions = mutableMapOf<String, BigDecimal>()

        for (line in items) {
            require(line.quantity > 0) { "Số lượng món phải lớn hơn 0." }
            val recipe = dao.getActiveRecipe(line.variant.id)
                ?: error("Món ${line.product.name} (${line.variant.sizeLabel}) chưa có công thức ACTIVE.")
            val perItem = mutableMapOf<String, BigDecimal>()
            for (ingredient in dao.getRecipeItems(recipe.id)) {
                addQuantity(perItem, ingredient.ingredientId, ingredient.quantity)
            }
            for (selected in line.toppings) {
                require(selected.quantity > 0) { "Số lượng topping phải lớn hơn 0." }
                val toppingRecipe = dao.getToppingRecipeItems(selected.topping.id)
                check(toppingRecipe.isNotEmpty()) {
                    "Topping ${selected.topping.name} chưa có công thức nguyên liệu."
                }
                for (ingredient in toppingRecipe) {
                    val quantity = parseQuantity(ingredient.quantity)
                        .multiply(BigDecimal(selected.quantity))
                    perItem[ingredient.ingredientId] =
                        (perItem[ingredient.ingredientId] ?: BigDecimal.ZERO).add(quantity)
                }
            }
            check(perItem.isNotEmpty()) { "Công thức món ${line.product.name} không có nguyên liệu; chưa thể bán." }

            val payloadConsumptions = JSONArray()
            for ((ingredientId, quantityPerItem) in perItem.toSortedMap()) {
                val ingredient = dao.getIngredient(ingredientId)
                    ?: error("Thiếu nguyên liệu $ingredientId trong dữ liệu POS.")
                val quantityTotal = quantityPerItem.multiply(BigDecimal(line.quantity))
                val perItemText = decimalText(quantityPerItem)
                val totalText = decimalText(quantityTotal)
                consumptions += SaleItemConsumptionEntity(
                    saleItemId = line.lineId,
                    saleId = saleId,
                    recipeVersionId = recipe.id,
                    ingredientId = ingredientId,
                    ingredientNameSnapshot = ingredient.name,
                    unitSnapshot = ingredient.baseUnit,
                    quantityPerItem = perItemText,
                    quantityTotal = totalText
                )
                totalDeductions[ingredientId] =
                    (totalDeductions[ingredientId] ?: BigDecimal.ZERO).add(quantityTotal)
                payloadConsumptions.put(JSONObject()
                    .put("ingredientId", ingredientId)
                    .put("ingredientNameSnapshot", ingredient.name)
                    .put("unitSnapshot", ingredient.baseUnit)
                    .put("quantityPerItem", perItemText)
                    .put("quantityTotal", totalText))
            }
            check(lineSnapshots.put(line.lineId, recipe.id to payloadConsumptions) == null) {
                "Mã dòng hàng bị trùng trong một đơn."
            }
        }

        val balancesAfter = mutableMapOf<String, String>()
        val movements = mutableListOf<LocalStockMovementEntity>()
        for ((ingredientId, deduction) in totalDeductions.toSortedMap()) {
            val balance = dao.getStockBalance(ingredientId)
                ?: error("Chưa đồng bộ tồn kho nguyên liệu $ingredientId; không thể bán offline.")
            check(balance.storeId == storeId) { "Số dư kho không thuộc chi nhánh đã kích hoạt." }
            val remaining = parseNonNegative(balance.quantity).subtract(deduction)
            check(remaining.signum() >= 0) { "Không đủ tồn kho cho nguyên liệu $ingredientId." }
            val remainingText = decimalText(remaining)
            balancesAfter[ingredientId] = remainingText
            movements += LocalStockMovementEntity(
                id = UUID.randomUUID().toString(),
                saleId = saleId,
                operationId = operationId,
                ingredientId = ingredientId,
                quantityDelta = decimalText(deduction.negate()),
                balanceAfter = remainingText,
                createdAt = now
            )
        }
        return InventorySalePlan(lineSnapshots, consumptions, movements, balancesAfter)
    }

    private fun addQuantity(target: MutableMap<String, BigDecimal>, id: String, raw: String) {
        target[id] = (target[id] ?: BigDecimal.ZERO).add(parseQuantity(raw))
    }
}

internal fun parseQuantity(raw: String): BigDecimal {
    val quantity = raw.toBigDecimalOrNull() ?: error("Số lượng nguyên liệu không hợp lệ.")
    require(quantity.signum() > 0 && quantity.scale() <= 3) {
        "Số lượng nguyên liệu phải dương và có tối đa 3 chữ số thập phân."
    }
    return quantity
}

internal fun parseNonNegative(raw: String): BigDecimal {
    val quantity = raw.toBigDecimalOrNull() ?: error("Số dư kho không hợp lệ.")
    require(quantity.signum() >= 0 && quantity.scale() <= 3) { "Số dư kho không hợp lệ." }
    return quantity
}

internal fun decimalText(value: BigDecimal): String {
    require(value.scale() <= 3) { "Số lượng vượt độ chính xác kho (3 chữ số thập phân)." }
    return value.stripTrailingZeros().toPlainString()
}
