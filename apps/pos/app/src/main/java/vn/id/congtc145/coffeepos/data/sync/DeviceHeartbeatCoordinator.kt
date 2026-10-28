package vn.id.congtc145.coffeepos.data.sync

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.BuildConfig
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState

/** Only foreground POS reports presence; background WorkManager is not a 30-second timer. */
class DeviceHeartbeatCoordinator(context: Context) {
    private val database = AppDatabase.getDatabase(context)
    private val credentials = DeviceCredentialStore(context)
    private val api = PosApiClient()

    suspend fun runForeground() = coroutineScope {
        val signals = Channel<Unit>(Channel.CONFLATED)
        launch {
            while (isActive) {
                signals.trySend(Unit)
                delay(30_000)
            }
        }
        launch {
            database.salesDao().observePendingOutboxCount().collect { signals.trySend(Unit) }
        }
        try {
            for (signal in signals) {
                if (DeviceAccessState.block.value != null) {
                    _isOnline.value = false
                    continue
                }
                val session = credentials.load()
                if (session == null) {
                    _isOnline.value = null
                    continue
                }
                try {
                    val pending = database.salesDao().countUnsyncedOperations()
                    _isOnline.value = api.heartbeat(session, BuildConfig.VERSION_NAME, pending > 0, pending)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    _isOnline.value = false
                }
            }
        } finally {
            _isOnline.value = null
            signals.close()
        }
    }

    companion object {
        private val _isOnline = MutableStateFlow<Boolean?>(null)
        val isOnline = _isOnline.asStateFlow()
    }
}
