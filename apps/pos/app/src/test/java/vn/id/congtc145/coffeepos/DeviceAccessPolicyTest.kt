package vn.id.congtc145.coffeepos

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import vn.id.congtc145.coffeepos.domain.DeviceAccessBlock
import vn.id.congtc145.coffeepos.domain.deviceAccessBlockFor

class DeviceAccessPolicyTest {
    @Test fun confirmedRevocationBlocksDeviceAuthenticatedRequests() {
        assertEquals(DeviceAccessBlock.REVOKED, deviceAccessBlockFor(401, "DEVICE_REVOKED", "sync/push", true))
        assertEquals(DeviceAccessBlock.REVOKED, deviceAccessBlockFor(403, "DEVICE_REVOKED", "cashier/login", true))
    }
    @Test fun wrongPinNetworkAndServerErrorsAreNotRevocation() {
        assertNull(deviceAccessBlockFor(401, null, "cashier/login", true))
        assertNull(deviceAccessBlockFor(401, null, "attendance/check-in", true))
        assertNull(deviceAccessBlockFor(null, null, "device/heartbeat", true))
        assertNull(deviceAccessBlockFor(500, "DEVICE_REVOKED", "device/heartbeat", true))
        assertNull(deviceAccessBlockFor(401, "DEVICE_REVOKED", "devices/enroll", false))
    }
    @Test fun heartbeatUnauthorizedBlocksWithoutClaimingConfirmedRevocation() {
        assertEquals(DeviceAccessBlock.AUTHORIZATION_DENIED, deviceAccessBlockFor(401, "INTERNAL_SERVER_ERROR", "device/heartbeat", true))
        assertNull(deviceAccessBlockFor(403, null, "device/heartbeat", true))
    }
}
