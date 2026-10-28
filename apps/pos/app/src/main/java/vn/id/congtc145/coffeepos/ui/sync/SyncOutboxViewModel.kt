package vn.id.congtc145.coffeepos.ui.sync

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.DesignPreviewMode
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.sync.SyncOutboxScheduler

enum class SyncWorkState { IDLE, QUEUED, RUNNING }

class SyncOutboxViewModel(application: Application) : AndroidViewModel(application) {
    private val _operations = MutableStateFlow<List<OutboxOperationEntity>?>(null)
    val operations = _operations.asStateFlow()
    private val _feedback = MutableStateFlow<String?>(null)
    val feedback = _feedback.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()
    private val _workState = MutableStateFlow(SyncWorkState.IDLE)
    val workState = _workState.asStateFlow()
    init {
        viewModelScope.launch {
            AppDatabase.getDatabase(application).salesDao().observeOutboxOperations()
                .catch { _error.value = it.message ?: "Không thể đọc hoạt động đồng bộ trên thiết bị." }
                .collect { _operations.value = it; _error.value = null }
        }
        viewModelScope.launch {
            WorkManager.getInstance(application).getWorkInfosForUniqueWorkFlow("coffee-pos-outbox-now")
                .collect { work ->
                    _workState.value = when {
                        work.any { it.state == WorkInfo.State.RUNNING } -> SyncWorkState.RUNNING
                        work.any { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.BLOCKED } -> SyncWorkState.QUEUED
                        else -> SyncWorkState.IDLE
                    }
                }
        }
    }
    fun syncNow() {
        if (DesignPreviewMode.isActive(getApplication())) {
            _feedback.value = "Chế độ xem trước: không gửi dữ liệu lên server."
            return
        }
        if (_workState.value != SyncWorkState.IDLE) return
        _workState.value = SyncWorkState.QUEUED
        val queued = runCatching { SyncOutboxScheduler.enqueueNow(getApplication()) }
        if (queued.isFailure) {
            _workState.value = SyncWorkState.IDLE
            _feedback.value = queued.exceptionOrNull()?.message ?: "Không thể xếp lịch đồng bộ."
            return
        }
        _feedback.value = if (_operations.value.orEmpty().any { it.status == "REJECTED" }) {
            "Đã xếp lịch đồng bộ. Mục cần đối soát vẫn được giữ để kiểm tra."
        } else "Đã xếp lịch đồng bộ; dữ liệu sẽ gửi khi có mạng."
    }
}
