package vn.id.congtc145.coffeepos.ui.register

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.RegisterCashRepository
import vn.id.congtc145.coffeepos.data.local.entity.RegisterSessionEntity
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore
import vn.id.congtc145.coffeepos.data.sync.SyncOutboxScheduler

data class RegisterUiState(
    val openSession: RegisterSessionEntity? = null,
    val isLoaded: Boolean = false,
    val cashSalesVnd: Long = 0,
    val cashierCode: String = "",
    val cashierName: String = "",
    val isSaving: Boolean = false,
    val errorMessage: String? = null,
    val lastClosedSummary: String? = null,
    val completedOperation: Long = 0
)

class RegisterViewModel(application: Application) : AndroidViewModel(application) {
    private val database = AppDatabase.getDatabase(application)
    private val repository = RegisterCashRepository(database)
    private val credentials = DeviceCredentialStore(application)
    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            database.registerSessionDao().observeOpenSession().collectLatest { session ->
                if (session == null) _uiState.update { it.copy(openSession = null, cashSalesVnd = 0, isLoaded = true) }
                else database.salesDao().observeCashSalesForRegister(session.id).collect { cash ->
                    _uiState.update { it.copy(openSession = session, cashSalesVnd = cash, isLoaded = true) }
                }
            }
        }
    }
    fun setCashier(code: String, name: String) { _uiState.update { it.copy(cashierCode = code, cashierName = name) } }
    fun clearFeedback() { _uiState.update { it.copy(errorMessage = null, lastClosedSummary = null) } }

    private fun action(complete: Boolean = false, finished: ((Boolean) -> Unit)? = null, operation: suspend () -> Unit) {
        if (_uiState.value.isSaving) return
        if (DesignPreviewMode.isActive(getApplication())) {
            _uiState.update { it.copy(errorMessage = "Chế độ xem trước không ghi giao dịch quỹ.") }
            finished?.invoke(false)
            return
        }
        _uiState.update { it.copy(isSaving = true, errorMessage = null) }
        viewModelScope.launch {
            try {
                operation()
                _uiState.update { it.copy(isSaving = false,
                    completedOperation = it.completedOperation + if (complete) 1 else 0,
                    lastClosedSummary = if (complete) "Đã hoàn tất phiên tiền mặt." else null) }
                SyncOutboxScheduler.enqueueNow(getApplication())
                finished?.invoke(true)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                _uiState.update { it.copy(isSaving = false, errorMessage = error.message ?: "Không thể lưu phiên quỹ.") }
                finished?.invoke(false)
            }
        }
    }
    fun receiveHandover(finished: (Boolean) -> Unit) = action(finished = finished) {
        repository.receiveHandover(credentials.load() ?: error("Thiết bị chưa sẵn sàng."),
            _uiState.value.cashierCode, _uiState.value.cashierName)
    }
    fun open(amount: Long, denominations: Map<Long, Int>) = action(complete = true) {
        repository.open(credentials.load() ?: error("Thiết bị chưa sẵn sàng."),
            _uiState.value.cashierCode, _uiState.value.cashierName, amount, denominations)
    }
    fun reconcile(denominations: Map<Long, Int>, mode: String) = action {
        repository.freeze(credentials.load() ?: error("Thiết bị chưa sẵn sàng."),
            _uiState.value.openSession?.id ?: error("Chưa có phiên quỹ."), denominations, mode)
    }
    fun close(compensation: Map<Long, Int> = emptyMap()) = action(complete = true) {
        repository.close(credentials.load() ?: error("Thiết bị chưa sẵn sàng."), _uiState.value.cashierCode, compensation)
    }
}