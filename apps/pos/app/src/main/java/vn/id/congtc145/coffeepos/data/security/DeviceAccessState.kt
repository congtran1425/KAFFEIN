package vn.id.congtc145.coffeepos.data.security

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import vn.id.congtc145.coffeepos.domain.DeviceAccessBlock

/** Sticky local safety gate. Never deletes enrollment, Room, receipts or the outbox.
 * Enrollment cannot be replaced in-place on a device containing operational data.
 * Initialized when DeviceCredentialStore is created, including in WorkManager.
 */
object DeviceAccessState {
    private var preferences: SharedPreferences? = null
    private var deviceId: String? = null
    private val mutableBlock = MutableStateFlow<DeviceAccessBlock?>(null)
    val block = mutableBlock.asStateFlow()

    @Synchronized
    fun initialize(context: Context) {
        val enrollment = context.applicationContext.getSharedPreferences("device_enrollment", Context.MODE_PRIVATE)
        val previousDeviceId = deviceId
        deviceId = enrollment.getString("device_id", null)
        preferences = context.applicationContext.getSharedPreferences("device_access", Context.MODE_PRIVATE)
        mutableBlock.value = if (deviceId != null && preferences!!.getString("blocked_device_id", null) == deviceId) {
            preferences!!.getString("block", null)?.let { runCatching { DeviceAccessBlock.valueOf(it) }.getOrNull() }
        } else if (previousDeviceId == deviceId) mutableBlock.value else null
    }

    @Synchronized
    fun deny(reason: DeviceAccessBlock) {
        val id = deviceId ?: return
        // A later generic unauthorized response must never downgrade confirmed revocation.
        val next = if (mutableBlock.value == DeviceAccessBlock.REVOKED) DeviceAccessBlock.REVOKED else reason
        mutableBlock.value = next
        check(preferences!!.edit().putString("blocked_device_id", id).putString("block", next.name).commit()) {
            "Không thể lưu trạng thái quyền truy cập thiết bị."
        }
    }

    fun assertAllowed() {
        check(mutableBlock.value == null) { "Thiết bị không còn quyền bán hàng. Dữ liệu được giữ để đối soát với Owner." }
    }
}
