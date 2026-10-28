package vn.id.congtc145.coffeepos.data.local

import androidx.room.withTransaction
import org.json.JSONObject
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.local.entity.RegisterSessionEntity
import vn.id.congtc145.coffeepos.data.security.DeviceAccessState
import vn.id.congtc145.coffeepos.data.security.DeviceSession
import vn.id.congtc145.coffeepos.domain.*
import java.time.Instant
import java.util.UUID

/** Cash-count state and its sync operation commit in the same Room transaction. */
class RegisterCashRepository(private val db: AppDatabase) {
    private val dao = db.registerSessionDao()
    private fun json(counts: Map<Long, Int>): String = JSONObject().apply {
        counts.forEach { (d, n) -> if (n > 0) put(d.toString(), n) }
    }.toString()
    fun counts(value: String?): Map<Long, Int> {
        if (value == null) return emptyMap()
        val obj = JSONObject(value)
        return obj.keys().asSequence().associate { it.toLong() to obj.getInt(it) }
    }

    private suspend fun openInside(device: DeviceSession, code: String, name: String,
        amount: Long, denominations: Map<Long, Int>, from: RegisterSessionEntity?): RegisterSessionEntity {
        DeviceAccessState.assertAllowed()
        check(code.isNotBlank()) { "Cần đăng nhập thu ngân." }
        check(dao.getOpenSession() == null) { "Đã có phiên quỹ đang mở." }
        require(validCashCountSnapshot(amount, denominations)) { "Bảng kê tiền không khớp tổng tiền." }
        val now = System.currentTimeMillis()
        val session = RegisterSessionEntity(UUID.randomUUID().toString(), device.storeId, device.deviceId,
            code, name, amount, openedAt = now, openingDenominationsJson = json(denominations), handoverFromSessionId = from?.id)
        dao.insert(session)
        val payload = JSONObject().put("id", session.id).put("openingCashVnd", amount).put("openedByCode", code)
            .put("openedAt", Instant.ofEpochMilli(now).toString()).put("openingDenominations", JSONObject(json(denominations)))
        from?.let { payload.put("handoverFromSessionId", it.id) }
        db.salesDao().insertOutbox(OutboxOperationEntity(UUID.randomUUID().toString(), "REGISTER_SESSION_OPENED", payload.toString(), createdAt = now))
        return session
    }

    suspend fun open(device: DeviceSession, code: String, name: String, amount: Long, denominations: Map<Long, Int>): RegisterSessionEntity = db.withTransaction {
        check(dao.pendingHandover(device.deviceId, device.storeId) == null) { "Cần nhận quỹ bàn giao từ ca trước." }
        openInside(device, code, name, amount, denominations, null)
    }

    suspend fun receiveHandover(device: DeviceSession, code: String, name: String): Boolean = db.withTransaction {
        if (dao.getOpenSession() != null) return@withTransaction false
        val previous = dao.pendingHandover(device.deviceId, device.storeId) ?: return@withTransaction false
        val amount = Math.addExact(previous.actualCashVnd!!, previous.compensationCashVnd ?: 0)
        val denominations = mergeCashCounts(counts(previous.closingDenominationsJson), counts(previous.compensationDenominationsJson))
        openInside(device, code, name, amount, denominations, previous)
        true
    }

    suspend fun freeze(device: DeviceSession, sessionId: String, denominations: Map<Long, Int>, mode: String): RegisterSessionEntity = db.withTransaction {
        DeviceAccessState.assertAllowed()
        check(mode in setOf("HANDOVER", "END_OF_DAY"))
        val session = dao.getOpenSession() ?: error("Chưa có phiên quỹ mở.")
        check(session.id == sessionId && session.storeId == device.storeId && session.deviceId == device.deviceId) { "Phiên quỹ đã thay đổi." }
        if (session.actualCashVnd != null) return@withTransaction session
        check(db.onlinePaymentDao().getUnresolved() == null) { "Phải đối soát QR trước khi chốt quỹ." }
        val actual = CashCountInput(counts = denominations).total
        require(validCashCountSnapshot(actual, denominations)) { "Bảng kê không hợp lệ." }
        val expected = Math.addExact(session.openingCashVnd, db.salesDao().cashSalesForRegister(session.id))
        check(dao.freezeCount(session.id, expected, actual, Math.subtractExact(actual, expected), json(denominations), mode) == 1)
        dao.get(session.id)!!
    }

    suspend fun close(device: DeviceSession, code: String, compensation: Map<Long, Int>): RegisterSessionEntity = db.withTransaction {
        DeviceAccessState.assertAllowed()
        val session = dao.getOpenSession() ?: error("Chưa có phiên quỹ mở.")
        check(session.storeId == device.storeId && session.deviceId == device.deviceId && code.isNotBlank())
        check(db.onlinePaymentDao().getUnresolved() == null) { "Phải đối soát QR trước khi đóng phiên." }
        val actual = session.actualCashVnd ?: error("Cần chốt bảng kê thực đếm trước.")
        val expected = Math.addExact(session.openingCashVnd, db.salesDao().cashSalesForRegister(session.id))
        check(expected == session.expectedCashVnd) { "Giao dịch trong phiên đã thay đổi. Cần đối soát lại phiên quỹ." }
        val variance = Math.subtractExact(actual, expected)
        require(validCashCompensation(variance, compensation)) { "Cần kiểm đếm đủ tiền nộp bù thiếu quỹ." }
        val total = CashCountInput(counts = compensation).total
        if (session.closingMode == "HANDOVER") require(validCashCountSnapshot(Math.addExact(actual, total),
            mergeCashCounts(counts(session.closingDenominationsJson), compensation))) { "Bảng kê bàn giao vượt giới hạn kiểm đếm." }
        val now = System.currentTimeMillis()
        check(dao.close(session.id, expected, actual, variance, session.closingDenominationsJson, now,
            compensationCashVnd = if (variance < 0) total else null,
            compensationDenominationsJson = if (variance < 0) json(compensation) else null,
            closingMode = session.closingMode ?: "END_OF_DAY") == 1) { "Phiên đã được đóng." }
        val payload = JSONObject().put("sessionId", session.id).put("actualCashVnd", actual).put("closedByCode", code)
            .put("closedAt", Instant.ofEpochMilli(now).toString()).put("closingMode", session.closingMode ?: "END_OF_DAY")
            .put("closingDenominations", JSONObject(session.closingDenominationsJson!!))
        if (variance < 0) payload.put("compensationCashVnd", total).put("compensationDenominations", JSONObject(json(compensation)))
        db.salesDao().insertOutbox(OutboxOperationEntity(UUID.randomUUID().toString(), "REGISTER_SESSION_CLOSED", payload.toString(), createdAt = now))
        dao.get(session.id)!!
    }
}
