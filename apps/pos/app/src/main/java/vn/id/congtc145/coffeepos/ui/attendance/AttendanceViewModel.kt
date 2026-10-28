package vn.id.congtc145.coffeepos.ui.attendance

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import vn.id.congtc145.coffeepos.domain.NumericCredentials
import vn.id.congtc145.coffeepos.data.sync.DeviceHeartbeatCoordinator
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class AttendanceActionType(val label: String, val subtitle: String) {
    CHECK_IN("CHECK-IN", "Vào ca làm việc"),
    CHECK_OUT("CHECK-OUT", "Ra ca & kết thúc giờ làm")
}

data class AttendanceUiState(
    val selectedAction: AttendanceActionType? = null,
    val employeeCode: String = "",
    val pin: String = "",
    val activeField: String = "CODE", // "CODE" hoặc "PIN"
    val isLoading: Boolean = false,
    val successMessage: String? = null,
    val errorMessage: String? = null,
    val lastRecordedEmployee: String? = null,
    val lastRecordedAction: String? = null,
    val lastRecordedTime: String? = null,
    val lastRecordedStore: String? = null,
    val isSupport: Boolean = false
)

class AttendanceViewModel(application: Application) : AndroidViewModel(application) {
    private val credentialStore = DeviceCredentialStore(application)
    private val apiClient = PosApiClient()
    private var attendanceJob: Job? = null
    val storeName: String get() = credentialStore.load()?.storeName.orEmpty()

    private val _uiState = MutableStateFlow(AttendanceUiState())
    val uiState: StateFlow<AttendanceUiState> = _uiState.asStateFlow()

    fun selectAction(action: AttendanceActionType) {
        if (_uiState.value.isLoading) return
        _uiState.update {
            it.copy(
                selectedAction = action,
                employeeCode = "",
                pin = "",
                activeField = "CODE",
                errorMessage = null,
                successMessage = null
            )
        }
    }

    fun resetAction() {
        if (_uiState.value.isLoading) return
        _uiState.update {
            it.copy(
                selectedAction = null,
                employeeCode = "",
                pin = "",
                activeField = "CODE",
                errorMessage = null,
                successMessage = null
            )
        }
    }

    private fun input(): NumericCredentials = _uiState.value.let {
        NumericCredentials(it.employeeCode, it.pin, it.activeField)
    }
    private fun applyInput(input: NumericCredentials) {
        _uiState.update { it.copy(employeeCode = input.employeeCode, pin = input.pin,
            activeField = input.activeField, errorMessage = null) }
    }

    fun selectField(field: String) {
        if (_uiState.value.isLoading) return
        applyInput(input().select(field))
    }

    fun appendDigit(digit: String) {
        if (_uiState.value.isLoading || _uiState.value.selectedAction == null) return
        val before = input()
        val after = before.append(digit)
        applyInput(after)
        if (after != before && after.isComplete) executeAttendance(after.employeeCode, after.pin)
    }

    fun backspace() { if (!_uiState.value.isLoading) applyInput(input().backspace()) }
    fun clearSelected() { if (!_uiState.value.isLoading) applyInput(NumericCredentials()) }
    fun clearAll() { if (!_uiState.value.isLoading) applyInput(NumericCredentials()) }

    fun leaveScreen() {
        attendanceJob?.cancel()
        _uiState.value = AttendanceUiState()
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun clearSuccess() {
        _uiState.update { it.copy(successMessage = null, selectedAction = null) }
    }

    private fun executeAttendance(code: String, pin: String) {
        if (_uiState.value.isLoading) return
        if (DeviceHeartbeatCoordinator.isOnline.value == false) {
            _uiState.update { it.copy(errorMessage = "Không thể chấm công khi ngoại tuyến.") }
            return
        }
        if (DesignPreviewMode.isActive(getApplication())) {
            _uiState.update { it.copy(pin = "", errorMessage = "Chế độ xem trước: không gửi chấm công.") }
            return
        }
        val action = _uiState.value.selectedAction ?: return
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        attendanceJob = viewModelScope.launch {
            val session = credentialStore.load()
            if (session == null) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Thiết bị chưa được kích hoạt với chi nhánh."
                    )
                }
                return@launch
            }

            runCatching {
                apiClient.attendance(
                    session = session,
                    action = if (action == AttendanceActionType.CHECK_IN) "check-in" else "check-out",
                    employeeCode = code,
                    pin = pin
                )
            }.onSuccess { result ->
                val localTime = runCatching {
                    DateTimeFormatter.ofPattern("HH:mm:ss - dd/MM/yyyy")
                        .withZone(ZoneId.of("Asia/Ho_Chi_Minh"))
                        .format(Instant.parse(result.timestamp))
                }.getOrDefault(result.timestamp)

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        employeeCode = "",
                        pin = "",
                        activeField = "CODE",
                        successMessage = "Ghi nhận ${action.label} thành công!",
                        lastRecordedEmployee = result.employeeName,
                        lastRecordedStore = result.storeName,
                        lastRecordedAction = action.label,
                        lastRecordedTime = localTime,
                        isSupport = result.isSupport
                    )
                }
            }.onFailure { error ->
                if (error is CancellationException) throw error
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        employeeCode = "",
                        pin = "",
                        activeField = "CODE",
                        errorMessage = error.message ?: "Không thể chấm công trực tuyến."
                    )
                }
            }
        }
    }
}
