package vn.id.congtc145.coffeepos.domain

enum class DeviceAccessBlock { REVOKED, AUTHORIZATION_DENIED }

/** Wrong cashier PIN, network failure and 5xx are not evidence of device revocation. */
fun deviceAccessBlockFor(status: Int?, code: String?, path: String, deviceAuthenticated: Boolean): DeviceAccessBlock? {
    if (!deviceAuthenticated || status !in setOf(401, 403)) return null
    return when (code) {
        "DEVICE_REVOKED" -> DeviceAccessBlock.REVOKED
        "DEVICE_UNAUTHORIZED", "DEVICE_INACTIVE", "DEVICE_CREDENTIAL_INVALID" -> DeviceAccessBlock.AUTHORIZATION_DENIED
        // Compatibility with the existing API: heartbeat has no cashier/PIN authentication.
        else -> if (status == 401 && path == "device/heartbeat") DeviceAccessBlock.AUTHORIZATION_DENIED else null
    }
}
