package vn.id.congtc145.coffeepos.data.local

import androidx.room.withTransaction
import org.json.JSONArray
import org.json.JSONObject
import vn.id.congtc145.coffeepos.BuildConfig
import vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.network.PosApiException
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.data.sync.CatalogSyncRepository
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import java.time.Instant
import java.util.UUID
import vn.id.congtc145.coffeepos.domain.PaidReceiptLine
import vn.id.congtc145.coffeepos.domain.matchPaidReceiptLines
import vn.id.congtc145.coffeepos.domain.saleLinePriceSnapshot

/** Online settlement is server-owned. Never create a cash outbox or deduct stock here. */
class OnlinePaymentRepository(
    private val database: AppDatabase,
    private val api: PosApiClient = PosApiClient()
) {
    private val dao = database.onlinePaymentDao()

    suspend fun prepare(session: DeviceSession, items: List<OrderLineItem>, total: Long,
                        cashierCode: String, cashierName: String, provider: String): OnlinePaymentAttemptEntity {
        require(provider == "ZALOPAY" || provider == "MOMO")
        if (provider == "MOMO") require(total in 1_000..50_000_000) { "MoMo hỗ trợ số tiền từ 1.000 đến 50.000.000 đ." }
        require(total in 1..9_007_199_254_740_991L && items.size in 1..100)
        require(items.all { item ->
            runCatching { UUID.fromString(item.lineId) }.isSuccess && item.product.id.isNotEmpty() && item.product.id.all(Char::isDigit) &&
                item.variant.id.isNotEmpty() && item.variant.id.all(Char::isDigit) && item.quantity > 0 &&
                item.toppings.all { it.topping.id.isNotEmpty() && it.topping.id.all(Char::isDigit) && it.quantity > 0 }
        }) { "Giỏ chứa mã món hoặc số lượng không hợp lệ. Hãy đồng bộ và rà lại đơn." }
        check(api.onlinePaymentAvailable(session, provider)) { "Server chưa cấu hình ${providerLabel(provider)} Sandbox." }
        return database.withTransaction {
            DeviceAccessState.assertAllowed()
            check(dao.getUnresolved() == null) { "Đang có giao dịch QR chưa được đối soát." }
            check(database.salesDao().countUnsyncedOperations() == 0) { "Cần đồng bộ toàn bộ Outbox trước khi tạo QR." }
            check(database.catalogDao().getSyncState()?.hasBootstrap == true) { "Cần đồng bộ thực đơn trước." }
            val register = database.registerSessionDao().getOpenSession() ?: error("Cần mở phiên quỹ trước.")
            check(register.actualCashVnd == null) { "Phiên quỹ đang chốt kiểm đếm. Hoàn tất chốt quỹ trước khi bán tiếp." }
            check(register.storeId == session.storeId && register.deviceId == session.deviceId)
            val json = OrderJsonSerializer.serializeOrderItems(items)
            val active = database.activeCartDao().get() ?: error("Giỏ hàng chưa được lưu.")
            check(active.storeId == session.storeId && active.deviceId == session.deviceId && active.itemsJson == json) {
                "Giỏ đã thay đổi. Hãy mở lại checkout."
            }
            OnlinePaymentAttemptEntity(UUID.randomUUID().toString(), session.storeId, session.deviceId,
                register.id, cashierCode, cashierName, json, total, System.currentTimeMillis(), "CREATING",
                provider = provider)
                .also { dao.insert(it) }
        }
    }

    private fun requestBody(attempt: OnlinePaymentAttemptEntity): JSONObject {
        val lines = JSONArray()
        OrderJsonSerializer.deserializeOrderItemsStrict(attempt.itemsJson).forEach { item ->
            lines.put(JSONObject().put("id", item.lineId).put("productId", item.product.id)
                .put("productVariantId", item.variant.id).put("quantity", item.quantity).put("note", item.note)
                .put("toppings", JSONArray().apply {
                    item.toppings.forEach { put(JSONObject().put("toppingId", it.topping.id).put("quantityPerItem", it.quantity)) }
                }))
        }
        return JSONObject().put("saleId", attempt.saleId).put("registerSessionId", attempt.registerSessionId)
            .put("expectedTotalVnd", attempt.totalVnd).put("items", lines).put("provider", attempt.provider)
    }

    suspend fun reconcile(session: DeviceSession, attempt: OnlinePaymentAttemptEntity, refresh: Boolean = false) {
        check(session.storeId == attempt.storeId && session.deviceId == attempt.deviceId) {
            "Giao dịch chờ thuộc thiết bị/chi nhánh khác."
        }
        var response = try {
            if (refresh && attempt.provider == "ZALOPAY") api.checkPaymentAttempt(session, attempt.saleId)
            else api.paymentAttempt(session, attempt.saleId)
        } catch (error: PosApiException) {
            if (error.statusCode != 404 || attempt.status == "PAID_RECONCILING") throw error
            // No new UUID after response loss. Retry exactly the persisted cart/attempt.
            check(database.salesDao().countUnsyncedOperations() == 0) { "Outbox chưa trống." }
            api.heartbeat(session, BuildConfig.VERSION_NAME, false, 0)
            api.initiateOnlinePayment(session, requestBody(attempt))
        }
        if (response.optBoolean("canSubmit")) {
            check(attempt.status != "PAID_RECONCILING") { "Đơn đã nhận tiền; không được tạo lại QR." }
            response = api.initiateOnlinePayment(session, requestBody(attempt))
        }
        applyResponse(session, attempt, response)
    }

    private suspend fun applyResponse(session: DeviceSession, attempt: OnlinePaymentAttemptEntity, response: JSONObject) {
        val paymentId = response.optString("id", response.optString("paymentId")).takeIf { it.isNotBlank() && it != "null" }
            ?: attempt.paymentId
        check(response.getString("saleId") == attempt.saleId && response.getString("amountVnd").toLong() == attempt.totalVnd) {
            "Kết quả payment không khớp giỏ đã xác nhận."
        }
        check(response.optString("method", attempt.provider) == attempt.provider) {
            "Cổng thanh toán server không khớp giao dịch đang đối soát."
        }
        val status = response.optString("checkoutState", "WAITING")
        check(attempt.status != "CANCELLED" || status == "CANCELLED") { "Attempt đã hủy không được hoàn tất lại." }
        check(attempt.paymentId == null || paymentId == attempt.paymentId) { "Mã payment không khớp giao dịch đang đối soát." }
        check(attempt.status != "PAID_RECONCILING" || status == "PAID") { "Đơn đã nhận tiền; cần tiếp tục đối soát biên lai." }
        if (status == "PAID") {
            dao.update(attempt.saleId, "PAID_RECONCILING", paymentId, null, attempt.expiresAt)
            importPaid(session, attempt)
            return
        }
        check(status in setOf("WAITING", "RECONCILING", "FINAL_UNPAID", "CANCELLED")) { "Trạng thái payment không hợp lệ." }
        val expires = response.optString("expiresAt").takeIf { it.isNotBlank() && it != "null" }?.let { Instant.parse(it).toEpochMilli() }
        dao.update(attempt.saleId, status, paymentId,
            if (status == "WAITING") response.optString("qrCode").takeIf { it.isNotBlank() } else null, expires)
    }

    suspend fun cancel(session: DeviceSession, attempt: OnlinePaymentAttemptEntity) {
        check(session.storeId == attempt.storeId && session.deviceId == attempt.deviceId) {
            "Giao dịch chờ thuộc thiết bị/chi nhánh khác."
        }
        if (attempt.status == "PAID_RECONCILING") {
            reconcile(session, attempt)
            return
        }
        val response = try {
            api.cancelZaloPay(session, attempt.saleId)
        } catch (error: PosApiException) {
            if (error.statusCode != 409) throw error
            // Callback can beat the cancel request. Read authoritative status
            // and import the paid receipt, rather than trapping the cart on 409.
            reconcile(session, attempt)
            return
        }
        // A 2xx alone does not release the cart. CANCELLED is a server tombstone;
        // FINAL_UNPAID is provider-confirmed. Both preserve the cancelled attempt.
        check(response.has("checkoutState")) { "Máy chủ chưa xác nhận kết quả hủy QR." }
        applyResponse(session, attempt, response)
    }

    private suspend fun importPaid(session: DeviceSession, attempt: OnlinePaymentAttemptEntity) {
        val remote = api.paidSale(session, attempt.saleId)
        check(remote.getString("id") == attempt.saleId && remote.getString("storeId") == attempt.storeId &&
            remote.getString("deviceId") == attempt.deviceId && remote.getString("status") == "PAID" &&
            remote.getString("registerSessionId") == attempt.registerSessionId &&
            remote.getString("totalVnd").toLong() == attempt.totalVnd) { "Biên lai server không khớp giao dịch." }
        val payments = remote.getJSONArray("payments")
        val matchingPayments = (0 until payments.length()).map { payments.getJSONObject(it) }.filter { payment ->
            payment.optString("method") == attempt.provider &&
                payment.optString("provider") == "${attempt.provider}_SANDBOX" &&
                payment.optString("status") == "PAID" &&
                payment.optString("amountVnd").toLongOrNull() == attempt.totalVnd
        }
        check(matchingPayments.size == 1) { "Phương thức thanh toán trên biên lai không khớp attempt." }
        val original = OrderJsonSerializer.deserializeOrderItemsStrict(attempt.itemsJson)
        val lines = remote.getJSONArray("items")
        val receiptLines = (0 until lines.length()).map { index ->
            val line = lines.getJSONObject(index)
            val tops = line.getJSONArray("toppings")
            PaidReceiptLine(id = line.getString("id"), productId = line.getString("productId"),
                variantId = line.getString("variantId"), productName = line.getString("productName"),
                variantName = line.getString("variantName"), baseUnitPriceVnd = line.getString("baseUnitPriceVnd").toLong(),
                taxRateBps = line.getInt("taxRateBps"), note = if (line.isNull("note")) "" else line.optString("note", ""),
                quantity = line.getInt("quantity"),
                toppings = (0 until tops.length()).map { t ->
                    val top = tops.getJSONObject(t)
                    SelectedTopping(ToppingEntity(top.getString("toppingId"), top.getString("toppingName"),
                        top.getString("unitPriceVnd").toLong()), top.getInt("quantityPerItem"))
                })
        }
        val paidItems = matchPaidReceiptLines(original, receiptLines)
        val prices = paidItems.map(::saleLinePriceSnapshot)
        check(prices.sumOf { it.lineTotalVnd } == attempt.totalVnd &&
            prices.sumOf { it.subtotalVnd } == remote.getString("subtotalVnd").toLong() &&
            prices.sumOf { it.taxAmountVnd } == remote.getString("taxVnd").toLong() &&
            prices.indices.all { index ->
                val line = lines.getJSONObject(index)
                line.getString("lineTotalVnd").toLong() == prices[index].lineTotalVnd &&
                    line.getString("subtotalVnd").toLong() == prices[index].subtotalVnd &&
                    line.getString("taxAmountVnd").toLong() == prices[index].taxAmountVnd
            }) { "Số tiền hoặc VAT trên biên lai không khớp giỏ đã xác nhận." }
        val sale = SaleEntity(attempt.saleId, remote.getString("saleNumber"), attempt.storeId, session.storeName,
            attempt.cashierCode, attempt.cashierName, attempt.registerSessionId, OrderJsonSerializer.serializeOrderItems(paidItems),
            remote.getString("subtotalVnd").toLong(), remote.getString("taxVnd").toLong(), attempt.totalVnd,
            attempt.provider, 0, 0, completedAt = Instant.parse(remote.getString("completedAt")).toEpochMilli())
        database.withTransaction {
            if (database.salesDao().getSale(attempt.saleId) == null) database.salesDao().insertSale(sale)
            dao.update(attempt.saleId, "PAID_RECONCILING", dao.get(attempt.saleId)?.paymentId, null, attempt.expiresAt)
        }
        // Keep cash blocked until authoritative post-settlement stock is in Room.
        CatalogSyncRepository(database, api).pull(session, forceSnapshot = true)
        database.withTransaction {
            val active = database.activeCartDao().get()
            if (active != null && active.storeId == attempt.storeId && active.deviceId == attempt.deviceId) {
                val originalIds = original.map { it.lineId }.toSet()
                val remaining = OrderJsonSerializer.deserializeOrderItemsStrict(active.itemsJson).filterNot { it.lineId in originalIds }
                if (remaining.isEmpty()) database.activeCartDao().clear()
                else database.activeCartDao().save(active.copy(itemsJson = OrderJsonSerializer.serializeOrderItems(remaining)))
            }
            dao.update(attempt.saleId, "PAID", dao.get(attempt.saleId)?.paymentId, null, attempt.expiresAt)
        }
    }

    private fun providerLabel(provider: String) = if (provider == "MOMO") "MoMo" else "ZaloPay"
}
