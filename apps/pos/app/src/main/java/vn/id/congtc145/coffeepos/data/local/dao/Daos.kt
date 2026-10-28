package vn.id.congtc145.coffeepos.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import vn.id.congtc145.coffeepos.data.local.entity.CatalogProduct
import vn.id.congtc145.coffeepos.data.local.entity.DraftOrderEntity
import vn.id.congtc145.coffeepos.data.local.entity.ActiveCartEntity
import vn.id.congtc145.coffeepos.data.local.entity.DraftCodeSequenceEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductCategoryEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.SyncStateEntity
import vn.id.congtc145.coffeepos.data.local.entity.IngredientEntity
import vn.id.congtc145.coffeepos.data.local.entity.RecipeVersionEntity
import vn.id.congtc145.coffeepos.data.local.entity.RecipeItemEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingRecipeItemEntity
import vn.id.congtc145.coffeepos.data.local.entity.StockBalanceEntity
import vn.id.congtc145.coffeepos.data.local.entity.StockBalanceDisplayItem
import vn.id.congtc145.coffeepos.data.local.entity.SaleItemConsumptionEntity
import vn.id.congtc145.coffeepos.data.local.entity.LocalStockMovementEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.local.entity.RegisterSessionEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity

@Dao
interface CatalogDao {
    @Query("""
        SELECT p.id, p.code, p.name, p.categoryId, c.name AS category,
               p.basePrice, c.taxRateBps AS taxRateBps,
               p.isAvailable, p.description, p.allowedToppingIdsJson
        FROM products p
        INNER JOIN product_categories c ON c.id = p.categoryId
        WHERE p.isAvailable = 1 AND c.isActive = 1
        ORDER BY c.sortOrder ASC, p.name ASC
    """)
    fun getAllProducts(): Flow<List<CatalogProduct>>

    @Query("""
        SELECT p.id, p.code, p.name, p.categoryId, c.name AS category,
               p.basePrice, c.taxRateBps AS taxRateBps,
               p.isAvailable, p.description, p.allowedToppingIdsJson
        FROM products p
        INNER JOIN product_categories c ON c.id = p.categoryId
        WHERE c.name = :category AND p.isAvailable = 1 AND c.isActive = 1
        ORDER BY p.name ASC
    """)
    fun getProductsByCategory(category: String): Flow<List<CatalogProduct>>

    @Query("SELECT name FROM product_categories WHERE isActive = 1 ORDER BY sortOrder ASC, name ASC")
    fun getCategories(): Flow<List<String>>

    @Query("SELECT * FROM toppings WHERE isAvailable = 1 ORDER BY name ASC")
    fun getAllToppings(): Flow<List<ToppingEntity>>

