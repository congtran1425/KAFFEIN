package vn.id.congtc145.coffeepos

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.*
import vn.id.congtc145.coffeepos.data.local.entity.*
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.network.PosApiException
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.ui.order.*
import java.net.ServerSocket
import java.util.UUID
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

class OnlinePaymentContractTest {
    private data class Fixture(val db: AppDatabase, val session: DeviceSession,
        val line: OrderLineItem, val attempt: OnlinePaymentAttemptEntity) {
        fun state(status: String) = """{"id":"test-payment","saleId":"${attempt.saleId}","amountVnd":"35000","checkoutState":"$status","qrCode":"existing-qr","expiresAt":"2099-01-01T00:00:00Z"}"""
        fun receipt(productId: String = "20") = """{"id":"${attempt.saleId}","storeId":"1","deviceId":"${session.deviceId}","registerSessionId":"${attempt.registerSessionId}","status":"PAID","totalVnd":"35000","subtotalVnd":"35000","taxVnd":"0","saleNumber":"TEST","completedAt":"2026-10-10T00:00:00Z","items":[{"id":"server-reassigned-id","productId":"$productId","variantId":"30","productName":"Coffee","variantName":"M","baseUnitPriceVnd":"35000","taxRateBps":0,"quantity":1,"lineTotalVnd":"35000","subtotalVnd":"35000","taxAmountVnd":"0","toppings":[]}]}"""
            .let { JSONObject(it).put("payments", JSONArray("""[{"method":"ZALOPAY","provider":"ZALOPAY_SANDBOX","status":"PAID","amountVnd":"35000"}]""")).toString() }
        val stock = """{"changes":[{"cursor":"2","entityType":"stock_balances","entityId":"40","changeType":"UPSERT","payload":{"storeId":"1","ingredientId":"40","quantity":"80","updatedAt":"2026-10-10T00:00:00Z"}}],"nextCursor":"2","hasMore":false}"""
    }

    private data class Reply(val route: String, val status: Int = 200, val body: (Fixture) -> String)

