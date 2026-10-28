package vn.id.congtc145.coffeepos

import org.junit.Assert.assertEquals
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.domain.saleLinePriceSnapshot
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping

class SaleLinePriceSnapshotTest {
    @Test fun snapshotIncludesToppingQuantityAndInclusiveVat() {
        val product = CatalogProduct("1", "CF01", "Coffee", "1", "Coffee", 29000, 800, true, "", "[]")
        val variant = ProductVariantEntity("10", "1", "M", "M", 29000, true)
        val item = OrderLineItem("line", product, variant, listOf(SelectedTopping(ToppingEntity("2", "Topping", 5000), 2)), quantity = 3)
        val snapshot = saleLinePriceSnapshot(item)
        assertEquals(29000L, snapshot.baseUnitPriceVnd)
        assertEquals(39000L, snapshot.unitPriceVnd)
        assertEquals(117000L, snapshot.lineTotalVnd)
        assertEquals(800, snapshot.taxRateBps)
        assertEquals(8667L, snapshot.taxAmountVnd)
        assertEquals(snapshot.lineTotalVnd, snapshot.subtotalVnd + snapshot.taxAmountVnd)
    }
}
