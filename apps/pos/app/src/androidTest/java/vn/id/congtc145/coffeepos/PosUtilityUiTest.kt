package vn.id.congtc145.coffeepos

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import vn.id.congtc145.coffeepos.ui.inventory.InventoryScreen
import vn.id.congtc145.coffeepos.ui.menu.FunctionsMenuScreen
import vn.id.congtc145.coffeepos.ui.sync.SyncOutboxScreen
import vn.id.congtc145.coffeepos.ui.theme.CoffeePOSTheme
import java.io.File

class PosUtilityUiTest {
    @get:Rule val compose = createComposeRule()

    @Test fun menuEnablesInventoryAndOutboxDestinations() {
        var destination = ""
        compose.setContent {
            CoffeePOSTheme {
                FunctionsMenuScreen({}, {}, {}, {}, { destination = "sync" }, { destination = "inventory" })
            }
        }
        compose.onNodeWithText("Đồng bộ hóa dữ liệu").performClick()
        compose.runOnIdle { assertEquals("sync", destination) }
        compose.onNodeWithText("Kiểm tra tồn kho").performClick()
        compose.runOnIdle { assertEquals("inventory", destination) }
    }

    @Test fun emptyOutboxScreenHasExplicitSyncAction() {
        compose.setContent { CoffeePOSTheme { SyncOutboxScreen(onBack = {}) } }
        compose.onNodeWithText("Đồng bộ dữ liệu").assertIsDisplayed()
        compose.onNodeWithText("Đồng bộ ngay").assertIsEnabled()
        saveScreenshot("outbox")
    }

    @Test fun inventoryScreenHasSearchAndSyncNavigation() {
        compose.setContent { CoffeePOSTheme { InventoryScreen({}, {}) } }
        compose.onNodeWithText("Tồn kho nguyên liệu").assertIsDisplayed()
        compose.onNodeWithText("Tìm tên hoặc mã nguyên liệu").assertIsDisplayed()
        compose.onNodeWithText("Xem đồng bộ").assertIsEnabled()
        saveScreenshot("inventory")
    }

    private fun saveScreenshot(name: String) {
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "verification-screenshots")
        directory.mkdirs()
        File(directory, "$name.png").outputStream().use { output ->
            val root = compose.onNode(isRoot())
            root.captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, output)
        }
    }
}
