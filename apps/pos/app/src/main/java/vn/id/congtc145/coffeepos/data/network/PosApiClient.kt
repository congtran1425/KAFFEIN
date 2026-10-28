package vn.id.congtc145.coffeepos.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import vn.id.congtc145.coffeepos.BuildConfig
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.domain.deviceAccessBlockFor

class PosApiException(message: String, val statusCode: Int? = null, val errorCode: String? = null) : IOException(message)

data class SyncChange(
    val cursor: String,
    val entityType: String,
    val entityId: String,
    val changeType: String,
    val payload: JSONObject
)

data class SyncPullPage(
    val changes: List<SyncChange>,
    val nextCursor: String,
    val hasMore: Boolean
)

data class SyncPushOutcome(val status: String, val error: String? = null)

data class AttendanceResult(
    val employeeName: String,
    val action: String,
    val storeName: String,
    val timestamp: String,
    val isSupport: Boolean
)

data class CashierLoginResult(
    val employeeCode: String,
    val employeeName: String,
    val storeId: String,
    val storeName: String
)

class PosApiClient(
    private val baseUrl: String = BuildConfig.API_BASE_URL
) {
    suspend fun onlinePaymentAvailable(session: DeviceSession, provider: String): Boolean = withContext(Dispatchers.IO) {
        require(provider == "ZALOPAY" || provider == "MOMO")
        request("GET", "payments/online/capabilities", authorization = "Device ${session.credential}")
            .getJSONObject("providers").getJSONObject(provider).getBoolean("available")
    }

    suspend fun initiateOnlinePayment(session: DeviceSession, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        post("payments/online/initiate", body, "Device ${session.credential}")
    }

    suspend fun paymentAttempt(session: DeviceSession, saleId: String): JSONObject = withContext(Dispatchers.IO) {
        require(runCatching { java.util.UUID.fromString(saleId) }.isSuccess)
        request("GET", "payments/online/attempts/$saleId", authorization = "Device ${session.credential}")
    }

    suspend fun checkPaymentAttempt(session: DeviceSession, saleId: String): JSONObject = withContext(Dispatchers.IO) {
        require(runCatching { java.util.UUID.fromString(saleId) }.isSuccess)
        post("payments/online/attempts/$saleId/check", JSONObject(), "Device ${session.credential}")
    }

    suspend fun cancelZaloPay(session: DeviceSession, saleId: String): JSONObject = withContext(Dispatchers.IO) {
        require(runCatching { java.util.UUID.fromString(saleId) }.isSuccess)
        post("payments/online/attempts/$saleId/cancel", JSONObject(), "Device ${session.credential}")
    }

    suspend fun paidSale(session: DeviceSession, saleId: String): JSONObject = withContext(Dispatchers.IO) {
        require(runCatching { java.util.UUID.fromString(saleId) }.isSuccess)
        request("GET", "sales/$saleId", authorization = "Device ${session.credential}")
    }
    suspend fun heartbeat(
        session: DeviceSession,
        appVersion: String,
        hasPendingOutbox: Boolean,
        outboxPendingCount: Int
    ): Boolean = withContext(Dispatchers.IO) {
        require(outboxPendingCount >= 0)
        post(
            path = "device/heartbeat",
            authorization = "Device ${session.credential}",
            body = JSONObject()
                .put("appVersion", appVersion)
                .put("hasPendingOutbox", hasPendingOutbox)
                .put("outboxPendingCount", outboxPendingCount)
        ).getBoolean("ok")
    }

    suspend fun syncPush(
        session: DeviceSession,
        operation: OutboxOperationEntity
    ): SyncPushOutcome = withContext(Dispatchers.IO) {
        val response = post(
            path = "sync/push",
            authorization = "Device ${session.credential}",
            body = JSONObject().put("operations", org.json.JSONArray().put(
                JSONObject()
                    .put("operationId", operation.operationId)
                    .put("type", operation.operationType)
                    .put("createdAt", operation.createdAt)
                    .put("payload", JSONObject(operation.payloadJson))
            ))
        )
        val processed = response.getJSONArray("processed")
        val errors = response.getJSONArray("errors")
        val matches = (0 until processed.length()).map { processed.getJSONObject(it) } +
            (0 until errors.length()).map { errors.getJSONObject(it) }
        check(matches.size == 1 && matches[0].getString("operationId") == operation.operationId) {
            "Máy chủ trả kết quả sync không khớp operationId."
        }
        val result = matches.single()
        SyncPushOutcome(
            status = result.getString("status"),
            error = result.optString("error").takeIf(String::isNotBlank)
        )
    }

    suspend fun syncPull(
        session: DeviceSession,
        cursor: String,
        limit: Int = 100
    ): SyncPullPage = withContext(Dispatchers.IO) {
        require(cursor.isNotEmpty() && cursor.all(Char::isDigit)) { "Sync cursor không hợp lệ." }
        val response = request(
            method = "GET",
            path = "sync/pull?cursor=$cursor&limit=$limit",
            authorization = "Device ${session.credential}"
        )
        val items = response.getJSONArray("changes")
        SyncPullPage(
            changes = (0 until items.length()).map { index ->
                val item = items.getJSONObject(index)
                SyncChange(
                    cursor = item.getString("cursor"),
                    entityType = item.getString("entityType"),
                    entityId = item.getString("entityId"),
                    changeType = item.getString("changeType"),
                    payload = item.optJSONObject("payload") ?: JSONObject()
                )
            },
            nextCursor = response.getString("nextCursor"),
            hasMore = response.getBoolean("hasMore")
        )
    }

    suspend fun enroll(
        activationCode: String,
        displayName: String
    ): DeviceSession = withContext(Dispatchers.IO) {
        val response = post(
            path = "device/enroll",
            body = JSONObject()
                .put("activationCode", activationCode)
                .put("displayName", displayName)
                .put("appVersion", BuildConfig.VERSION_NAME)
        )
        DeviceSession(
            deviceId = response.getString("deviceId"),
            storeId = response.getString("storeId"),
            storeName = response.getString("storeName"),
            credential = response.getString("deviceCredential")
        )
    }

    suspend fun attendance(
        session: DeviceSession,
        action: String,
        employeeCode: String,
        pin: String
    ): AttendanceResult = withContext(Dispatchers.IO) {
        val response = post(
            path = "attendance:$action",
            body = JSONObject()
                .put("employeeCode", employeeCode)
                .put("pin", pin),
            authorization = "Device ${session.credential}"
        )
        AttendanceResult(
            employeeName = response.getString("employeeName"),
            action = response.getString("action"),
            storeName = response.getString("storeName"),
            timestamp = response.getString("timestamp"),
            isSupport = response.optBoolean("isSupport", false)
        )
    }

    suspend fun cashierLogin(
        session: DeviceSession,
        employeeCode: String,
        pin: String
    ): CashierLoginResult = withContext(Dispatchers.IO) {
        val response = post(
            path = "cashier-sessions:login",
            body = JSONObject()
                .put("employeeCode", employeeCode)
                .put("pin", pin),
            authorization = "Device ${session.credential}"
        )
        CashierLoginResult(
            employeeCode = response.getString("employeeCode"),
            employeeName = response.getString("employeeName"),
            storeId = response.getString("storeId"),
            storeName = response.getString("storeName")
        )
    }

    private fun post(
        path: String,
        body: JSONObject,
        authorization: String? = null
    ): JSONObject = request("POST", path, body, authorization)

    private fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        authorization: String? = null
    ): JSONObject {
        val deviceAuthenticated = authorization?.startsWith("Device ") == true
        if (deviceAuthenticated) DeviceAccessState.assertAllowed()
        val onlinePaymentRequest = path.startsWith("payments/online/") ||
            path.startsWith("payments/zalopay/")
        val connection = (URL(baseUrl.trimEnd('/') + "/" + path).openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = method
            connection.connectTimeout = 8_000
            // MoMo requires at least 30s for create/query. Keep the attempt UUID after response
            // loss; an HTTP timeout is not proof that no QR/payment was created.
            connection.readTimeout = if (onlinePaymentRequest) 45_000 else 8_000
            connection.doOutput = body != null
            if (body != null) connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            authorization?.let { connection.setRequestProperty("Authorization", it) }
            body?.let { payload ->
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val payload = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = if (payload.isBlank()) JSONObject() else if (status in 200..299) JSONObject(payload)
                else runCatching { JSONObject(payload) }.getOrDefault(JSONObject())
            if (status !in 200..299) {
                val errorCode = json.optString("code").takeIf { it.isNotBlank() }
                deviceAccessBlockFor(status, errorCode, path, deviceAuthenticated)?.let(DeviceAccessState::deny)
                throw PosApiException(
                    json.optString("detail", json.optString("message", "Máy chủ trả lỗi HTTP $status")),
                    status,
                    errorCode
                )
            }
            return json
        } catch (error: PosApiException) {
            throw error
        } catch (error: java.net.SocketTimeoutException) {
            throw PosApiException(if (onlinePaymentRequest)
                "Máy chủ chưa phản hồi kịp. Đang đối soát cùng giao dịch; không thu thêm tiền."
                else "Máy chủ phản hồi chậm. Hãy thử lại.")
        } catch (error: org.json.JSONException) {
            throw PosApiException("Phản hồi máy chủ không đúng định dạng. Hãy kiểm tra lại trạng thái.")
        } catch (error: Exception) {
            throw PosApiException("Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.")
        } finally {
            connection.disconnect()
        }
    }
}
