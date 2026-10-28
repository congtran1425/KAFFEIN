package vn.id.congtc145.coffeepos.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import vn.id.congtc145.coffeepos.data.local.dao.CatalogDao
import vn.id.congtc145.coffeepos.data.local.dao.DraftOrderDao
import vn.id.congtc145.coffeepos.data.local.dao.ActiveCartDao
import vn.id.congtc145.coffeepos.data.local.dao.InventoryDao
import vn.id.congtc145.coffeepos.data.local.dao.RegisterSessionDao
import vn.id.congtc145.coffeepos.data.local.dao.SalesDao
import vn.id.congtc145.coffeepos.data.local.entity.DraftOrderEntity
import vn.id.congtc145.coffeepos.data.local.entity.ActiveCartEntity
import vn.id.congtc145.coffeepos.data.local.entity.DraftCodeSequenceEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductCategoryEntity
import vn.id.congtc145.coffeepos.data.local.entity.ProductVariantEntity
import vn.id.congtc145.coffeepos.data.local.entity.SyncStateEntity
import vn.id.congtc145.coffeepos.data.local.entity.IngredientEntity
import vn.id.congtc145.coffeepos.data.local.entity.RecipeVersionEntity
import vn.id.congtc145.coffeepos.data.local.entity.RecipeItemEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingRecipeItemEntity
import vn.id.congtc145.coffeepos.data.local.entity.StockBalanceEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleItemConsumptionEntity
import vn.id.congtc145.coffeepos.data.local.entity.LocalStockMovementEntity
import vn.id.congtc145.coffeepos.data.local.entity.ToppingEntity
import vn.id.congtc145.coffeepos.data.local.entity.OutboxOperationEntity
import vn.id.congtc145.coffeepos.data.local.entity.RegisterSessionEntity
import vn.id.congtc145.coffeepos.data.local.entity.SaleEntity

