package vn.id.congtc145.coffeepos

import org.junit.Assert.assertEquals
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping

class OrderLineItemPriceTest {
    @Test
    fun usesServerVariantPriceWithoutFixedSizeSurcharge() {
        val product = CatalogProduct(
            id = "10", code = "CF01", name = "Cà phê đen", categoryId = "1",
            category = "Cà phê", basePrice = 29_000, taxRateBps = 0,
            isAvailable = true, description = "", allowedToppingIdsJson = "[\"1\"]"
        )
        val variant = ProductVariantEntity(
            id = "22", productId = "10", code = "L", sizeLabel = "Size L",
            priceVnd = 35_000, isDefault = false
        )
        val item = OrderLineItem(
            lineId = "line-1", product = product, variant = variant,
            toppings = listOf(SelectedTopping(ToppingEntity("1", "Trân châu", 10_000), 2)),
            quantity = 2
        )

        assertEquals(55_000L, item.unitPrice)
        assertEquals(110_000L, item.totalLinePrice)
    }
}
