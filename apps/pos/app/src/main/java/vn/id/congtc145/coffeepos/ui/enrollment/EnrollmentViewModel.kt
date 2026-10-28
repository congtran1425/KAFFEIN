package vn.id.congtc145.coffeepos.ui.enrollment

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.SyncStateEntity
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.data.sync.CatalogSyncRepository

data class EnrollmentUiState(
    val activationCode: String = "",
    val displayName: String = "POS Quầy 01",
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class EnrollmentViewModel(application: Application) : AndroidViewModel(application) {
    private val credentialStore = DeviceCredentialStore(application)
    private val apiClient = PosApiClient()
    private val database = AppDatabase.getDatabase(application)
    private val catalogSync = CatalogSyncRepository(database, apiClient)
    private val _uiState = MutableStateFlow(EnrollmentUiState())
    val uiState: StateFlow<EnrollmentUiState> = _uiState.asStateFlow()

    init {
        if (credentialStore.hasStoredEnrollment() && credentialStore.load() == null) {
            _uiState.update { it.copy(
                errorMessage = "Máy có dữ liệu kích hoạt cũ nhưng không đọc được credential. Không kích hoạt lại trên dữ liệu này; hãy liên hệ Owner để xử lý thiết bị."
            ) }
        }
    }

    fun isEnrolled(): Boolean = credentialStore.load() != null

    fun updateActivationCode(value: String) {
        _uiState.update { it.copy(activationCode = value.trim(), errorMessage = null) }
    }

    fun updateDisplayName(value: String) {
        _uiState.update { it.copy(displayName = value, errorMessage = null) }
    }

    fun enroll(onSuccess: () -> Unit) {
        val state = _uiState.value
        val existingSession = credentialStore.load()
        if (existingSession == null && credentialStore.hasStoredEnrollment()) {
            _uiState.update { it.copy(
                errorMessage = "Không đọc được credential đã lưu. Không thể kích hoạt lại nếu chưa xử lý dữ liệu thiết bị cũ."
            ) }
            return
        }
        if (existingSession == null && (!state.activationCode.contains('.') || state.displayName.isBlank())) {
            _uiState.update { it.copy(errorMessage = "Nhập mã kích hoạt và tên thiết bị hợp lệ.") }
            return
        }

        _uiState.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            runCatching {
                val session = existingSession ?: run {
                    check(database.salesDao().countLocalOperationalRecords() == 0 &&
                        database.activeCartDao().get() == null) {
                        "Máy còn đơn, phiên quỹ hoặc outbox từ lần sử dụng trước. Không kích hoạt chi nhánh mới trên dữ liệu này; hãy liên hệ Owner để bảo toàn và đối soát."
                    }
                    apiClient.enroll(state.activationCode, state.displayName.trim()).also { enrolled ->
                        // Never reuse a prior installation's checkpoint for a newly enrolled
                        // device. The old catalog is replaced only by a successful cold pull.
                        database.catalogDao().saveSyncState(SyncStateEntity(cursor = "0", hasBootstrap = false))
                        credentialStore.save(enrolled)
                    }
                }
                catalogSync.pull(session)
            }.onSuccess {
                _uiState.update { it.copy(isLoading = false, activationCode = "") }
                onSuccess()
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = if (credentialStore.load() != null) {
                            "Thiết bị đã kích hoạt nhưng chưa tải được thực đơn. Kiểm tra mạng rồi bấm tiếp để thử lại."
                        } else {
                            error.message ?: "Không thể kích hoạt thiết bị."
                        }
                    )
                }
            }
        }
    }
}
