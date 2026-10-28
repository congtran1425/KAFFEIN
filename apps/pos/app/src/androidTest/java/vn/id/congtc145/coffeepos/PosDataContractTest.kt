package vn.id.congtc145.coffeepos

import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.InventorySalePlan
import vn.id.congtc145.coffeepos.data.local.entity.*
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.data.sync.CatalogSyncRepository
import vn.id.congtc145.coffeepos.data.sync.buildCashSaleOutboxPayload
import vn.id.congtc145.coffeepos.ui.order.OrderLineItem
import vn.id.congtc145.coffeepos.ui.order.SelectedTopping
import java.net.ServerSocket
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

class PosDataContractTest {
    @Test fun registerCashTotalIncludesOnlyPaidCashSalesBoundToThatSession() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            fun sale(id: String, registerId: String, method: String, status: String, amount: Long) =
                SaleEntity(
                    id = id, saleNumber = id, storeId = "store-1", storeName = "Test store",
                    cashierCode = "1000001", cashierName = "Test cashier", registerSessionId = registerId,
                    itemsJson = "[]", subtotalVnd = amount, taxVnd = 0, totalVnd = amount,
                    paymentMethod = method, cashReceivedVnd = amount, changeVnd = 0,
                    status = status, completedAt = 1000L
                )
            val dao = database.salesDao()
            dao.insertSale(sale("cash-current", "register-current", "CASH", "PAID", 35_000))
            dao.insertSale(sale("cash-previous", "register-previous", "CASH", "PAID", 90_000))
            dao.insertSale(sale("qr-current", "register-current", "ZALOPAY_QR", "PAID", 57_000))
            dao.insertSale(sale("pending-current", "register-current", "CASH", "PAYMENT_PENDING", 19_000))

