package vn.id.congtc145.coffeepos.domain

import java.math.BigDecimal
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem

/** Prices already include VAT; never add the displayed VAT to the amount due. */
fun includedVatLabel(ratesBps: List<Int>): String {
    val rates = ratesBps.distinct()
    if (rates.size != 1 || rates.single() !in 0..10_000) return "VAT đã gồm"
    val percentage = BigDecimal.valueOf(rates.single().toLong(), 2)
        .stripTrailingZeros().toPlainString().replace('.', ',')
    return "VAT đã gồm ($percentage%)"
}

/** Reconcile the captured checkout with its line snapshots before any Room write. */
fun cashCheckoutValidationError(
    items: List<OrderLineItem>, subtotal: Long, vat: Long, total: Long, cashReceived: Long
): String? {
    return try {
        require(items.isNotEmpty()) { "Đơn hàng chưa có món." }
        require(cashReceived >= 0) { "Số tiền khách đưa không hợp lệ." }
        var expectedGross = 0L
        var expectedVat = 0L
        items.forEach { item ->
            require(item.quantity > 0 && item.variant.priceVnd >= 0) { "Giá hoặc số lượng món không hợp lệ." }
            require(item.toppings.all { it.quantity > 0 && it.topping.price >= 0 }) {
                "Giá hoặc số lượng topping không hợp lệ."
            }
            val unitPrice = item.toppings.fold(item.variant.priceVnd) { amount, topping ->
                Math.addExact(amount, Math.multiplyExact(topping.topping.price, topping.quantity.toLong()))
            }
            val gross = Math.multiplyExact(unitPrice, item.quantity.toLong())
            require(item.product.taxRateBps in 0..10_000) { "Thuế suất không hợp lệ." }
            // The shared inclusive-VAT formula uses Long; fail before it can wrap.
            Math.addExact(Math.multiplyExact(gross, item.product.taxRateBps.toLong()),
                (10_000L + item.product.taxRateBps) / 2)
            expectedGross = Math.addExact(expectedGross, gross)
            expectedVat = Math.addExact(expectedVat, calculateInclusiveVat(gross, item.product.taxRateBps))
        }
        require(subtotal == expectedGross && total == expectedGross && vat == expectedVat) {
            "Tổng tiền hoặc VAT không khớp giỏ hàng. Hãy quay lại kiểm tra đơn."
        }
        require(cashReceived >= total) { "Số tiền khách đưa chưa đủ." }
        null
    } catch (_: ArithmeticException) {
        "Số tiền vượt giới hạn xử lý. Hãy kiểm tra giá và số lượng."
    } catch (error: IllegalArgumentException) {
        error.message ?: "Dữ liệu thanh toán không hợp lệ."
    }
}

fun appendCashDigit(current: Long, digit: Int, limit: Long = 999_999_999L): Long {
    require(current >= 0 && digit in 0..9 && limit >= 0)
    if (digit > limit || current > (limit - digit) / 10) return limit
    return current * 10 + digit
}

fun appendCashFactor(current: Long, factor: Long, limit: Long = 999_999_999L): Long {
    require(current >= 0 && factor > 0 && limit >= 0)
    if (current == 0L) return 0L
    if (current > limit / factor) return limit
    return current * factor
}

