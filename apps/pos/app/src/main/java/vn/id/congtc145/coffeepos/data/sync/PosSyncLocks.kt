package vn.id.congtc145.coffeepos.data.sync

import kotlinx.coroutines.sync.Mutex

/** ACK and pull share a lock so an in-flight pre-sale snapshot cannot overwrite post-ACK stock. */
internal object PosSyncLocks {
    val catalog = Mutex()
    val outbox = Mutex()
}
