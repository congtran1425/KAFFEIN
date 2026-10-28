package vn.id.congtc145.coffeepos.domain

val cashDenominations = listOf(500_000L, 200_000L, 100_000L, 50_000L, 20_000L, 10_000L, 5_000L, 2_000L, 1_000L)
const val MAX_CASH_COUNT_AMOUNT = 999_999_999L

/** Quantity input; the first digit after selecting a row replaces its previous count. */
data class CashCountInput(
    val counts: Map<Long, Int> = emptyMap(),
    val selected: Long = 200_000L,
    val replaceOnDigit: Boolean = true,
    val error: String? = null
) {
    val total: Long get() = counts.entries.sumOf { it.key * it.value.toLong() }
    val quantity: Int get() = counts[selected] ?: 0

    fun select(denomination: Long): CashCountInput =
        if (denomination in cashDenominations) copy(selected = denomination, replaceOnDigit = true, error = null) else this

    fun digit(value: String): CashCountInput {
        if (value.length != 1 || value[0] !in '0'..'9') return this
        val next = if (replaceOnDigit) value.toLong() else quantity.toLong() * 10 + value.toLong()
        return setCount(selected, next, replace = false)
    }

    fun adjust(denomination: Long, delta: Int): CashCountInput =
        setCount(denomination, ((counts[denomination] ?: 0).toLong() + delta).coerceAtLeast(0), replace = true)

    fun clearSelected(): CashCountInput = setCount(selected, 0, replace = true)
    fun backspace(): CashCountInput = setCount(selected, quantity.toLong() / 10, replace = false)

    private fun setCount(denomination: Long, value: Long, replace: Boolean): CashCountInput {
        if (denomination !in cashDenominations) return this
        val candidateTotal = total - denomination * (counts[denomination] ?: 0) + denomination * value
        if (value > 99_999 || candidateTotal > MAX_CASH_COUNT_AMOUNT)
            return copy(error = "Số tiền kiểm đếm tối đa 999.999.999 đ.")
        return copy(counts = counts + (denomination to value.toInt()), selected = denomination,
            replaceOnDigit = replace, error = null)
    }
}

fun validCashCountSnapshot(amount: Long, counts: Map<Long, Int>): Boolean =
    amount in 0..MAX_CASH_COUNT_AMOUNT && counts.all { (denomination, quantity) ->
        denomination in cashDenominations && quantity in 0..99_999
    } && counts.entries.sumOf { it.key * it.value.toLong() } == amount

fun mergeCashCounts(a: Map<Long, Int>, b: Map<Long, Int>): Map<Long, Int> =
    cashDenominations.associateWith { Math.addExact(a[it] ?: 0, b[it] ?: 0) }.filterValues { it > 0 }

fun validCashCompensation(variance: Long, compensation: Map<Long, Int>): Boolean {
    val total = CashCountInput(counts = compensation).total
    return validCashCountSnapshot(total, compensation) &&
        if (variance < 0) total >= -variance else total == 0L
}
