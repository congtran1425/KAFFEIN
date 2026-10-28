package vn.id.congtc145.coffeepos.data.sync

import androidx.room.withTransaction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.withLock
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.SyncStateEntity
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState

enum class OutboxSyncResult { SUCCESS, RETRY, REJECTED, DEVICE_BLOCKED }

/** Shared by WorkManager and isolated integration tests; never deletes rejected evidence. */
class OutboxSyncRepository(private val database: AppDatabase, private val api: PosApiClient = PosApiClient()) {
    suspend fun sync(session: DeviceSession, appVersion: String, isStopped: () -> Boolean = { false }): OutboxSyncResult = PosSyncLocks.outbox.withLock {
        val dao = database.salesDao()
        if (DeviceAccessState.block.value != null) return@withLock OutboxSyncResult.DEVICE_BLOCKED
        try {
            val count = dao.countUnsyncedOperations()
            api.heartbeat(session, appVersion, count > 0, count)
            while (!isStopped()) {
                val operation = dao.getNextUnsyncedOperation() ?: break
                if (operation.status == "REJECTED") return@withLock OutboxSyncResult.REJECTED
                val response = try {
                    api.syncPush(session, operation)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    if (DeviceAccessState.block.value != null) return@withLock OutboxSyncResult.DEVICE_BLOCKED
                    dao.markFailed(operation.operationId, error.message.orEmpty().take(400))
                    return@withLock OutboxSyncResult.RETRY
                }
                when (response.status) {
                    "COMPLETED", "ALREADY_PROCESSED" -> PosSyncLocks.catalog.withLock {
                        database.withTransaction {
                            check(dao.markSynced(operation.operationId) == 1)
                            if (operation.operationType == "CASH_SALE_COMPLETED") {
                                database.catalogDao().saveSyncState(SyncStateEntity(cursor = "0", hasBootstrap = true))
                            }
                        }
                    }
                    "REJECTED" -> {
                        dao.markRejected(operation.operationId, response.error.orEmpty().take(400))
                        return@withLock OutboxSyncResult.REJECTED
                    }
                    else -> {
                        dao.markFailed(operation.operationId, "Trạng thái sync không hợp lệ.")
                        return@withLock OutboxSyncResult.RETRY
                    }
                }
            }
            if (isStopped()) return@withLock OutboxSyncResult.RETRY
            CatalogSyncRepository(database, api).pull(session)
            val remaining = dao.countUnsyncedOperations()
            api.heartbeat(session, appVersion, remaining > 0, remaining)
            OutboxSyncResult.SUCCESS
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            if (DeviceAccessState.block.value != null) OutboxSyncResult.DEVICE_BLOCKED else OutboxSyncResult.RETRY
        }
    }
}