            assertEquals(35_000L, dao.cashSalesForRegister("register-current"))
            assertEquals(35_000L, dao.observeCashSalesForRegister("register-current").first())
        } finally {
            database.close()
        }
    }

    @Test fun outboxPushUsesDeviceCredentialAndKeepsOperationIdForAck() = runBlocking {
        ServerSocket(0).use { server ->
            server.soTimeout = 10_000
            val capture = FutureTask<Pair<Boolean, JSONObject>> {
                server.accept().use { socket ->
                    socket.soTimeout = 10_000
                    val reader = socket.getInputStream().bufferedReader()
                    val requestLine = reader.readLine()
                    var length = 0
                    var authorized = false
                    while (true) {
                        val header = reader.readLine()
                        if (header.isEmpty()) break
                        if (header.startsWith("Content-Length:", true)) length = header.substringAfter(':').trim().toInt()
                        if (header.equals("Authorization: Device synthetic-test-credential", true)) authorized = true
                    }
                    val chars = CharArray(length)
                    var offset = 0
                    while (offset < length) offset += reader.read(chars, offset, length - offset)
                    val response = """{"processed":[{"operationId":"op-1","status":"ALREADY_PROCESSED"}],"errors":[]}""".toByteArray()
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${response.size}\r\nConnection: close\r\n\r\n".toByteArray())
                    socket.getOutputStream().write(response)
                    (authorized && requestLine == "POST /api/v1/sync/push HTTP/1.1") to JSONObject(String(chars))
                }
            }
            Thread(capture, "push-test-server").start()
            val session = DeviceSession("device-1", "1", "Test store", "synthetic-test-credential")
            val operation = OutboxOperationEntity("op-1", "CASH_SALE_COMPLETED", "{\"saleId\":\"sale-1\"}", createdAt = 1L)
            val outcome = PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/").syncPush(session, operation)
            val (correctRouteAndAuth, body) = capture.get(10, TimeUnit.SECONDS)
            assertTrue(correctRouteAndAuth)
            val sent = body.getJSONArray("operations").getJSONObject(0)
            assertEquals("op-1", sent.getString("operationId"))
            assertEquals("CASH_SALE_COMPLETED", sent.getString("type"))
            assertEquals("sale-1", sent.getJSONObject("payload").getString("saleId"))
            assertEquals("ALREADY_PROCESSED", outcome.status)
        }
    }

    @Test fun coldPullPersistsBackendShapedCatalogRecipeAndStockInRoom() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val session = DeviceSession("device-1", "1", "Test store", "synthetic-test-credential")
        try {
            ServerSocket(0).use { server ->
                server.soTimeout = 10_000
                val capture = FutureTask<Boolean> {
                    server.accept().use { socket ->
                        socket.soTimeout = 10_000
                        val reader = socket.getInputStream().bufferedReader()
                        val requestLine = reader.readLine()
                        val headers = mutableListOf<String>()
                        while (true) {
                            val header = reader.readLine()
                            if (header.isEmpty()) break
                            headers += header
                        }
                        val response = """{"changes":[
                            {"cursor":"7","entityType":"product_categories","entityId":"10","changeType":"UPSERT","payload":{"id":"10","name":"Cà phê","sortOrder":1,"taxRateBps":0}},
                            {"cursor":"7","entityType":"products","entityId":"20","changeType":"UPSERT","payload":{"id":"20","categoryId":"10","code":"CF01","name":"Cà phê sữa","description":"","variants":[{"id":"30","code":"M","sizeLabel":"M","priceVnd":"35000","isDefault":true}],"allowedToppingIds":[]}},
                            {"cursor":"7","entityType":"ingredients","entityId":"40","changeType":"UPSERT","payload":{"id":"40","code":"CF","name":"Cà phê","baseUnit":"g","isActive":true}},
                            {"cursor":"7","entityType":"recipes","entityId":"50","changeType":"UPSERT","payload":{"id":"50","productVariantId":"30","versionNo":1,"status":"ACTIVE","items":[{"ingredientId":"40","quantity":"10"}]}},
                            {"cursor":"7","entityType":"stock_balances","entityId":"40","changeType":"UPSERT","payload":{"storeId":"1","ingredientId":"40","quantity":"100","updatedAt":"2026-10-08T00:00:00Z"}}
                        ],"nextCursor":"7","hasMore":false,"serverTime":"2026-10-08T00:00:00Z"}""".trimIndent().toByteArray()
                        socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${response.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        socket.getOutputStream().write(response)
                        requestLine == "GET /api/v1/sync/pull?cursor=0&limit=100 HTTP/1.1" &&
                            headers.any { it.equals("Authorization: Device synthetic-test-credential", true) }
                    }
                }
                Thread(capture, "pull-test-server").start()
                CatalogSyncRepository(database, PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/")).pull(session)
                assertTrue(capture.get(10, TimeUnit.SECONDS))
                assertEquals("7", database.catalogDao().getSyncState()?.cursor)
                assertEquals("Cà phê sữa", database.catalogDao().getAllProducts().first().single().name)
                assertEquals("35000", database.catalogDao().getAllVariants().first().single().priceVnd.toString())
                assertEquals("50", database.inventoryDao().getActiveRecipe("30")?.id)
                assertEquals("10", database.inventoryDao().getRecipeItems("50").single().quantity)
                assertEquals("100", database.inventoryDao().getStockBalance("40")?.quantity)
            }
        } finally { database.close() }
    }

    @Test fun legacyCatalogBootstrapReplacesExistingCatalogWithoutAcknowledgingMarker() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val session = DeviceSession("device-1", "1", "Test store", "synthetic-test-credential")
        try {
            seedCatalogBeforeReset(database)
            ServerSocket(0).use { server ->
                val requests = servePullResponses(server, listOf(
                    """{"changes":[{"cursor":"6","entityType":"catalog_bootstrap","entityId":"full_update","changeType":"UPSERT","payload":{"message":"updated"}}],"nextCursor":"6","hasMore":false}""",
                    """{"changes":[
                        {"cursor":"7","entityType":"product_categories","entityId":"11","changeType":"UPSERT","payload":{"id":"11","name":"Trà","sortOrder":1,"taxRateBps":0,"isActive":true}},
                        {"cursor":"7","entityType":"products","entityId":"21","changeType":"UPSERT","payload":{"id":"21","categoryId":"11","code":"TEA01","name":"Trà đào","description":"","isActive":true,"variants":[{"id":"31","code":"M","sizeLabel":"M","priceVnd":"39000","isDefault":true}],"allowedToppingIds":[]}}
                    ],"nextCursor":"7","hasMore":false}""".trimIndent()
                ))
                CatalogSyncRepository(database, PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/")).pull(session)
                assertEquals(listOf("5", "0"), requests.get(10, TimeUnit.SECONDS))
                assertEquals("7", database.catalogDao().getSyncState()?.cursor)
                val products = database.catalogDao().getAllProducts().first()
                assertEquals(listOf("TEA01"), products.map { it.code })
                assertEquals("39000", database.catalogDao().getAllVariants().first().single().priceVnd.toString())
            }
        } finally { database.close() }
    }

    @Test fun failedBootstrapKeepsOldCatalogAndCursorForRetry() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val session = DeviceSession("device-1", "1", "Test store", "synthetic-test-credential")
        try {
            seedCatalogBeforeReset(database)
            ServerSocket(0).use { server ->
                val requests = servePullResponses(server, listOf(
                    """{"changes":[{"cursor":"6","entityType":"catalog_bootstrap","entityId":"full_update","changeType":"UPSERT","payload":{}}],"nextCursor":"6","hasMore":false}""",
                    null
                ))
                try {
                    CatalogSyncRepository(database, PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/")).pull(session)
                    fail("Bootstrap failure must not acknowledge the marker")
                } catch (_: Exception) {
                    assertEquals(listOf("5", "0"), requests.get(10, TimeUnit.SECONDS))
                    assertEquals("5", database.catalogDao().getSyncState()?.cursor)
                    assertEquals(listOf("OLD01"), database.catalogDao().getAllProducts().first().map { it.code })
                }
            }
        } finally { database.close() }
    }

    @Test fun pendingOutboxBlocksCatalogResetWithoutChangingLocalData() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            seedCatalogBeforeReset(database)
            database.salesDao().insertOutbox(
                OutboxOperationEntity("op-pending", "CASH_SALE_COMPLETED", "{}", status = "PENDING")
            )
            try {
                CatalogSyncRepository(database, PosApiClient("http://127.0.0.1:1/api/v1/"))
                    .pull(DeviceSession("device-1", "1", "Test store", "synthetic-test-credential"))
                fail("Pending sale must block server stock from replacing local stock")
            } catch (error: IllegalStateException) {
                assertTrue(error.message.orEmpty().contains("Còn giao dịch chưa đồng bộ"))
            }
            assertEquals("5", database.catalogDao().getSyncState()?.cursor)
            assertEquals(listOf("OLD01"), database.catalogDao().getAllProducts().first().map { it.code })
            assertEquals(1, database.salesDao().countUnsyncedOperations())
        } finally { database.close() }
    }

    private suspend fun seedCatalogBeforeReset(database: AppDatabase) {
        database.catalogDao().insertCategories(listOf(ProductCategoryEntity("10", "Cà phê", 0, 1, true)))
        database.catalogDao().insertProducts(listOf(ProductEntity("20", "OLD01", "Món cũ", "10", 35000)))
        database.catalogDao().insertVariants(listOf(ProductVariantEntity("30", "20", "M", "M", 35000, true)))
        database.catalogDao().saveSyncState(SyncStateEntity(cursor = "5", hasBootstrap = true))
    }

    private fun servePullResponses(server: ServerSocket, responses: List<String?>): FutureTask<List<String>> {
        server.soTimeout = 10_000
        val capture = FutureTask {
            responses.map { body ->
                server.accept().use { socket ->
                    socket.soTimeout = 10_000
                    val reader = socket.getInputStream().bufferedReader()
                    val requestLine = reader.readLine()
                    while (reader.readLine()?.isNotEmpty() == true) Unit
                    val responseBody = (body ?: "{\"message\":\"bootstrap failed\"}").toByteArray()
                    val status = if (body == null) "500 Internal Server Error" else "200 OK"
                    socket.getOutputStream().write("HTTP/1.1 $status\r\nContent-Type: application/json\r\nContent-Length: ${responseBody.size}\r\nConnection: close\r\n\r\n".toByteArray())
                    socket.getOutputStream().write(responseBody)
                    requestLine.substringAfter("cursor=").substringBefore('&')
                }
            }
        }
        Thread(capture, "catalog-reset-test-server").start()
        return capture
    }

    @Test fun activeCartAndHeldDraftSwapIsAtomic() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            assertEquals(0, database.salesDao().countLocalOperationalRecords())
            val cart = ActiveCartEntity(storeId = "store-1", deviceId = "device-1",
                itemsJson = "[{\"lineId\":\"line-1\"}]", updatedAt = 1L)
            val draft = DraftOrderEntity(id = "draft-1", itemsJson = cart.itemsJson, totalAmount = 35_000)
            database.activeCartDao().save(cart)
            try {
                database.withTransaction {
                    database.draftOrderDao().insertDraftOrder(draft)
                    database.activeCartDao().clear()
                    error("simulate interrupted hold")
                }
                fail("Hold transaction should have rolled back")
            } catch (_: IllegalStateException) {
                assertNotNull(database.activeCartDao().get())
                assertNull(database.draftOrderDao().getDraftOrder(draft.id))
            }
            database.withTransaction {
                database.draftOrderDao().insertDraftOrder(draft)
                database.activeCartDao().clear()
            }
            assertNull(database.activeCartDao().get())
            assertNotNull(database.draftOrderDao().getDraftOrder(draft.id))
            assertEquals(1, database.salesDao().countLocalOperationalRecords())
            database.withTransaction {
                database.activeCartDao().save(cart)
                database.draftOrderDao().deleteDraftOrder(draft.id)
            }
            assertEquals(cart.itemsJson, database.activeCartDao().get()?.itemsJson)
            assertNull(database.draftOrderDao().getDraftOrder(draft.id))
            assertEquals(0, database.salesDao().countLocalOperationalRecords())
        } finally { database.close() }
    }

    @Test fun stockReadModelDistinguishesMissingBalanceFromZeroAndOutboxKeepsRejection() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try {
            database.inventoryDao().upsertIngredient(IngredientEntity("1", "CF", "Coffee", "g", true))
            database.inventoryDao().upsertIngredient(IngredientEntity("2", "MILK", "Milk", "ml", true))
            database.inventoryDao().upsertStockBalance(StockBalanceEntity("1", "1", "0", "2026-09-27T00:00:00Z"))
            val stocks = database.inventoryDao().observeStockBalances().first().associateBy { it.id }
            assertEquals("0", stocks.getValue("1").quantity)
            assertNull(stocks.getValue("2").quantity)
            database.salesDao().insertOutbox(OutboxOperationEntity("op", "CASH_SALE_COMPLETED", "{}", status = "REJECTED", lastError = "Stock conflict"))
            assertEquals(1, database.salesDao().countUnsyncedOperations())
            assertEquals("Stock conflict", database.salesDao().observeOutboxOperations().first().single().lastError)
            try {
                database.withTransaction {
                    database.inventoryDao().updateStockBalance("1", "1", "5")
                    database.salesDao().insertOutbox(OutboxOperationEntity("op", "CASH_SALE_COMPLETED", "{}"))
                }
                fail("Duplicate operation must abort the transaction")
            } catch (_: android.database.sqlite.SQLiteConstraintException) {
                assertEquals("0", database.inventoryDao().getStockBalance("1")!!.quantity)
            }
        } finally { database.close() }
    }

    @Test fun serializedSaleKeepsLinePricesTaxAndToppingSnapshot() {
        val product = CatalogProduct("1", "CF01", "Coffee", "1", "Coffee", 29000, 800, true, "", "[]")
        val variant = ProductVariantEntity("10", "1", "M", "M", 29000, true)
        val item = OrderLineItem("line", product, variant, listOf(SelectedTopping(ToppingEntity("2", "Topping", 5000), 2)), quantity = 3)
        val sale = SaleEntity("sale", "S-1", "1", "Store", "1000001", "Cashier", "register", "[]", 108333, 8667, 117000, "CASH", 120000, 3000)
        val plan = InventorySalePlan(mapOf("line" to ("7" to JSONArray())), emptyList(), emptyList(), emptyMap())
        val json = JSONObject(buildCashSaleOutboxPayload(sale, listOf(item), plan))
        val line = json.getJSONArray("items").getJSONObject(0)
        assertEquals("29000", line.getString("baseUnitPriceVnd"))
        assertEquals("39000", line.getString("unitPriceVnd"))
        assertEquals("117000", line.getString("lineTotalVnd"))
        assertEquals("108333", line.getString("subtotalVnd"))
        assertEquals("8667", line.getString("taxAmountVnd"))
        assertEquals(800, line.getInt("taxRateBps"))
        assertEquals("5000", line.getJSONArray("toppings").getJSONObject(0).getString("unitPriceVnd"))
        assertFalse(json.has("storeId"))
    }

    @Test fun heartbeatPostsPresenceAndPendingCountToDeviceRoute() = runBlocking {
        ServerSocket(0).use { server ->
            server.soTimeout = 10_000
            val capture = FutureTask<JSONObject> {
                server.accept().use { socket ->
                    socket.soTimeout = 10_000
                    val reader = socket.getInputStream().bufferedReader()
                    assertTrue(reader.readLine().startsWith("POST /api/v1/device/heartbeat "))
                    var length = 0
                    while (true) {
                        val header = reader.readLine()
                        if (header.isEmpty()) break
                        if (header.startsWith("Content-Length:", true)) length = header.substringAfter(':').trim().toInt()
                    }
                    val chars = CharArray(length)
                    var offset = 0
                    while (offset < length) offset += reader.read(chars, offset, length - offset)
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}".toByteArray())
                    JSONObject(String(chars))
                }
            }
            Thread(capture, "heartbeat-test-server").start()
            val result = PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/").heartbeat(DeviceSession("device", "1", "Test store", "synthetic-test-credential"), "1.0-test", true, 2)
            assertTrue(result)
            val body = capture.get(10, TimeUnit.SECONDS)
            assertTrue(body.getBoolean("hasPendingOutbox"))
            assertEquals(2, body.getInt("outboxPendingCount"))
            assertEquals("1.0-test", body.getString("appVersion"))
        }
    }
}
