package vn.id.congtc145.coffeepos.ui.login

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.data.sync.CatalogSyncRepository
import vn.id.congtc145.coffeepos.domain.NumericCredentials

data class LoginUiState(
    val employeeCode: String = "",
    val pin: String = "",
    val activeField: String = "CODE", // "CODE" hoặc "PIN"
    val storeId: String = "",
    val storeName: String = "",
    val storeCode: String = "",
    val deviceCode: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class LoginViewModel(application: Application) : AndroidViewModel(application) {
    private val credentialStore = DeviceCredentialStore(application)
    private val apiClient = PosApiClient()
    private val database = AppDatabase.getDatabase(application)
    private val catalogSync = CatalogSyncRepository(database, apiClient)
    private var loginJob: Job? = null

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        refreshDeviceIdentity()
    }

    fun refreshDeviceIdentity() {
        credentialStore.load()?.let { session ->
            _uiState.update {
                it.copy(
                    storeId = session.storeId,
                    storeName = session.storeName,
                    storeCode = session.storeId,
                    deviceCode = session.deviceId.take(8).uppercase()
                )
            }
        }
    }

    fun selectField(field: String) {
        if (_uiState.value.isLoading || field !in setOf("CODE", "PIN")) return
        _uiState.update { it.copy(activeField = field, errorMessage = null) }
    }

    private fun input(): NumericCredentials = _uiState.value.let {
        NumericCredentials(it.employeeCode, it.pin, it.activeField)
    }

    private fun applyInput(input: NumericCredentials) {
        _uiState.update { it.copy(employeeCode = input.employeeCode, pin = input.pin,
            activeField = input.activeField, errorMessage = null) }
    }

    fun appendDigit(digit: String, onSuccess: (String, String) -> Unit) {
        if (_uiState.value.isLoading) return
        val before = input()
        val after = before.append(digit)
        applyInput(after)
        if (after != before && after.isComplete) executeLogin(after.employeeCode, after.pin, onSuccess)
    }

    fun appendVerificationDigit(digit: String, expectedCashierCode: String, onSuccess: (String, String) -> Unit) {
        if (_uiState.value.isLoading) return
        val before = input()
        val after = before.append(digit)
        applyInput(after)
        if (after == before || !after.isComplete) return
        if (expectedCashierCode.isBlank() || after.employeeCode != expectedCashierCode) {
            _uiState.update { it.copy(pin = "", activeField = "CODE",
                errorMessage = "Vui lòng xác thực bằng mã của thu ngân hiện tại.") }
            return
        }
        // Same online home-store/PIN validation as login, for the current cashier only.
        executeLogin(after.employeeCode, after.pin, onSuccess)
    }

    fun backspace() { if (!_uiState.value.isLoading) applyInput(input().backspace()) }
    fun clearSelected() { if (!_uiState.value.isLoading) applyInput(NumericCredentials()) }
    fun clearAll() { if (!_uiState.value.isLoading) applyInput(NumericCredentials()) }

    fun leaveScreen() {
        loginJob?.cancel()
        _uiState.update { it.copy(employeeCode = "", pin = "", activeField = "CODE", isLoading = false, errorMessage = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun login(onSuccess: (cashierName: String, cashierCode: String) -> Unit) {
        val code = _uiState.value.employeeCode
        val pin = _uiState.value.pin

        if (code.length != 7) {
            _uiState.update {
                it.copy(
                    employeeCode = "",
                    pin = "",
                    activeField = "CODE",
                    errorMessage = "Mã nhân viên phải đủ 7 số (ví dụ: 1000001)."
                )
            }
            return
        }

        if (pin.length < 4) {
            _uiState.update {
                it.copy(
                    employeeCode = "",
                    pin = "",
                    activeField = "CODE",
                    errorMessage = "Mã PIN bảo mật phải gồm 4 chữ số."
                )
            }
            return
        }

        executeLogin(code, pin, onSuccess)
    }

    private fun executeLogin(code: String, pin: String, onSuccess: (cashierName: String, cashierCode: String) -> Unit) {
        if (_uiState.value.isLoading) return
        _uiState.update { it.copy(isLoading = true, errorMessage = null) }

        loginJob = viewModelScope.launch {
            val device = credentialStore.load()
            if (device == null) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        employeeCode = "",
                        pin = "",
                        activeField = "CODE",
                        errorMessage = "Thiết bị chưa được kích hoạt."
                    )
                }
                return@launch
            }

            runCatching {
                // Enrollment may have succeeded just before a network failure. On the
                // next app launch, complete the first Room snapshot before cashier login.
                if (database.catalogDao().getSyncState()?.hasBootstrap != true) {
                    catalogSync.pull(device)
                }
                apiClient.cashierLogin(device, code, pin).also { result ->
                    check(result.storeId == device.storeId && result.employeeCode == code) {
                        "Phản hồi đăng nhập không khớp chi nhánh hoặc mã nhân viên của thiết bị."
                    }
                }
            }
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            employeeCode = "",
                            pin = "",
                            activeField = "CODE",
                            errorMessage = null,
                            storeId = result.storeId,
                            storeName = result.storeName
                        )
                    }
                    onSuccess(result.employeeName, result.employeeCode)
                }
                .onFailure { error ->
                    if (error is CancellationException) throw error
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            employeeCode = "",
                            pin = "",
                            activeField = "CODE",
                            errorMessage = error.message ?: "Không thể đăng nhập thu ngân trực tuyến."
                        )
                    }
                }
        }
    }
}
