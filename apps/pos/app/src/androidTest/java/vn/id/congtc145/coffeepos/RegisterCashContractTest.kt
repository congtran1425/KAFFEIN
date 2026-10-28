package vn.id.congtc145.coffeepos

import androidx.room.Room
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.RegisterCashRepository
import vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import java.util.UUID

/** In-memory Room only; never writes the enrolled POS database. */
class RegisterCashContractTest {
    @Test fun outboxPreservesHandoverDependencyOrderEvenWhenTheClockMovesBackwards() = fixture { db, _, _ ->
        db.salesDao().insertOutbox(OutboxOperationEntity("close-first", "REGISTER_SESSION_CLOSED", "{}", createdAt = 2000))
        db.salesDao().insertOutbox(OutboxOperationEntity("open-next", "REGISTER_SESSION_OPENED", "{}", createdAt = 1000))
        assertEquals("close-first", db.salesDao().getNextUnsyncedOperation()!!.operationId)
        db.salesDao().markSynced("close-first")
        assertEquals("open-next", db.salesDao().getNextUnsyncedOperation()!!.operationId)
    }
    private fun fixture(test: suspend (AppDatabase, RegisterCashRepository, DeviceSession) -> Unit) = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java).build()
        try { test(db, RegisterCashRepository(db), DeviceSession(UUID.randomUUID().toString(), "1", "Test", "synthetic-only")) }
        finally { db.close() }
    }

    @Test fun frozenCountSurvivesReloadAndOverpaidCompensationIsCarriedOnceToNextCashier() = fixture { db, repo, device ->
        val session = repo.open(device, "1000001", "One", 60000, mapOf(50000L to 1, 10000L to 1))
        val openedOperation = db.salesDao().getNextUnsyncedOperation()!!
        db.salesDao().markSynced(openedOperation.operationId)
        repo.freeze(device, session.id, mapOf(20000L to 1, 5000L to 1), "HANDOVER")
        val restarted = RegisterCashRepository(db)
        val retry = restarted.freeze(device, session.id, mapOf(50000L to 2), "HANDOVER")
        assertEquals(25000L, retry.actualCashVnd)
        assertNull(db.salesDao().getNextUnsyncedOperation())
        var refused = false
        try { restarted.close(device, "1000001", mapOf(10000L to 3)) } catch (_: IllegalArgumentException) { refused = true }
        assertTrue(refused)
        assertEquals("OPEN", db.registerSessionDao().get(session.id)!!.status)
        assertNull(db.salesDao().getNextUnsyncedOperation())
        val closed = restarted.close(device, "1000001", mapOf(50000L to 1))
        assertEquals(-35000L, closed.varianceVnd)
        assertEquals(50000L, closed.compensationCashVnd)
        val closeOperation = db.salesDao().getNextUnsyncedOperation()!!
        val payload = JSONObject(closeOperation.payloadJson)
        assertEquals(25000L, payload.getLong("actualCashVnd"))
        assertEquals(50000L, payload.getLong("compensationCashVnd"))
        assertEquals("HANDOVER", payload.getString("closingMode"))
        assertTrue(restarted.receiveHandover(device, "1000002", "Two"))
        assertFalse(restarted.receiveHandover(device, "1000002", "Two"))
        val next = db.registerSessionDao().getOpenSession()!!
        assertEquals(75000L, next.openingCashVnd)
        assertEquals(session.id, next.handoverFromSessionId)
        assertEquals("1000002", next.openedByCode)
        assertEquals(mapOf(50000L to 1, 20000L to 1, 5000L to 1), restarted.counts(next.openingDenominationsJson))
        assertEquals(closeOperation.operationId, db.salesDao().getNextUnsyncedOperation()!!.operationId)
        db.salesDao().markSynced(closeOperation.operationId)
        assertEquals("REGISTER_SESSION_OPENED", db.salesDao().getNextUnsyncedOperation()!!.operationType)
    }

    @Test fun surplusRemainsSeparateAndEndOfDayDoesNotCreateCarry() = fixture { db, repo, device ->
        val session = repo.open(device, "1000001", "One", 60000, mapOf(50000L to 1, 10000L to 1))
        repo.freeze(device, session.id, mapOf(50000L to 1, 20000L to 1), "END_OF_DAY")
        val closed = repo.close(device, "1000001", emptyMap())
        assertEquals(10000L, closed.varianceVnd)
        assertNull(closed.compensationCashVnd)
        assertFalse(repo.receiveHandover(device, "1000002", "Two"))
        assertNull(db.registerSessionDao().getOpenSession())
        val next = repo.open(device, "1000002", "Two", 10000, mapOf(10000L to 1))
        assertEquals(10000L, next.openingCashVnd)
        assertNull(next.handoverFromSessionId)
    }

    @Test fun zeroBalancedDrawerRetainsZeroAndNoCompensation() = fixture { _, repo, device ->
        val session = repo.open(device, "1000001", "One", 0, emptyMap())
        repo.freeze(device, session.id, emptyMap(), "END_OF_DAY")
        val closed = repo.close(device, "1000001", emptyMap())
        assertEquals(0L, closed.actualCashVnd)
        assertEquals(0L, closed.varianceVnd)
        assertNull(closed.compensationCashVnd)
    }

    @Test fun unresolvedQrBlocksCountingBeforeAnythingIsFrozen() = fixture { db, repo, device ->
        val session = repo.open(device, "1000001", "One", 0, emptyMap())
        db.onlinePaymentDao().insert(OnlinePaymentAttemptEntity(UUID.randomUUID().toString(), device.storeId, device.deviceId,
            session.id, "1000001", "One", "[]", 45000, 1, "WAITING"))
        var refused = false
        try { repo.freeze(device, session.id, emptyMap(), "END_OF_DAY") } catch (_: IllegalStateException) { refused = true }
        assertTrue(refused)
        assertNull(db.registerSessionDao().getOpenSession()!!.actualCashVnd)
    }
}
