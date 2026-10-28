package vn.id.congtc145.coffeepos

import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import vn.id.congtc145.coffeepos.data.local.AppDatabase

class RegisterMigrationTest {
    @Test fun version12DataSurvivesAndHistoricalClosuresAreNotInventedAsCompensated() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val helper = FrameworkSQLiteOpenHelperFactory().create(SupportSQLiteOpenHelper.Configuration.builder(context)
            .name(null).callback(object : SupportSQLiteOpenHelper.Callback(12) {
                override fun onCreate(db: SupportSQLiteDatabase) {
                    db.execSQL("CREATE TABLE register_sessions (id TEXT PRIMARY KEY, openingCashVnd INTEGER NOT NULL, actualCashVnd INTEGER)")
                    db.execSQL("INSERT INTO register_sessions VALUES ('legacy',60000,25000)")
                    db.execSQL("CREATE TABLE outbox_operations (operationId TEXT PRIMARY KEY)")
                    db.execSQL("INSERT INTO outbox_operations VALUES ('preserved-outbox')")
                }
                override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
            }).build())
        try {
            val db = helper.writableDatabase
            AppDatabase.MIGRATION_12_13.migrate(db)
            db.query("SELECT openingCashVnd,actualCashVnd,compensationCashVnd,compensationDenominationsJson,closingMode,handoverFromSessionId FROM register_sessions WHERE id='legacy'").use {
                assertTrue(it.moveToFirst()); assertEquals(60000L,it.getLong(0)); assertEquals(25000L,it.getLong(1))
                (2..5).forEach { column -> assertTrue(it.isNull(column)) }
            }
            db.query("SELECT operationId FROM outbox_operations").use { assertTrue(it.moveToFirst()); assertEquals("preserved-outbox",it.getString(0)) }
            db.query("PRAGMA index_list(register_sessions)").use { cursor ->
                var found = false
                while (cursor.moveToNext()) if (cursor.getString(1) == "index_register_sessions_handoverFromSessionId") { found = true; assertEquals(1,cursor.getInt(2)) }
                assertTrue(found)
            }
        } finally { helper.close() }
    }
}
