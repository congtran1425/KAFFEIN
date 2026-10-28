package vn.id.congtc145.coffeepos.domain

fun calculateInclusiveVat(grossAmountVnd: Long, taxRateBps: Int): Long {
    require(grossAmountVnd >= 0) { "grossAmountVnd must not be negative" }
    require(taxRateBps in 0..10_000) { "taxRateBps must be between 0 and 10000" }
    if (grossAmountVnd == 0L || taxRateBps == 0) return 0L

    val denominator = 10_000L + taxRateBps
    return (grossAmountVnd * taxRateBps + denominator / 2) / denominator
}
