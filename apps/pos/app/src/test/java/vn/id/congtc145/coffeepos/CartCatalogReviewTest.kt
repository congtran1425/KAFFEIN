package vn.id.congtc145.coffeepos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.OrderUiState
import vn.id.congtc145.coffeepos.ui.order.reviewCartAgainstCatalog

class CartCatalogReviewTest {
    private val product = CatalogProduct("1", "CF01", "Cà phê", "c", "Cà phê",
        35_000, 0, true, "", "[]")
    private val variant = ProductVariantEntity("v1", "1", "M", "M", 35_000, true)
    private val line = OrderLineItem("line", product, variant)

    @Test fun unchangedCartMayProceed() {
        val state = OrderUiState(cartItems = listOf(line), allProducts = listOf(product),
            availableVariants = listOf(variant))
        assertTrue(reviewCartAgainstCatalog(state).messages.isEmpty())
    }

    @Test fun changedPriceRequiresExplicitRefresh() {
        val state = OrderUiState(cartItems = listOf(line), allProducts = listOf(product),
            availableVariants = listOf(variant.copy(priceVnd = 39_000)))
        val review = reviewCartAgainstCatalog(state)
        assertEquals(1, review.messages.size)
        assertTrue(review.canRefreshPrices)
    }

    @Test fun unavailableVariantCannotBeAutoRefreshed() {
        val state = OrderUiState(cartItems = listOf(line), allProducts = listOf(product))
        val review = reviewCartAgainstCatalog(state)
        assertEquals(1, review.messages.size)
        assertFalse(review.canRefreshPrices)
    }
}
