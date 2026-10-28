package vn.id.congtc145.coffeepos.ui.inventory

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.StockBalanceDisplayItem

class InventoryViewModel(application: Application) : AndroidViewModel(application) {
    private val _balances = MutableStateFlow<List<StockBalanceDisplayItem>?>(null)
    val balances = _balances.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()
    init {
        viewModelScope.launch {
            AppDatabase.getDatabase(application).inventoryDao().observeStockBalances()
                .catch { _error.value = it.message ?: "Không thể đọc dữ liệu tồn kho trên thiết bị." }
                .collect { _balances.value = it; _error.value = null }
        }
    }
}