    @Query("SELECT * FROM product_variants ORDER BY isDefault DESC, priceVnd ASC")
    fun getAllVariants(): Flow<List<ProductVariantEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(products: List<ProductEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCategories(categories: List<ProductCategoryEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertToppings(toppings: List<ToppingEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVariants(variants: List<ProductVariantEntity>)

    @Query("DELETE FROM product_variants WHERE productId = :productId")
    suspend fun deleteVariantsForProduct(productId: String)

    @Query("DELETE FROM products WHERE id = :id")
    suspend fun deleteProduct(id: String)

    @Query("DELETE FROM product_categories WHERE id = :id")
    suspend fun deleteCategory(id: String)

    @Query("DELETE FROM toppings WHERE id = :id")
    suspend fun deleteTopping(id: String)

    @Query("DELETE FROM product_variants")
    suspend fun clearVariants()

    @Query("DELETE FROM products")
    suspend fun clearProducts()

    @Query("DELETE FROM product_categories")
    suspend fun clearCategories()

    @Query("DELETE FROM toppings")
    suspend fun clearToppings()

    @Query("UPDATE products SET isAvailable = :isActive, name = :name WHERE id = :id")
    suspend fun updateProductStatus(id: String, name: String, isActive: Boolean): Int

    @Query("SELECT * FROM sync_state WHERE id = 1 LIMIT 1")
    suspend fun getSyncState(): SyncStateEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveSyncState(state: SyncStateEntity)

    @Query("SELECT COUNT(*) FROM products")
    suspend fun getProductCount(): Int
}

@Dao
interface InventoryDao {
    @Query("SELECT i.id, i.code, i.name, i.baseUnit, s.quantity FROM ingredients i LEFT JOIN stock_balances s ON s.ingredientId = i.id ORDER BY i.name ASC")
    fun observeStockBalances(): Flow<List<StockBalanceDisplayItem>>

    @Query("SELECT * FROM recipe_versions WHERE productVariantId = :variantId AND status = 'ACTIVE' ORDER BY versionNo DESC LIMIT 1")
    suspend fun getActiveRecipe(variantId: String): RecipeVersionEntity?

    @Query("SELECT * FROM recipe_items WHERE recipeVersionId = :recipeVersionId")
    suspend fun getRecipeItems(recipeVersionId: String): List<RecipeItemEntity>

    @Query("SELECT * FROM topping_recipe_items WHERE toppingId = :toppingId")
    suspend fun getToppingRecipeItems(toppingId: String): List<ToppingRecipeItemEntity>

    @Query("SELECT * FROM ingredients WHERE id = :id LIMIT 1")
    suspend fun getIngredient(id: String): IngredientEntity?

    @Query("SELECT * FROM stock_balances WHERE ingredientId = :id LIMIT 1")
    suspend fun getStockBalance(id: String): StockBalanceEntity?

    @Query("UPDATE stock_balances SET quantity = :quantity WHERE ingredientId = :id AND storeId = :storeId")
    suspend fun updateStockBalance(id: String, storeId: String, quantity: String): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertConsumptions(values: List<SaleItemConsumptionEntity>)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertMovements(values: List<LocalStockMovementEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertIngredient(value: IngredientEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRecipe(value: RecipeVersionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRecipeItems(values: List<RecipeItemEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertToppingRecipeItems(values: List<ToppingRecipeItemEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertStockBalance(value: StockBalanceEntity)

    @Query("DELETE FROM ingredients WHERE id = :id")
    suspend fun deleteIngredient(id: String)

    @Query("DELETE FROM recipe_versions WHERE id = :id")
    suspend fun deleteRecipe(id: String)

    @Query("DELETE FROM recipe_items WHERE recipeVersionId = :id")
    suspend fun deleteRecipeItems(id: String)

    @Query("DELETE FROM topping_recipe_items WHERE toppingId = :id")
    suspend fun deleteToppingRecipeItems(id: String)

    @Query("DELETE FROM stock_balances WHERE ingredientId = :id")
    suspend fun deleteStockBalance(id: String)

    @Query("DELETE FROM ingredients")
    suspend fun clearIngredients()

    @Query("DELETE FROM recipe_versions")
    suspend fun clearRecipes()

    @Query("DELETE FROM recipe_items")
    suspend fun clearRecipeItems()

    @Query("DELETE FROM topping_recipe_items")
    suspend fun clearToppingRecipeItems()

    @Query("DELETE FROM stock_balances")
    suspend fun clearStockBalances()
}

@Dao
interface DraftOrderDao {
    @Insert
    suspend fun reserveDraftNumber(sequence: DraftCodeSequenceEntity): Long

    @Query("SELECT * FROM draft_orders ORDER BY heldAt DESC")
    fun getAllDraftOrders(): Flow<List<DraftOrderEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertDraftOrder(draftOrder: DraftOrderEntity)

    @Query("DELETE FROM draft_orders WHERE id = :orderId")
    suspend fun deleteDraftOrder(orderId: String)

    @Query("SELECT * FROM draft_orders WHERE id = :orderId LIMIT 1")
    suspend fun getDraftOrder(orderId: String): DraftOrderEntity?

    @Query("UPDATE draft_orders SET customerName = :label WHERE id = :orderId")
    suspend fun renameDraftOrder(orderId: String, label: String?): Int

    @Query("SELECT COUNT(*) FROM draft_orders")
    fun getDraftOrderCount(): Flow<Int>
}

@Dao
interface ActiveCartDao {
    @Query("SELECT * FROM active_cart WHERE id = 1 LIMIT 1")
    suspend fun get(): ActiveCartEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun save(cart: ActiveCartEntity)

    @Query("DELETE FROM active_cart WHERE id = 1")
    suspend fun clear()
}

@Dao
interface SalesDao {
    @Query("SELECT * FROM sales WHERE id = :id LIMIT 1")
    suspend fun getSale(id: String): SaleEntity?
    @Query("SELECT * FROM outbox_operations ORDER BY createdAt DESC, operationId ASC")
    fun observeOutboxOperations(): Flow<List<OutboxOperationEntity>>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertSale(sale: SaleEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertOutbox(operation: OutboxOperationEntity)

    @Query("SELECT COUNT(*) FROM outbox_operations WHERE status != 'SYNCED'")
    suspend fun countUnsyncedOperations(): Int

    @Query("""
        SELECT (SELECT COUNT(*) FROM sales)
             + (SELECT COUNT(*) FROM outbox_operations)
             + (SELECT COUNT(*) FROM draft_orders)
             + (SELECT COUNT(*) FROM register_sessions)
             + (SELECT COUNT(*) FROM online_payment_attempts)
    """)
    suspend fun countLocalOperationalRecords(): Int

    @Query("SELECT * FROM outbox_operations WHERE status != 'SYNCED' ORDER BY rowid ASC LIMIT 1")
    suspend fun getNextUnsyncedOperation(): OutboxOperationEntity?

    @Query("UPDATE outbox_operations SET status = 'SYNCED', lastError = NULL, attemptCount = attemptCount + 1 WHERE operationId = :operationId AND status != 'SYNCED'")
    suspend fun markSynced(operationId: String): Int

    @Query("UPDATE outbox_operations SET status = 'FAILED', lastError = :message, attemptCount = attemptCount + 1 WHERE operationId = :operationId AND status != 'SYNCED'")
    suspend fun markFailed(operationId: String, message: String): Int

    @Query("UPDATE outbox_operations SET status = 'REJECTED', lastError = :message, attemptCount = attemptCount + 1 WHERE operationId = :operationId AND status != 'SYNCED'")
    suspend fun markRejected(operationId: String, message: String): Int

    @Query("SELECT * FROM sales WHERE id = :id LIMIT 1")
    fun observeSale(id: String): Flow<SaleEntity?>

    @Query("SELECT * FROM sales WHERE status = 'PAID' ORDER BY completedAt DESC")
    fun observePaidSales(): Flow<List<SaleEntity>>

    @Query("SELECT COUNT(*) FROM outbox_operations WHERE status != 'SYNCED'")
    fun observePendingOutboxCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox_operations WHERE status = 'REJECTED'")
    fun observeRejectedOutboxCount(): Flow<Int>

    @Query("""
        SELECT COALESCE(SUM(totalVnd), 0) FROM sales
        WHERE paymentMethod = 'CASH' AND status = 'PAID' AND registerSessionId = :sessionId
    """)
    suspend fun cashSalesForRegister(sessionId: String): Long

    @Query("""
        SELECT COALESCE(SUM(totalVnd), 0) FROM sales
        WHERE paymentMethod = 'CASH' AND status = 'PAID' AND registerSessionId = :sessionId
    """)
    fun observeCashSalesForRegister(sessionId: String): Flow<Long>
}

@Dao
interface OnlinePaymentDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(attempt: vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity)

    @Query("SELECT * FROM online_payment_attempts WHERE status NOT IN ('PAID', 'FINAL_UNPAID', 'CANCELLED') ORDER BY createdAt ASC LIMIT 1")
    suspend fun getUnresolved(): vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity?

    @Query("SELECT * FROM online_payment_attempts WHERE saleId = :saleId")
    suspend fun get(saleId: String): vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity?

    @Query("SELECT * FROM online_payment_attempts ORDER BY createdAt DESC LIMIT 1")
    fun observeLatest(): Flow<vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity?>

    @Query("UPDATE online_payment_attempts SET status = :status, paymentId = :paymentId, qrCode = :qrCode, expiresAt = :expiresAt WHERE saleId = :saleId")
    suspend fun update(saleId: String, status: String, paymentId: String?, qrCode: String?, expiresAt: Long?)
}

@Dao
interface RegisterSessionDao {
    @Query("SELECT * FROM register_sessions WHERE id = :id")
    suspend fun get(id: String): RegisterSessionEntity?

    @Query("""SELECT * FROM register_sessions r WHERE r.deviceId = :deviceId AND r.storeId = :storeId
        AND r.status = 'CLOSED' AND r.closingMode = 'HANDOVER'
        AND NOT EXISTS (SELECT 1 FROM register_sessions n WHERE n.handoverFromSessionId = r.id)
        ORDER BY r.closedAt DESC LIMIT 1""")
    suspend fun pendingHandover(deviceId: String, storeId: String): RegisterSessionEntity?

    @Query("""UPDATE register_sessions SET expectedCashVnd = :expected, actualCashVnd = :actual,
        varianceVnd = :variance, closingDenominationsJson = :denominations, closingMode = :mode
        WHERE id = :id AND status = 'OPEN' AND actualCashVnd IS NULL""")
    suspend fun freezeCount(id: String, expected: Long, actual: Long, variance: Long, denominations: String, mode: String): Int
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insert(session: RegisterSessionEntity)

    @Query("SELECT * FROM register_sessions WHERE status = 'OPEN' ORDER BY openedAt DESC LIMIT 1")
    fun observeOpenSession(): Flow<RegisterSessionEntity?>

    @Query("SELECT * FROM register_sessions WHERE status = 'OPEN' ORDER BY openedAt DESC LIMIT 1")
    suspend fun getOpenSession(): RegisterSessionEntity?

    @Query("""
        UPDATE register_sessions
        SET expectedCashVnd = :expectedCashVnd,
            actualCashVnd = :actualCashVnd,
            varianceVnd = :varianceVnd,
            closingDenominationsJson = :closingDenominationsJson,
            compensationCashVnd = :compensationCashVnd,
            compensationDenominationsJson = :compensationDenominationsJson,
            compensationNote = :compensationNote,
            closingMode = :closingMode,
            closedAt = :closedAt,
            status = 'CLOSED'
        WHERE id = :id AND status = 'OPEN'
    """)
    suspend fun close(
        id: String,
        expectedCashVnd: Long,
        actualCashVnd: Long,
        varianceVnd: Long,
        closingDenominationsJson: String?,
        closedAt: Long,
        compensationCashVnd: Long? = null,
        compensationDenominationsJson: String? = null,
        compensationNote: String? = null,
        closingMode: String = "END_OF_DAY"
    ): Int
}
