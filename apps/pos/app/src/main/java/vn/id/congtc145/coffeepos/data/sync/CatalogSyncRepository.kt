package vn.id.congtc145.coffeepos.data.sync

import androidx.room.withTransaction
import kotlinx.coroutines.sync.withLock
import vn.id.congtc145.coffeepos.data.local.AppDatabase
import vn.id.congtc145.coffeepos.data.local.entity.ProductCategoryEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.IngredientEntity
import vn.id.congtc145.coffeepos.data.local.entity.RecipeVersionEntity
import vn.id.congtc145.coffeepos.data.local.entity.RecipeItemEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingRecipeItemEntity
import vn.id.congtc145.coffeepos.data.local.entity.StockBalanceEntity
import vn.id.congtc145.coffeepos.data.local.entity.SyncStateEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.data.network.PosApiClient
import vn.id.congtc145.coffeepos.data.network.SyncChange
import vn.id.congtc145.coffeepos.data.security.DeviceSession

/** Network data is committed to Room with its cursor; UI never reads the HTTP response. */
class CatalogSyncRepository(
    private val database: AppDatabase,
    private val api: PosApiClient = PosApiClient()
) {
    suspend fun pull(session: DeviceSession, forceSnapshot: Boolean = false) = PosSyncLocks.catalog.withLock {
        // Server sends absolute stock balances. Never overwrite locally deducted
        // stock while a paid sale is still waiting in the outbox.
        check(database.salesDao().countUnsyncedOperations() == 0) {
            "Còn giao dịch chưa đồng bộ; chưa thể cập nhật tồn kho từ máy chủ."
        }
        var cursor = if (forceSnapshot) "0" else database.catalogDao().getSyncState()?.cursor ?: "0"
        repeat(100) {
            val page = api.syncPull(session, cursor)
            require(page.nextCursor.isNotBlank() && page.nextCursor.all(Char::isDigit)) {
                "Máy chủ trả sync cursor không hợp lệ."
            }
            check(!page.hasMore || page.nextCursor != cursor) {
                "Máy chủ không tăng sync cursor dù còn dữ liệu."
            }

            // Older master-catalog imports emit a reset marker instead of per-item deltas.
            // Do not acknowledge the marker (or apply other changes in this page) until a
            // complete snapshot has replaced the catalog and stock in one Room transaction.
            val requiresBootstrap = page.changes.any { it.entityType in RESET_ENTITIES }
            if (requiresBootstrap) {
                check(cursor != "0") { "Snapshot máy chủ chứa marker làm mới thực đơn." }
                check(page.changes.filter { it.entityType in RESET_ENTITIES }
                    .all { it.changeType == "UPSERT" }) {
                    "Marker làm mới thực đơn không hợp lệ."
                }
                cursor = "0"
                return@repeat
            }

            database.withTransaction {
                check(database.salesDao().countUnsyncedOperations() == 0) {
                    "Có giao dịch mới đang chờ; giữ nguyên tồn kho local."
                }
                val catalog = database.catalogDao()
                // Backend uses cursor=0 for a complete cold snapshot, not a delta page.
                if (cursor == "0") {
                    catalog.clearVariants()
                    catalog.clearProducts()
                    catalog.clearCategories()
                    catalog.clearToppings()
                    val inventory = database.inventoryDao()
                    inventory.clearRecipeItems()
                    inventory.clearRecipes()
                    inventory.clearToppingRecipeItems()
                    inventory.clearStockBalances()
                    inventory.clearIngredients()
                }
                for (change in page.changes) applyChange(change, session.storeId)
                catalog.saveSyncState(SyncStateEntity(cursor = page.nextCursor, hasBootstrap = true))
            }

            cursor = page.nextCursor
            if (!page.hasMore) return@withLock
        }
        error("Quá nhiều trang sync liên tiếp; cần kiểm tra máy chủ.")
    }

    private suspend fun applyChange(change: SyncChange, storeId: String) {
        val dao = database.catalogDao()
        val inventory = database.inventoryDao()
        val payload = change.payload
        when (change.entityType) {
            "product_categories", "categories" -> {
                if (change.changeType == "DELETE") {
                    dao.deleteCategory(change.entityId)
                } else {
                    requireUpsert(change)
                    dao.insertCategories(listOf(ProductCategoryEntity(
                        id = payload.getString("id"),
                        name = payload.getString("name"),
                        taxRateBps = payload.optInt("taxRateBps", 0),
                        sortOrder = payload.optInt("sortOrder", 0),
                        isActive = payload.optBoolean("isActive", true)
                    )))
                }
            }

            "products" -> {
                if (change.changeType == "DELETE") {
                    dao.deleteVariantsForProduct(change.entityId)
                    dao.deleteProduct(change.entityId)
                } else {
                    requireUpsert(change)
                    if (!payload.has("variants") || !payload.has("categoryId")) {
                        check(dao.updateProductStatus(
                            id = change.entityId,
                            name = payload.getString("name"),
                            isActive = payload.getBoolean("isActive")
                        ) == 1) { "Delta món ${change.entityId} thiếu dữ liệu và chưa có bản ghi Room." }
                        return
                    }
                    val productId = payload.getString("id")
                    val variantsJson = payload.getJSONArray("variants")
                    val variants = (0 until variantsJson.length()).mapNotNull { index ->
                        val v = variantsJson.getJSONObject(index)
                        if (!v.optBoolean("isActive", true)) return@mapNotNull null
                        ProductVariantEntity(
                            id = v.getString("id"),
                            productId = productId,
                            code = v.getString("code"),
                            sizeLabel = if (v.isNull("sizeLabel")) "Tiêu chuẩn" else v.getString("sizeLabel"),
                            priceVnd = v.getString("priceVnd").toLong(),
                            isDefault = v.optBoolean("isDefault", false)
                        )
                    }
                    val defaultVariant = variants.firstOrNull { it.isDefault } ?: variants.firstOrNull()
                    dao.insertProducts(listOf(ProductEntity(
                        id = productId,
                        code = payload.getString("code"),
                        name = payload.getString("name"),
                        categoryId = payload.getString("categoryId"),
                        basePrice = defaultVariant?.priceVnd ?: 0L,
                        isAvailable = payload.optBoolean("isActive", true) && variants.isNotEmpty(),
                        description = if (payload.isNull("description")) "" else payload.optString("description", ""),
                        allowedToppingIdsJson = payload.optJSONArray("allowedToppingIds")?.toString() ?: "[]"
                    )))
                    dao.deleteVariantsForProduct(productId)
                    dao.insertVariants(variants)
                }
            }

            "toppings" -> {
                if (change.changeType == "DELETE") {
                    dao.deleteTopping(change.entityId)
                } else {
                    requireUpsert(change)
                    dao.insertToppings(listOf(ToppingEntity(
                        id = payload.getString("id"),
                        name = payload.getString("name"),
                        price = payload.getString("priceVnd").toLong(),
                        isAvailable = payload.optBoolean("isActive", true)
                    )))
                }
            }

            "ingredients" -> {
                if (change.changeType == "DELETE") inventory.deleteIngredient(change.entityId)
                else {
                    requireUpsert(change)
                    inventory.upsertIngredient(IngredientEntity(
                        id = payload.getString("id"),
                        code = payload.getString("code"),
                        name = payload.getString("name"),
                        baseUnit = payload.getString("baseUnit"),
                        isActive = payload.optBoolean("isActive", true)
                    ))
                }
            }

            "recipes" -> {
                inventory.deleteRecipeItems(change.entityId)
                if (change.changeType == "DELETE") inventory.deleteRecipe(change.entityId)
                else {
                    requireUpsert(change)
                    inventory.upsertRecipe(RecipeVersionEntity(
                        id = payload.getString("id"),
                        productVariantId = payload.getString("productVariantId"),
                        versionNo = payload.getInt("versionNo"),
                        status = payload.getString("status")
                    ))
                    val items = payload.getJSONArray("items")
                    inventory.upsertRecipeItems((0 until items.length()).map { index ->
                        val item = items.getJSONObject(index)
                        RecipeItemEntity(
                            recipeVersionId = change.entityId,
                            ingredientId = item.getString("ingredientId"),
                            quantity = item.getString("quantity")
                        )
                    })
                }
            }

            "topping_recipes" -> {
                inventory.deleteToppingRecipeItems(change.entityId)
                if (change.changeType != "DELETE") {
                    requireUpsert(change)
                    val items = payload.getJSONArray("items")
                    inventory.upsertToppingRecipeItems((0 until items.length()).map { index ->
                        val item = items.getJSONObject(index)
                        ToppingRecipeItemEntity(
                            toppingId = change.entityId,
                            ingredientId = item.getString("ingredientId"),
                            quantity = item.getString("quantity")
                        )
                    })
                }
            }

            "stock_balances" -> {
                if (change.changeType == "DELETE") inventory.deleteStockBalance(change.entityId)
                else {
                    requireUpsert(change)
                    require(payload.getString("storeId") == storeId) { "Stock delta sai phạm vi chi nhánh." }
                    inventory.upsertStockBalance(StockBalanceEntity(
                        ingredientId = payload.getString("ingredientId"),
                        storeId = storeId,
                        quantity = payload.getString("quantity"),
                        updatedAt = payload.getString("updatedAt")
                    ))
                }
            }

            // Device enrollment owns the store identity. Employee PIN verifier is not in pull.
            "stores", "store", "employees" -> Unit
            else -> error("Chưa hỗ trợ sync entity ${change.entityType}; không ghi cursor.")
        }
    }

    private fun requireUpsert(change: SyncChange) {
        require(change.changeType == "UPSERT") { "Sync changeType không hợp lệ: ${change.changeType}" }
    }

    private companion object {
        val RESET_ENTITIES = setOf("catalog_bootstrap", "catalog_reset")
    }
}
