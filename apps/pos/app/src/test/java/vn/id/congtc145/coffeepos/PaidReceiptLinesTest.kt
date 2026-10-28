package vn.id.congtc145.coffeepos

import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.entity.*
import vn.id.congtc145.coffeepos.domain.*
import vn.id.congtc145.coffeepos.ui.order.*

class PaidReceiptLinesTest {
    private val item = OrderLineItem("local-line", CatalogProduct("20", "CF", "Coffee", "10", "Coffee",
        35000, 800, true, "", "[]"), ProductVariantEntity("30", "20", "L", "L", 45000, true),
        listOf(SelectedTopping(ToppingEntity("40", "Pearl", 10000))), note = "Ít đá")
    private fun receipt(line: OrderLineItem = item, id: String = "server-line") = PaidReceiptLine(
        id, line.product.id, line.variant.id, "Server Coffee", "L", line.variant.priceVnd,
        line.product.taxRateBps, line.quantity, line.note, line.toppings)

    @Test fun serverReassignedIdStillMatchesCompleteQuoteAndKeepsLocalId() {
        val paid = matchPaidReceiptLines(listOf(item), listOf(receipt())).single()
        assertEquals(item.lineId, paid.lineId)
        assertEquals("Server Coffee", paid.product.name)
        assertEquals(55000L, paid.totalLinePrice)
    }

    @Test fun reorderingAndIdenticalRepeatedLinesAreMatchedOneToOne() {
        val other = item.copy(lineId = "local-other", note = "Không đá")
        val repeated = item.copy(lineId = "local-repeat")
        val paid = matchPaidReceiptLines(listOf(item, other, repeated),
            listOf(receipt(other, "remote-other"), receipt(id = "remote-1"), receipt(id = "remote-2")))
        assertEquals(listOf("local-other", "local-line", "local-repeat"), paid.map { it.lineId })
    }

    @Test fun toppingOrderDoesNotAffectMatching() {
        val local = item.copy(toppings = item.toppings + SelectedTopping(ToppingEntity("41", "Cream", 15000), 2))
        assertEquals(local.lineId, matchPaidReceiptLines(listOf(local),
            listOf(receipt(local).copy(toppings = local.toppings.reversed()))).single().lineId)
    }

    @Test fun refusesWrongProductSizeQuantityNotePriceVatOrToppingEvenWhenTotalsMatch() {
        val valid = receipt()
        listOf(valid.copy(productId = "999"), valid.copy(variantId = "999"), valid.copy(quantity = 2),
            valid.copy(note = ""), valid.copy(baseUnitPriceVnd = 35000), valid.copy(taxRateBps = 0),
            valid.copy(toppings = listOf(SelectedTopping(ToppingEntity("999", "Different", 10000)))),
            valid.copy(toppings = listOf(item.toppings.single().copy(quantity = 2)))).forEach {
            assertTrue(runCatching { matchPaidReceiptLines(listOf(item), listOf(it)) }.isFailure)
        }
    }

    @Test fun refusesDuplicateRemoteIdExtraOrMissingLinesAndSameIdWithWrongContent() {
        val other = item.copy(lineId = "local-other", note = "Không đá")
        assertTrue(runCatching { matchPaidReceiptLines(listOf(item, other),
            listOf(receipt(id = "duplicate"), receipt(other, "duplicate"))) }.isFailure)
        assertTrue(runCatching { matchPaidReceiptLines(listOf(item), emptyList()) }.isFailure)
        assertTrue(runCatching { matchPaidReceiptLines(listOf(item), listOf(receipt(), receipt(id = "other"))) }.isFailure)
        assertTrue(runCatching { matchPaidReceiptLines(listOf(item),
            listOf(receipt(id = item.lineId).copy(note = "Changed"))) }.isFailure)
    }
}
