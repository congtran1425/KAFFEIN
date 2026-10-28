package vn.id.congtc145.coffeepos

import android.content.Context
import android.content.ContextWrapper
import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.CashSaleRepository
import vn.id.congtc145.coffeepos.data.local.entity.ActiveCartEntity
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.local.entity.RegisterSessionEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.data.sync.OutboxSyncRepository
import vn.id.congtc145.coffeepos.data.sync.OutboxSyncResult
import vn.id.congtc145.coffeepos.domain.DeviceAccessBlock
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.network.PosApiException
import java.net.ServerSocket
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.UUID

class DeviceLifecycleContractTest {
    @Test fun blockedDevicePreservesOperationalDataAndCannotCompleteOrPush() = runBlocking {
        val original = InstrumentationRegistry.getInstrumentation().targetContext
        // Never change the real app's enrollment, access preferences or Room database.
        val prefix = "lifecycle-test-${UUID.randomUUID()}-"
        val isolated = object : ContextWrapper(original) {
            override fun getApplicationContext(): Context = this
            override fun getSharedPreferences(name: String, mode: Int) = super.getSharedPreferences(prefix + name, mode)
        }
        val enrollment = isolated.getSharedPreferences("device_enrollment", Context.MODE_PRIVATE)
        enrollment.edit().putString("device_id", "synthetic-device").commit()
        val database = Room.inMemoryDatabaseBuilder(isolated, AppDatabase::class.java).build()
        try {
            val cart = ActiveCartEntity(storeId = "1", deviceId = "synthetic-device", itemsJson = "[]", updatedAt = 1)
            val register = RegisterSessionEntity("register-test", "1", "synthetic-device", "1000001", "Test", 100_000, 1)
            val operation = OutboxOperationEntity("kept-operation", "REGISTER_SESSION_OPENED", "{}", 1)
            val sale = SaleEntity("kept-sale", "test-sale", "1", "Test", "1000001", "Test", register.id,
                "[]", 35_000, 0, 35_000, "CASH", 50_000, 15_000, completedAt = 1)
            database.activeCartDao().save(cart)
            database.registerSessionDao().insert(register)
            database.salesDao().insertSale(sale)
            database.salesDao().insertOutbox(operation)
            DeviceAccessState.initialize(isolated)
            ServerSocket(0).use { server ->
                server.soTimeout = 10_000
                val responseTask = FutureTask {
                    server.accept().use { socket ->
                        socket.soTimeout = 10_000
                        val reader = socket.getInputStream().bufferedReader()
                        var length = 0
                        assertTrue(reader.readLine().startsWith("POST /device/heartbeat"))
                        while (true) {
                            val header = reader.readLine()
                            if (header.isEmpty()) break
                            if (header.startsWith("Content-Length:", true)) length = header.substringAfter(':').trim().toInt()
                        }
                        repeat(length) { reader.read() }
                        val body = """{"code":"DEVICE_REVOKED","detail":"Synthetic device revoked"}""".toByteArray()
                        socket.getOutputStream().write("HTTP/1.1 401 Unauthorized\r\nContent-Type: application/problem+json\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                        socket.getOutputStream().write(body)
                    }
                }
                Thread(responseTask).apply { isDaemon = true; start() }
                val rejected = runCatching {
                    PosApiClient("http://127.0.0.1:${server.localPort}/").heartbeat(DeviceSession("synthetic-device", "1", "Test", "unused-test-credential"), "test", true, 1)
                }.exceptionOrNull()
                assertTrue(rejected is PosApiException)
                assertEquals("DEVICE_REVOKED", (rejected as PosApiException).errorCode)
                responseTask.get(10, TimeUnit.SECONDS)
            }
            assertEquals(DeviceAccessBlock.REVOKED, DeviceAccessState.block.value)
            DeviceAccessState.initialize(isolated)
            assertEquals(DeviceAccessBlock.REVOKED, DeviceAccessState.block.value)
            DeviceAccessState.deny(DeviceAccessBlock.AUTHORIZATION_DENIED)
            assertEquals(DeviceAccessBlock.REVOKED, DeviceAccessState.block.value)
            val failure = runCatching { CashSaleRepository(database).complete(sale.copy(id = "must-not-save"), emptyList(), "must-not-push") }.exceptionOrNull()
            assertTrue(failure is IllegalStateException)
            assertTrue(failure!!.message!!.contains("quyền bán hàng"))
            assertEquals(OutboxSyncResult.DEVICE_BLOCKED, OutboxSyncRepository(database).sync(DeviceSession("synthetic-device", "1", "Test", "unused-test-credential"), "test"))
            assertEquals(cart, database.activeCartDao().get())
            assertEquals(register, database.registerSessionDao().getOpenSession())
            assertEquals(sale, database.salesDao().getSale(sale.id))
            assertEquals(operation, database.salesDao().getNextUnsyncedOperation())
            assertNull(database.salesDao().getSale("must-not-save"))
        } finally {
            database.close()
            isolated.getSharedPreferences("device_enrollment", Context.MODE_PRIVATE).edit().clear().commit()
            isolated.getSharedPreferences("device_access", Context.MODE_PRIVATE).edit().clear().commit()
            DeviceAccessState.initialize(original)
        }
    }
}
