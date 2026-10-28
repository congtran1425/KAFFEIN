package vn.id.congtc145.coffeepos.ui.login

import android.app.Application
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.domain.CashierIdleTimer

data class CashierLockState(
    val employeeCode: String = "",
    val employeeName: String = "",
    val isLocked: Boolean = false
)

class CashierLockViewModel @JvmOverloads constructor(
    application: Application,
    nowMs: () -> Long = SystemClock::elapsedRealtime
) : AndroidViewModel(application) {
    private val timer = CashierIdleTimer(nowMs)
    private val _state = MutableStateFlow(CashierLockState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            while (true) {
                delay(1_000)
                checkTimeout()
            }
        }
    }

    fun beginSession(code: String, name: String) {
        timer.start()
        _state.value = CashierLockState(employeeCode = code, employeeName = name)
    }

    fun endSession() {
        timer.stop()
        _state.value = CashierLockState()
    }

    fun checkTimeout() {
        if (timer.isExpired()) lock()
    }

    fun recordActivity() {
        // Check expiry first: the first touch after a long pause cannot revive the session.
        checkTimeout()
        if (!_state.value.isLocked) timer.recordActivity()
    }

    fun lock() {
        if (_state.value.employeeCode.isBlank() || _state.value.isLocked) return
        // Manual lock and inactivity use the same login redirect; no PIN overlay.
        timer.stop()
        _state.update { it.copy(isLocked = true) }
    }
}
