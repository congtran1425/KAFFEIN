package vn.id.congtc145.coffeepos

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.CashSaleRepository
import vn.id.congtc145.coffeepos.data.local.entity.*
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.sync.CatalogSyncRepository
import vn.id.congtc145.coffeepos.data.sync.OutboxSyncRepository
import vn.id.congtc145.coffeepos.data.sync.OutboxSyncResult
import vn.id.congtc145.coffeepos.domain.saleLinePriceSnapshot
import vn.id.congtc145.coffeepos.ui.order.OrderJsonSerializer
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Opt-in Jest sandbox only. Never uses the installed app's operational DB/credentials. */
class PosServerRehearsalTest {
    @Test fun catalogReceivingOfflineCashReconcilesWithLiveApi() = runBlocking {
        val control = InstrumentationRegistry.getArguments().getString("rehearsalControlUrl")
        org.junit.Assume.assumeTrue("Sandbox harness required", control == "http://10.0.2.2:3011/")
        val f = JSONObject(http("GET", "${control}fixture").body)
        val web = "http://10.0.2.2:3010/api/v1/"
        val api = PosApiClient("${control}api/v1/")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val dbName = "rehearsal-${UUID.randomUUID()}.db"
        var db = Room.databaseBuilder(context, AppDatabase::class.java, dbName).build()
        val session = api.enroll(f.getString("activationCode"), "Isolated Android rehearsal")
        val owner = f.getString("ownerAuth")
        val ingredientId = f.getString("ingredientId")
        val productId = f.getString("productId")
        val variantId = f.getString("variantId")
        val toppingId = f.getString("toppingId")
        suspend fun ownerCall(method: String, path: String, body: JSONObject? = null, key: String? = null) = http(method, web + path, owner, body, key)
        suspend fun pull() = CatalogSyncRepository(db, api).pull(session)
        try {
            val cashier = api.cashierLogin(session, f.getString("employeeCode"), f.getString("pin"))
            pull()
            val products = db.catalogDao().getAllProducts().first()
            assertTrue(products.any { it.id == productId && it.basePrice == 35000L })
            assertFalse(products.any { it.id == f.getString("hiddenProductId") || it.id == f.getString("noSizeProductId") })
            assertFalse(db.catalogDao().getAllVariants().first().any { it.id == f.getString("inactiveVariantId") })
            val availableWeb = JSONArray(http("GET", web + "products", owner).body)
            assertEquals((0 until availableWeb.length()).map { availableWeb.getJSONObject(it).getString("id") }.toSet(), products.map { it.id }.toSet())
            assertEquals("1000", db.inventoryDao().getStockBalance(ingredientId)?.quantity)

            assertEquals(200, ownerCall("PATCH", "product-variants/$variantId/price", JSONObject().put("priceVnd", "37000")).status)
            assertEquals(200, ownerCall("PATCH", "product-categories/${f.getString("categoryId")}/tax", JSONObject().put("taxRateBps", 1000)).status)
            assertEquals(200, ownerCall("PATCH", "toppings/$toppingId/price", JSONObject().put("priceVnd", "6000")).status)
            pull()
            assertEquals(37000L, db.catalogDao().getAllVariants().first().single { it.id == variantId }.priceVnd)
            assertEquals(1000, db.catalogDao().getAllProducts().first().single { it.id == productId }.taxRateBps)
            assertEquals(6000L, db.catalogDao().getAllToppings().first().single { it.id == toppingId }.price)
            assertEquals(200, ownerCall("PATCH", "products/$productId/status", JSONObject().put("isActive", false)).status)
            pull()
            assertFalse(db.catalogDao().getAllProducts().first().any { it.id == productId })
            assertEquals(200, ownerCall("PATCH", "products/$productId/status", JSONObject().put("isActive", true)).status)
            pull()

            // Android API gateway outage; web still reaches the isolated backend.
            http("POST", "${control}control/offline")
            val imported = ownerCall("POST", "stores/${session.storeId}/stock-receipts/import-csv", JSONObject()
                .put("sourceType", "CENTRAL_WAREHOUSE_UNTRACKED").put("sourceName", "Synthetic warehouse")
                .put("csvContent", "ingredient_code,received_quantity,unit_cost_vnd,note\n${f.getString("ingredientCode")},100,1,rehearsal"))
            assertEquals(201, imported.status)
            val receipt = JSONObject(imported.body)
            assertEquals("DRAFT", receipt.getString("status"))
            val receiptId = receipt.getString("id")
            val key = UUID.randomUUID().toString()
            assertEquals(400, ownerCall("POST", "stock-receipts/$receiptId/post", key = key).status)
            assertEquals("1000", db.inventoryDao().getStockBalance(ingredientId)?.quantity)
            http("POST", "${control}control/online")
            api.heartbeat(session, "rehearsal", false, 0)
            assertEquals(200, ownerCall("POST", "stock-receipts/$receiptId/post", key = key).status)
            assertEquals(200, ownerCall("POST", "stock-receipts/$receiptId/post", key = key).status)
            assertEquals("1000", db.inventoryDao().getStockBalance(ingredientId)?.quantity)
            pull()
            assertEquals("1100", db.inventoryDao().getStockBalance(ingredientId)?.quantity)

            val registerId = UUID.randomUUID().toString()
            val register = http("POST", web + "register-sessions", "Device ${session.credential}", JSONObject().put("id", registerId).put("openingCashVnd", 500000))
            assertEquals(201, register.status)
            db.registerSessionDao().insert(RegisterSessionEntity(registerId, session.storeId, session.deviceId, cashier.employeeCode, cashier.employeeName, 500000))
            val line = OrderLineItem(UUID.randomUUID().toString(),
                db.catalogDao().getAllProducts().first().single { it.id == productId },
                db.catalogDao().getAllVariants().first().single { it.id == variantId },
                listOf(SelectedTopping(db.catalogDao().getAllToppings().first().single { it.id == toppingId })), note = "Không đường; vẫn trừ định mức")
            val price = saleLinePriceSnapshot(line)
            val saleId = UUID.randomUUID().toString()
            val operationId = UUID.randomUUID().toString()
            val sale = SaleEntity(saleId, "REH-${saleId.take(8)}", session.storeId, session.storeName,
                cashier.employeeCode, cashier.employeeName, registerId, OrderJsonSerializer.serializeOrderItems(listOf(line)),
                price.subtotalVnd, price.taxAmountVnd, price.lineTotalVnd, "CASH", 50000, 50000 - price.lineTotalVnd)
            http("POST", "${control}control/offline")
            CashSaleRepository(db).complete(sale, listOf(line), operationId)
            assertEquals("1078", db.inventoryDao().getStockBalance(ingredientId)?.quantity)
            assertEquals(1, db.salesDao().countUnsyncedOperations())
            assertEquals(OutboxSyncResult.RETRY, OutboxSyncRepository(db, api).sync(session, "rehearsal"))
            db.close()
            db = Room.databaseBuilder(context, AppDatabase::class.java, dbName).build()
            assertEquals(saleId, db.salesDao().observePaidSales().first().single().id)
            assertEquals(1, db.salesDao().countUnsyncedOperations())
            assertTrue(runCatching { pull() }.isFailure)
            val operation = db.salesDao().getNextUnsyncedOperation()!!
            assertEquals(200, ownerCall("PATCH", "product-variants/$variantId/price", JSONObject().put("priceVnd", "39000")).status)
            http("POST", "${control}control/online")
            api.heartbeat(session, "rehearsal", true, 1)
            val blockedDraft = ownerCall("POST", "stores/${session.storeId}/stock-receipts", JSONObject()
                .put("sourceType", "EXTERNAL_SUPPLIER").put("sourceName", "Synthetic supplier")
                .put("lines", JSONArray().put(JSONObject().put("ingredientId", ingredientId).put("receivedQuantity", 10).put("unitCostVnd", 1))))
            assertEquals(201, blockedDraft.status)
            assertEquals(400, ownerCall("POST", "stock-receipts/${JSONObject(blockedDraft.body).getString("id")}/post", key = UUID.randomUUID().toString()).status)
            assertEquals(OutboxSyncResult.SUCCESS, OutboxSyncRepository(db, api).sync(session, "rehearsal"))
            assertEquals(0, db.salesDao().countUnsyncedOperations())
            assertEquals("1078", db.inventoryDao().getStockBalance(ingredientId)?.quantity)
            assertEquals("ALREADY_PROCESSED", api.syncPush(session, operation).status)
            assertEquals(39000L, db.catalogDao().getAllVariants().first().single { it.id == variantId }.priceVnd)
            assertEquals(43000L, db.salesDao().observePaidSales().first().single().totalVnd)
            CatalogSyncRepository(db, api).pull(session, forceSnapshot = true)
            assertEquals(saleId, db.salesDao().observePaidSales().first().single().id)
            assertEquals("1078", db.inventoryDao().getStockBalance(ingredientId)?.quantity)
            val insufficientLine = line.copy(lineId = UUID.randomUUID().toString(), quantity = 1000)
            assertTrue(runCatching { CashSaleRepository(db).complete(sale.copy(id = UUID.randomUUID().toString()), listOf(insufficientLine), UUID.randomUUID().toString()) }.isFailure)
            assertEquals(1, db.salesDao().observePaidSales().first().size)
            assertEquals("1078", db.inventoryDao().getStockBalance(ingredientId)?.quantity)
        } finally {
            db.close()
            context.deleteDatabase(dbName) // only this unique test-created database
        }
    }

    private data class Response(val status: Int, val body: String)
    private suspend fun http(method: String, url: String, auth: String? = null, body: JSONObject? = null, key: String? = null): Response = withContext(Dispatchers.IO) {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            auth?.let { connection.setRequestProperty("Authorization", it) }
            key?.let { connection.setRequestProperty("idempotency-key", it) }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            Response(status, (if (status < 400) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}")
        } finally { connection.disconnect() }
    }
}