@Database(
    entities = [
        ProductEntity::class,
        ProductCategoryEntity::class,
        ProductVariantEntity::class,
        SyncStateEntity::class,
        IngredientEntity::class,
        RecipeVersionEntity::class,
        RecipeItemEntity::class,
        ToppingRecipeItemEntity::class,
        StockBalanceEntity::class,
        SaleItemConsumptionEntity::class,
        LocalStockMovementEntity::class,
        ToppingEntity::class,
        DraftOrderEntity::class,
        ActiveCartEntity::class,
        DraftCodeSequenceEntity::class,
        SaleEntity::class,
        OutboxOperationEntity::class,
        RegisterSessionEntity::class,
        vn.id.congtc145.coffeepos.data.local.entity.OnlinePaymentAttemptEntity::class
    ],
    version = 13,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun catalogDao(): CatalogDao
    abstract fun inventoryDao(): InventoryDao
    abstract fun draftOrderDao(): DraftOrderDao
    abstract fun activeCartDao(): ActiveCartDao
    abstract fun salesDao(): SalesDao
    abstract fun registerSessionDao(): RegisterSessionDao
    abstract fun onlinePaymentDao(): vn.id.congtc145.coffeepos.data.local.dao.OnlinePaymentDao

    companion object {
        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS product_categories (
                        id TEXT NOT NULL PRIMARY KEY,
                        name TEXT NOT NULL,
                        taxRateBps INTEGER NOT NULL DEFAULT 0,
                        sortOrder INTEGER NOT NULL DEFAULT 0,
                        isActive INTEGER NOT NULL DEFAULT 1
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT OR IGNORE INTO product_categories(id, name, taxRateBps, sortOrder, isActive)
                    SELECT category, category, 0, 0, 1 FROM products GROUP BY category
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE products_new (
                        id TEXT NOT NULL PRIMARY KEY,
                        code TEXT NOT NULL,
                        name TEXT NOT NULL,
                        categoryId TEXT NOT NULL,
                        basePrice INTEGER NOT NULL,
                        isAvailable INTEGER NOT NULL,
                        description TEXT NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT INTO products_new(id, code, name, categoryId, basePrice, isAvailable, description)
                    SELECT id, code, name, category, basePrice, isAvailable, description FROM products
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE products")
                db.execSQL("ALTER TABLE products_new RENAME TO products")

                db.execSQL(
                    """
                    CREATE TABLE toppings_new (
                        id TEXT NOT NULL PRIMARY KEY,
                        name TEXT NOT NULL,
                        price INTEGER NOT NULL,
                        isAvailable INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    INSERT INTO toppings_new(id, name, price, isAvailable)
                    SELECT id, name, price, isAvailable FROM toppings
                    """.trimIndent()
                )
                db.execSQL("DROP TABLE toppings")
                db.execSQL("ALTER TABLE toppings_new RENAME TO toppings")
            }
        }

        private val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE sales (
                        id TEXT NOT NULL PRIMARY KEY,
                        saleNumber TEXT NOT NULL,
                        storeId TEXT NOT NULL,
                        storeName TEXT NOT NULL,
                        cashierCode TEXT NOT NULL,
                        cashierName TEXT NOT NULL,
                        registerSessionId TEXT,
                        itemsJson TEXT NOT NULL,
                        subtotalVnd INTEGER NOT NULL,
                        taxVnd INTEGER NOT NULL,
                        totalVnd INTEGER NOT NULL,
                        paymentMethod TEXT NOT NULL,
                        cashReceivedVnd INTEGER NOT NULL,
                        changeVnd INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        completedAt INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE outbox_operations (
                        operationId TEXT NOT NULL PRIMARY KEY,
                        operationType TEXT NOT NULL,
                        payloadJson TEXT NOT NULL,
                        createdAt INTEGER NOT NULL,
                        attemptCount INTEGER NOT NULL,
                        status TEXT NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE register_sessions (
                        id TEXT NOT NULL PRIMARY KEY,
                        storeId TEXT NOT NULL,
                        deviceId TEXT NOT NULL,
                        openedByCode TEXT NOT NULL,
                        openedByName TEXT NOT NULL,
                        openingCashVnd INTEGER NOT NULL,
                        openedAt INTEGER NOT NULL,
                        expectedCashVnd INTEGER,
                        actualCashVnd INTEGER,
                        varianceVnd INTEGER,
                        closedAt INTEGER,
                        status TEXT NOT NULL
                    )
                    """.trimIndent()
                )
            }
        }

        private val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("DROP TABLE IF EXISTS attendance_records")
                db.execSQL("DROP TABLE IF EXISTS users")
            }
        }

        private val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE products ADD COLUMN allowedToppingIdsJson TEXT NOT NULL DEFAULT '[]'")
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS product_variants (
                        id TEXT NOT NULL PRIMARY KEY,
                        productId TEXT NOT NULL,
                        code TEXT NOT NULL,
                        sizeLabel TEXT NOT NULL,
                        priceVnd INTEGER NOT NULL,
                        isDefault INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS sync_state (
                        id INTEGER NOT NULL PRIMARY KEY,
                        cursor TEXT NOT NULL,
                        hasBootstrap INTEGER NOT NULL
                    )
                    """.trimIndent()
                )
            }
        }

        private val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS ingredients (id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, baseUnit TEXT NOT NULL, isActive INTEGER NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS recipe_versions (id TEXT NOT NULL PRIMARY KEY, productVariantId TEXT NOT NULL, versionNo INTEGER NOT NULL, status TEXT NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS recipe_items (recipeVersionId TEXT NOT NULL, ingredientId TEXT NOT NULL, quantity TEXT NOT NULL, PRIMARY KEY(recipeVersionId, ingredientId))")
                db.execSQL("CREATE TABLE IF NOT EXISTS topping_recipe_items (toppingId TEXT NOT NULL, ingredientId TEXT NOT NULL, quantity TEXT NOT NULL, PRIMARY KEY(toppingId, ingredientId))")
                db.execSQL("CREATE TABLE IF NOT EXISTS stock_balances (ingredientId TEXT NOT NULL PRIMARY KEY, storeId TEXT NOT NULL, quantity TEXT NOT NULL, updatedAt TEXT NOT NULL)")
            }
        }

        private val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE outbox_operations ADD COLUMN lastError TEXT")
                db.execSQL("CREATE TABLE IF NOT EXISTS sale_item_consumptions (saleItemId TEXT NOT NULL, saleId TEXT NOT NULL, recipeVersionId TEXT NOT NULL, ingredientId TEXT NOT NULL, ingredientNameSnapshot TEXT NOT NULL, unitSnapshot TEXT NOT NULL, quantityPerItem TEXT NOT NULL, quantityTotal TEXT NOT NULL, PRIMARY KEY(saleItemId, ingredientId))")
                db.execSQL("CREATE TABLE IF NOT EXISTS local_stock_movements (id TEXT NOT NULL PRIMARY KEY, saleId TEXT NOT NULL, operationId TEXT NOT NULL, ingredientId TEXT NOT NULL, quantityDelta TEXT NOT NULL, balanceAfter TEXT NOT NULL, createdAt INTEGER NOT NULL)")
            }
        }

        private val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS active_cart (id INTEGER NOT NULL PRIMARY KEY, storeId TEXT NOT NULL, deviceId TEXT NOT NULL, itemsJson TEXT NOT NULL, updatedAt INTEGER NOT NULL)")
                db.execSQL("CREATE TABLE IF NOT EXISTS draft_code_sequence (number INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL)")
            }
        }

        @Volatile
        private var INSTANCE: AppDatabase? = null

        val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS online_payment_attempts (saleId TEXT NOT NULL PRIMARY KEY, storeId TEXT NOT NULL, deviceId TEXT NOT NULL, registerSessionId TEXT NOT NULL, cashierCode TEXT NOT NULL, cashierName TEXT NOT NULL, itemsJson TEXT NOT NULL, totalVnd INTEGER NOT NULL, createdAt INTEGER NOT NULL, status TEXT NOT NULL, paymentId TEXT, qrCode TEXT, expiresAt INTEGER)")
            }
        }

        val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN openingDenominationsJson TEXT")
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN closingDenominationsJson TEXT")
            }
        }

        val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE online_payment_attempts ADD COLUMN provider TEXT NOT NULL DEFAULT 'ZALOPAY'")
            }
        }

        val MIGRATION_12_13 = object : Migration(12, 13) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN compensationCashVnd INTEGER")
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN compensationDenominationsJson TEXT")
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN compensationNote TEXT")
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN closingMode TEXT")
                db.execSQL("ALTER TABLE register_sessions ADD COLUMN handoverFromSessionId TEXT")
                db.execSQL("CREATE UNIQUE INDEX index_register_sessions_handoverFromSessionId ON register_sessions(handoverFromSessionId)")
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "coffee_pos_local.db"
                ).addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
