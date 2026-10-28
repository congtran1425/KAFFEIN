package vn.id.congtc145.coffeepos.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Index

@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val categoryId: String,
    val basePrice: Long,
    val isAvailable: Boolean = true,
    val description: String = "",
    @ColumnInfo(defaultValue = "'[]'") val allowedToppingIdsJson: String = "[]"
)

@Entity(tableName = "product_variants")
data class ProductVariantEntity(
    @PrimaryKey val id: String,
    val productId: String,
    val code: String,
    val sizeLabel: String,
    val priceVnd: Long,
    val isDefault: Boolean
)

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val id: Int = 1,
    val cursor: String = "0",
    val hasBootstrap: Boolean = false
)

@Entity(tableName = "ingredients")
data class IngredientEntity(
    @PrimaryKey val id: String,
    val code: String,
    val name: String,
    val baseUnit: String,
    val isActive: Boolean
)

@Entity(tableName = "recipe_versions")
data class RecipeVersionEntity(
    @PrimaryKey val id: String,
    val productVariantId: String,
    val versionNo: Int,
    val status: String
)

@Entity(tableName = "recipe_items", primaryKeys = ["recipeVersionId", "ingredientId"])
data class RecipeItemEntity(
    val recipeVersionId: String,
    val ingredientId: String,
    val quantity: String
)

@Entity(tableName = "topping_recipe_items", primaryKeys = ["toppingId", "ingredientId"])
data class ToppingRecipeItemEntity(
    val toppingId: String,
    val ingredientId: String,
    val quantity: String
)

@Entity(tableName = "stock_balances")
data class StockBalanceEntity(
    @PrimaryKey val ingredientId: String,
    val storeId: String,
    val quantity: String,
    val updatedAt: String
)

data class StockBalanceDisplayItem(
    val id: String,
    val code: String,
    val name: String,
    val baseUnit: String,
    val quantity: String?
)

/** Immutable local evidence of the recipe actually used for one paid sale line. */
@Entity(tableName = "sale_item_consumptions", primaryKeys = ["saleItemId", "ingredientId"])
data class SaleItemConsumptionEntity(
    val saleItemId: String,
    val saleId: String,
    val recipeVersionId: String,
    val ingredientId: String,
    val ingredientNameSnapshot: String,
    val unitSnapshot: String,
    val quantityPerItem: String,
    val quantityTotal: String
)

@Entity(tableName = "local_stock_movements")
data class LocalStockMovementEntity(
    @PrimaryKey val id: String,
    val saleId: String,
    val operationId: String,
    val ingredientId: String,
    val quantityDelta: String,
    val balanceAfter: String,
    val createdAt: Long
)

@Entity(tableName = "product_categories")
data class ProductCategoryEntity(
    @PrimaryKey val id: String,
    val name: String,
    val taxRateBps: Int = 0,
    val sortOrder: Int = 0,
    val isActive: Boolean = true
)

/** Read model tạo từ JOIN; VAT không được lưu hoặc override trên product. */
data class CatalogProduct(
    val id: String,
    val code: String,
    val name: String,
    val categoryId: String,
    val category: String,
    val basePrice: Long,
    val taxRateBps: Int,
    val isAvailable: Boolean,
    val description: String,
    val allowedToppingIdsJson: String
)

@Entity(tableName = "toppings")
data class ToppingEntity(
    @PrimaryKey val id: String,
    val name: String,
    val price: Long,
    val isAvailable: Boolean = true
)

@Entity(tableName = "draft_orders")
data class DraftOrderEntity(
    @PrimaryKey val id: String,
    val customerName: String? = null,
    val heldAt: Long = System.currentTimeMillis(),
    val note: String? = null,
    val itemsJson: String, // Lưu cấu trúc các món, size, topping dạng JSON
    val totalAmount: Long
)

/** The unfinished cart is local-only and belongs to the enrolled store/device. */
@Entity(tableName = "active_cart")
data class ActiveCartEntity(
    @PrimaryKey val id: Int = 1,
    val storeId: String,
    val deviceId: String,
    val itemsJson: String,
    val updatedAt: Long
)

/** Monotonic local display code allocator; rows are deliberately not deleted. */
@Entity(tableName = "draft_code_sequence")
data class DraftCodeSequenceEntity(
    @PrimaryKey(autoGenerate = true) val number: Long = 0
)

@Entity(tableName = "sales")
data class SaleEntity(
    @PrimaryKey val id: String,
    val saleNumber: String,
    val storeId: String,
    val storeName: String,
    val cashierCode: String,
    val cashierName: String,
    val registerSessionId: String? = null,
    val itemsJson: String,
    val subtotalVnd: Long,
    val taxVnd: Long,
    val totalVnd: Long,
    val paymentMethod: String,
    val cashReceivedVnd: Long,
    val changeVnd: Long,
    val status: String = "PAID",
    val completedAt: Long = System.currentTimeMillis()
)

/** Persist before HTTP: a timeout or logout must not permit a second tender. */
@Entity(tableName = "online_payment_attempts")
data class OnlinePaymentAttemptEntity(
    @PrimaryKey val saleId: String,
    val storeId: String,
    val deviceId: String,
    val registerSessionId: String,
    val cashierCode: String,
    val cashierName: String,
    val itemsJson: String,
    val totalVnd: Long,
    val createdAt: Long,
    val status: String,
    val paymentId: String? = null,
    val qrCode: String? = null,
    val expiresAt: Long? = null,
    val provider: String = "ZALOPAY"
)

@Entity(tableName = "outbox_operations")
data class OutboxOperationEntity(
    @PrimaryKey val operationId: String,
    val operationType: String,
    val payloadJson: String,
    val createdAt: Long = System.currentTimeMillis(),
    val attemptCount: Int = 0,
    val status: String = "PENDING",
    val lastError: String? = null
)

@Entity(tableName = "register_sessions", indices = [Index(value = ["handoverFromSessionId"], unique = true)])
data class RegisterSessionEntity(
    @PrimaryKey val id: String,
    val storeId: String,
    val deviceId: String,
    val openedByCode: String,
    val openedByName: String,
    val openingCashVnd: Long,
    val openedAt: Long = System.currentTimeMillis(),
    val expectedCashVnd: Long? = null,
    val actualCashVnd: Long? = null,
    val varianceVnd: Long? = null,
    val closedAt: Long? = null,
    val status: String = "OPEN",
    val openingDenominationsJson: String? = null,
    val closingDenominationsJson: String? = null,
    val compensationCashVnd: Long? = null,
    val compensationDenominationsJson: String? = null,
    val compensationNote: String? = null,
    val closingMode: String? = null,
    val handoverFromSessionId: String? = null
)