    private fun withAttemptServer(replies: List<Reply>, test: suspend (Fixture, OnlinePaymentRepository) -> Unit) = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val session = DeviceSession(UUID.randomUUID().toString(), "1", "Test", "synthetic-only")
        val line = OrderLineItem(UUID.randomUUID().toString(), CatalogProduct("20", "CF", "Coffee", "10", "Coffee",
            35000, 0, true, "", "[]"), ProductVariantEntity("30", "20", "M", "M", 35000, true))
        val attempt = OnlinePaymentAttemptEntity(UUID.randomUUID().toString(), "1", session.deviceId,
            UUID.randomUUID().toString(), "1000001", "Test", OrderJsonSerializer.serializeOrderItems(listOf(line)),
            35000, System.currentTimeMillis(), "WAITING", "test-payment", "existing-qr", 4070908800000L)
        val f = Fixture(db, session, line, attempt)
        try {
            db.catalogDao().saveSyncState(SyncStateEntity(cursor = "1", hasBootstrap = true))
            db.onlinePaymentDao().insert(attempt)
            db.activeCartDao().save(ActiveCartEntity(storeId = "1", deviceId = session.deviceId,
                itemsJson = attempt.itemsJson, updatedAt = 1))
            db.inventoryDao().upsertStockBalance(StockBalanceEntity("40", "1", "100", "2026-10-10T00:00:00Z"))
            ServerSocket(0).use { server ->
                server.soTimeout = 15000
                val task = FutureTask {
                    replies.forEach { reply ->
                        server.accept().use { socket ->
                            socket.soTimeout = 15000
                            val reader = socket.getInputStream().bufferedReader()
                            val route = reader.readLine()
                            check(route.contains(reply.route)) { "Unexpected test route: $route" }
                            while (reader.readLine().isNotEmpty()) { /* no request body for these routes */ }
                            val body = reply.body(f).toByteArray(Charsets.UTF_8)
                            socket.getOutputStream().write("HTTP/1.1 ${reply.status} OK\r\nContent-Type: application/json\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                            socket.getOutputStream().write(body)
                        }
                    }
                    true
                }
                Thread(task, "payment-regression-server").start()
                test(f, OnlinePaymentRepository(db, PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/")))
                assertTrue(task.get(15, TimeUnit.SECONDS))
            }
        } finally { db.close() }
    }

    @Test fun paidCancelConflictReconcilesReceiptAndReleasesOnlyAfterStockSnapshot() = withAttemptServer(listOf(
        Reply("/cancel", 409) { """{"detail":"Already paid"}""" },
        Reply("/attempts/") { it.state("PAID") }, Reply("/sales/") { it.receipt() },
        Reply("sync/pull?cursor=0") { it.stock }
    )) { f, repo ->
        repo.cancel(f.session, f.attempt)
        assertEquals("PAID", f.db.onlinePaymentDao().get(f.attempt.saleId)?.status)
        assertNull(f.db.onlinePaymentDao().getUnresolved())
        assertNull(f.db.activeCartDao().get())
        assertEquals("80", f.db.inventoryDao().getStockBalance("40")?.quantity)
        assertEquals(0, f.db.salesDao().countUnsyncedOperations())
    }

    @Test fun manualCheckUsesFreshCheckApiAndImportsPaidReceipt() = withAttemptServer(listOf(
        Reply("/check") { it.state("PAID") }, Reply("/sales/") { it.receipt() },
        Reply("sync/pull?cursor=0") { it.stock }
    )) { f, repo ->
        repo.reconcile(f.session, f.attempt, refresh = true)
        assertEquals("PAID", f.db.onlinePaymentDao().get(f.attempt.saleId)?.status)
        assertNull(f.db.onlinePaymentDao().getUnresolved())
        assertNull(f.db.activeCartDao().get())
        assertEquals("80", f.db.inventoryDao().getStockBalance("40")?.quantity)
        assertEquals(0, f.db.salesDao().countUnsyncedOperations())
    }

    @Test fun failedManualCheckKeepsAttemptCartAndStock() = withAttemptServer(listOf(
        Reply("/check", 503) { """{"detail":"Chưa tra cứu được ZaloPay"}""" }
    )) { f, repo ->
        var failed = false
        try { repo.reconcile(f.session, f.attempt, refresh = true) }
        catch (error: PosApiException) { assertEquals(503, error.statusCode); failed = true }
        assertTrue(failed)
        assertEquals("WAITING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertEquals(f.attempt.itemsJson, f.db.activeCartDao().get()?.itemsJson)
        assertEquals("100", f.db.inventoryDao().getStockBalance("40")?.quantity)
    }

    @Test fun waitingCancelKeepsQrCartAndStock() = withAttemptServer(listOf(
        Reply("/cancel") { it.state("WAITING") }
    )) { f, repo ->
        repo.cancel(f.session, f.attempt)
        assertEquals("WAITING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertEquals("existing-qr", f.db.onlinePaymentDao().getUnresolved()?.qrCode)
        assertEquals(f.attempt.itemsJson, f.db.activeCartDao().get()?.itemsJson)
        assertEquals("100", f.db.inventoryDao().getStockBalance("40")?.quantity)
    }

    @Test fun finalUnpaidCancelUnlocksButPreservesCartForAnotherMethod() = withAttemptServer(listOf(
        Reply("/cancel") { it.state("FINAL_UNPAID") }
    )) { f, repo ->
        repo.cancel(f.session, f.attempt)
        assertNull(f.db.onlinePaymentDao().getUnresolved())
        assertEquals(f.attempt.itemsJson, f.db.activeCartDao().get()?.itemsJson)
        assertNull(f.db.salesDao().getSale(f.attempt.saleId))
    }

    @Test fun ambiguousCancelResponseDoesNotReleaseCart() = withAttemptServer(listOf(
        Reply("/cancel") { """{"message":"OK"}""" }
    )) { f, repo ->
        assertTrue(runCatching { repo.cancel(f.session, f.attempt) }.isFailure)
        assertEquals("WAITING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertNotNull(f.db.activeCartDao().get())
    }

    @Test fun localCancellationPreservesCartAndCannotBeResurrectedByLatePaid() = withAttemptServer(listOf(
        Reply("/cancel") { it.state("CANCELLED") },
        Reply("/attempts/") { it.state("PAID") }
    )) { f, repo ->
        repo.cancel(f.session, f.attempt)
        val cancelled = f.db.onlinePaymentDao().get(f.attempt.saleId)!!
        assertEquals("CANCELLED", cancelled.status)
        assertNull(f.db.onlinePaymentDao().getUnresolved())
        assertEquals(f.attempt.itemsJson, f.db.activeCartDao().get()?.itemsJson)
        assertTrue(runCatching { repo.reconcile(f.session, cancelled) }.isFailure)
        assertEquals("CANCELLED", f.db.onlinePaymentDao().get(f.attempt.saleId)?.status)
        assertNull(f.db.salesDao().getSale(f.attempt.saleId))
        assertEquals("100", f.db.inventoryDao().getStockBalance("40")?.quantity)
    }

    @Test fun paidStockPullFailureKeepsKnownPaidAndRetryFinishesWithoutDuplicateSale() = withAttemptServer(listOf(
        Reply("/attempts/") { it.state("PAID") }, Reply("/sales/") { it.receipt() },
        Reply("sync/pull?cursor=0", 503) { """{"detail":"temporary test outage"}""" },
        Reply("/attempts/") { it.state("PAID") }, Reply("/sales/") { it.receipt() },
        Reply("sync/pull?cursor=0") { it.stock }
    )) { f, repo ->
        assertTrue(runCatching { repo.reconcile(f.session, f.attempt) }.isFailure)
        assertEquals("PAID_RECONCILING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertNotNull(f.db.salesDao().getSale(f.attempt.saleId))
        assertNotNull(f.db.activeCartDao().get())
        assertEquals("100", f.db.inventoryDao().getStockBalance("40")?.quantity)
        repo.reconcile(f.session, f.db.onlinePaymentDao().getUnresolved()!!)
        assertNull(f.db.onlinePaymentDao().getUnresolved())
        assertNull(f.db.activeCartDao().get())
        assertEquals(0, f.db.salesDao().countUnsyncedOperations())
    }

    @Test fun mismatchedPaidReceiptCannotClearCart() = withAttemptServer(listOf(
        Reply("/attempts/") { it.state("PAID") }, Reply("/sales/") { it.receipt(productId = "999") }
    )) { f, repo ->
        assertTrue(runCatching { repo.reconcile(f.session, f.attempt) }.isFailure)
        assertEquals("PAID_RECONCILING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertNotNull(f.db.activeCartDao().get())
        assertNull(f.db.salesDao().getSale(f.attempt.saleId))
        assertEquals("100", f.db.inventoryDao().getStockBalance("40")?.quantity)
    }

    @Test fun knownPaidCannotRegressToFinalUnpaid() = withAttemptServer(listOf(
        Reply("/attempts/") { it.state("FINAL_UNPAID") }
    )) { f, repo ->
        f.db.onlinePaymentDao().update(f.attempt.saleId, "PAID_RECONCILING", "test-payment", null, f.attempt.expiresAt)
        val paid = f.db.onlinePaymentDao().getUnresolved()!!
        assertTrue(runCatching { repo.reconcile(f.session, paid) }.isFailure)
        assertEquals("PAID_RECONCILING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertNotNull(f.db.activeCartDao().get())
    }

    @Test fun knownPaidMissingOnServerDoesNotRecreateAnIntent() = withAttemptServer(listOf(
        Reply("/attempts/", 404) { """{"detail":"not found"}""" }
    )) { f, repo ->
        f.db.onlinePaymentDao().update(f.attempt.saleId, "PAID_RECONCILING", "test-payment", null, f.attempt.expiresAt)
        assertTrue(runCatching { repo.reconcile(f.session, f.db.onlinePaymentDao().getUnresolved()!!) }.isFailure)
        assertEquals("PAID_RECONCILING", f.db.onlinePaymentDao().getUnresolved()?.status)
        assertNotNull(f.db.activeCartDao().get())
    }

    @Test fun pendingSurvivesRepositoryRestartAndPaidImportNeverAddsOutboxOrDeductsTwice() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        val session = DeviceSession(UUID.randomUUID().toString(), "1", "Test", "synthetic-only")
        val line = OrderLineItem(UUID.randomUUID().toString(), CatalogProduct("20", "CF", "Coffee", "10", "Coffee", 35000,
            0, true, "", "[]"), ProductVariantEntity("30", "20", "M", "M", 35000, true))
        val registerId = UUID.randomUUID().toString()
        val paymentId = UUID.randomUUID().toString()
        val remoteLineId = UUID.randomUUID().toString()
        var saleId = ""
        try {
            db.catalogDao().saveSyncState(SyncStateEntity(cursor = "1", hasBootstrap = true))
            db.registerSessionDao().insert(RegisterSessionEntity(registerId, "1", session.deviceId, "1000001", "Test", 100000))
            db.activeCartDao().save(ActiveCartEntity(storeId = "1", deviceId = session.deviceId,
                itemsJson = OrderJsonSerializer.serializeOrderItems(listOf(line)), updatedAt = 1))
            db.inventoryDao().upsertStockBalance(StockBalanceEntity("40", "1", "100", "2026-10-10T00:00:00Z"))
            ServerSocket(0).use { server ->
                server.soTimeout = 15000
                val task = FutureTask {
                    repeat(10) { index ->
                        server.accept().use { socket ->
                            socket.soTimeout = 15000
                            val reader = socket.getInputStream().bufferedReader()
                            val route = reader.readLine()
                            var length = 0
                            var auth = false
                            while (true) {
                                val header = reader.readLine()
                                if (header.isEmpty()) break
                                if (header.startsWith("Content-Length:", true)) length = header.substringAfter(':').trim().toInt()
                                if (header == "Authorization: Device synthetic-only") auth = true
                            }
                            check(auth)
                            val chars = CharArray(length)
                            var offset = 0
                            while (offset < length) offset += reader.read(chars, offset, length - offset)
                            var status = 200
                            val body = when (index) {
                                0 -> { check(route.contains("/payments/online/capabilities")); """{"providers":{"ZALOPAY":{"available":true},"MOMO":{"available":false}}}""" }
                                1 -> { check(route.contains("/attempts/")); status = 404; """{"message":"not found"}""" }
                                2 -> { check(route.contains("/device/heartbeat")); """{"ok":true}""" }
                                3 -> {
                                    check(route.contains("/initiate"))
                                    val sent = JSONObject(String(chars)); saleId = sent.getString("saleId")
                                    check(sent.getJSONArray("items").getJSONObject(0).getString("id") == line.lineId)
                                    """{"paymentId":"$paymentId","saleId":"$saleId","amountVnd":"35000","qrCode":"provider-payload","expiresAt":"2099-01-01T00:00:00Z"}"""
                                }
                                4, 7 -> """{"id":"$paymentId","saleId":"$saleId","amountVnd":"35000","checkoutState":"PAID"}"""
                                5, 8 -> """{"id":"$saleId","deviceId":"${session.deviceId}","storeId":"1","registerSessionId":"$registerId","status":"PAID","totalVnd":"35000","subtotalVnd":"35000","taxVnd":"0","saleNumber":"TEST","completedAt":"2026-10-10T00:00:00Z","items":[{"id":"$remoteLineId","productId":"20","variantId":"30","productName":"Coffee","variantName":"M","baseUnitPriceVnd":"35000","taxRateBps":0,"quantity":1,"lineTotalVnd":"35000","subtotalVnd":"35000","taxAmountVnd":"0","toppings":[]}]}"""
                                    .let { JSONObject(it).put("payments", JSONArray("""[{"method":"ZALOPAY","provider":"ZALOPAY_SANDBOX","status":"PAID","amountVnd":"35000"}]""")).toString() }
                                else -> {
                                    check(route.contains("sync/pull?cursor=0"))
                                    """{"changes":[{"cursor":"2","entityType":"stock_balances","entityId":"40","changeType":"UPSERT","payload":{"storeId":"1","ingredientId":"40","quantity":"80","updatedAt":"2026-10-10T00:00:00Z"}}],"nextCursor":"2","hasMore":false}"""
                                }
                            }.toByteArray()
                            socket.getOutputStream().write("HTTP/1.1 $status OK\r\nContent-Type: application/json\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                            socket.getOutputStream().write(body)
                        }
                    }
                    true
                }
                Thread(task, "payment-test-server").start()
                val api = PosApiClient("http://127.0.0.1:${server.localPort}/api/v1/")
                val repo = OnlinePaymentRepository(db, api)
                val attempt = repo.prepare(session, listOf(line), 35000, "1000001", "Test", "ZALOPAY")
                assertNotNull(db.onlinePaymentDao().getUnresolved())
                repo.reconcile(session, attempt)
                assertEquals("WAITING", db.onlinePaymentDao().getUnresolved()?.status)
                assertEquals("100", db.inventoryDao().getStockBalance("40")?.quantity)
                val cash = SaleEntity(UUID.randomUUID().toString(), "CASH", "1", "Test", "1000001", "Test", registerId,
                    attempt.itemsJson, 35000, 0, 35000, "CASH", 35000, 0)
                assertTrue(runCatching { CashSaleRepository(db).complete(cash, listOf(line), UUID.randomUUID().toString()) }.isFailure)
                // New repository represents restart/logout recovery from Room, not UI memory.
                val restored = db.onlinePaymentDao().getUnresolved()!!
                OnlinePaymentRepository(db, api).reconcile(session, restored)
                assertNull(db.onlinePaymentDao().getUnresolved())
                assertEquals("ZALOPAY", db.salesDao().getSale(attempt.saleId)?.paymentMethod)
                assertEquals(line.lineId, OrderJsonSerializer.deserializeOrderItemsStrict(db.salesDao().getSale(attempt.saleId)!!.itemsJson).single().lineId)
                assertEquals(0, db.salesDao().countUnsyncedOperations())
                assertEquals("80", db.inventoryDao().getStockBalance("40")?.quantity)
                assertNull(db.activeCartDao().get())
                val newerLine = line.copy(lineId = UUID.randomUUID().toString())
                db.activeCartDao().save(ActiveCartEntity(storeId = "1", deviceId = session.deviceId,
                    itemsJson = OrderJsonSerializer.serializeOrderItems(listOf(newerLine)), updatedAt = 2))
                repo.reconcile(session, restored)
                assertEquals("80", db.inventoryDao().getStockBalance("40")?.quantity)
                assertEquals(newerLine.lineId, OrderJsonSerializer.deserializeOrderItemsStrict(db.activeCartDao().get()!!.itemsJson).single().lineId)
                assertTrue(task.get(15, TimeUnit.SECONDS))
            }
        } finally { db.close() }
    }

    @Test fun migrationKeepsExistingReceiptAndCart() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val name = "payment-migration-test-${UUID.randomUUID()}.db"
        val db = Room.databaseBuilder(context, AppDatabase::class.java, name).build()
        val receipt = SaleEntity(UUID.randomUUID().toString(), "MIGRATION", "1", "Test", "1000001", "Cashier",
            UUID.randomUUID().toString(), "[]", 35000, 0, 35000, "CASH", 35000, 0)
        try {
            db.activeCartDao().save(ActiveCartEntity(storeId = "1", deviceId = "test", itemsJson = "[]", updatedAt = 1))
            db.salesDao().insertSale(receipt)
            db.openHelper.writableDatabase.execSQL("DROP TABLE online_payment_attempts")
            db.openHelper.writableDatabase.execSQL("ALTER TABLE register_sessions DROP COLUMN openingDenominationsJson")
            db.openHelper.writableDatabase.execSQL("ALTER TABLE register_sessions DROP COLUMN closingDenominationsJson")
            db.openHelper.writableDatabase.execSQL("DROP INDEX index_register_sessions_handoverFromSessionId")
            listOf("compensationCashVnd", "compensationDenominationsJson", "compensationNote", "closingMode", "handoverFromSessionId").forEach {
                db.openHelper.writableDatabase.execSQL("ALTER TABLE register_sessions DROP COLUMN $it")
            }
            db.openHelper.writableDatabase.execSQL("PRAGMA user_version = 9")
        } finally { db.close() }
        val migrated = Room.databaseBuilder(context, AppDatabase::class.java, name)
            .addMigrations(AppDatabase.MIGRATION_9_10, AppDatabase.MIGRATION_10_11, AppDatabase.MIGRATION_11_12, AppDatabase.MIGRATION_12_13).build()
        try {
            assertNotNull(migrated.activeCartDao().get())
            assertEquals(receipt.id, migrated.salesDao().getSale(receipt.id)?.id)
            assertNull(migrated.onlinePaymentDao().getUnresolved())
        } finally { migrated.close(); context.deleteDatabase(name) }
    }
}
