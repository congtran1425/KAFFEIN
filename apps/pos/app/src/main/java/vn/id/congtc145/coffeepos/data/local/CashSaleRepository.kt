package vn.id.congtc145.coffeepos.data.local

import androidx.room.withTransaction
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.data.sync.buildCashSaleOutboxPayload
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem

/** One production path for checkout: sale, stock, recipe evidence and outbox commit together. */
class CashSaleRepository(private val database: AppDatabase) {
    suspend fun complete(sale: SaleEntity, items: List<OrderLineItem>, operationId: String) {
        database.withTransaction {
            DeviceAccessState.assertAllowed()
            check(database.onlinePaymentDao().getUnresolved() == null) {
                "Có giao dịch thanh toán online đang chờ đối soát. Không thể thu tiền mặt."
            }
            check(database.catalogDao().getSyncState()?.hasBootstrap == true) {
                "Cần đồng bộ dữ liệu chi nhánh lần đầu trước khi bán hàng."
            }
            val register = database.registerSessionDao().getOpenSession()
            check(register != null && register.id == sale.registerSessionId && register.storeId == sale.storeId) {
                "Phiên tiền mặt không còn mở hoặc không thuộc chi nhánh."
            }
            require(sale.paymentMethod == "CASH" && sale.cashReceivedVnd >= sale.totalVnd)
            check(register.actualCashVnd == null) { "Phiên quỹ đang chốt kiểm đếm. Hoàn tất chốt quỹ trước khi bán tiếp." }
            require(items.isNotEmpty())
            val inventory = database.inventoryDao()
            val plan = InventorySalePlanner(inventory).plan(items, sale.id, operationId, sale.storeId, sale.completedAt)
            val payload = buildCashSaleOutboxPayload(sale, items, plan)
            database.salesDao().insertSale(sale)
            inventory.insertConsumptions(plan.consumptions)
            plan.balancesAfter.forEach { (ingredientId, quantity) ->
                check(inventory.updateStockBalance(ingredientId, sale.storeId, quantity) == 1) {
                    "Không cập nhật được tồn kho nguyên liệu $ingredientId."
                }
            }
            inventory.insertMovements(plan.movements)
            database.salesDao().insertOutbox(OutboxOperationEntity(
                operationId = operationId,
                operationType = "CASH_SALE_COMPLETED",
                payloadJson = payload,
                createdAt = sale.completedAt
            ))
            database.activeCartDao().clear()
            DeviceAccessState.assertAllowed()
        }
    }
}
