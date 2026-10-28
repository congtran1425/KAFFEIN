package vn.id.congtc145.coffeepos

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.compose.ui.window.DialogWindowProvider
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import vn.id.congtc145.coffeepos.receiver.PosDeviceAdminReceiver
import vn.id.congtc145.coffeepos.data.sync.SyncOutboxScheduler
import vn.id.congtc145.coffeepos.data.sync.DeviceHeartbeatCoordinator
import vn.id.congtc145.coffeepos.ui.login.CashierLockViewModel
import vn.id.congtc145.coffeepos.ui.navigation.PosDestinations
import vn.id.congtc145.coffeepos.ui.navigation.PosNavGraph
import vn.id.congtc145.coffeepos.ui.theme.CoffeePOSTheme

class MainActivity : ComponentActivity() {

    private var navControllerRef: NavHostController? = null
    private val cashierLockViewModel: CashierLockViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!DesignPreviewMode.isActive(this)) {
            SyncOutboxScheduler.schedulePeriodic(this)
            SyncOutboxScheduler.enqueueNow(this)
            val heartbeat = DeviceHeartbeatCoordinator(applicationContext)
            lifecycleScope.launch {
                repeatOnLifecycle(Lifecycle.State.STARTED) {
                    cashierLockViewModel.checkTimeout()
                    heartbeat.runForeground()
                }
            }
        }

        // 1. Giữ màn hình máy POS luôn luôn sáng
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // 2. Ẩn triệt để System Bars
        hideSystemBars()
        window.decorView.viewTreeObserver.addOnWindowFocusChangeListener { _ ->
            applyImmersiveToAllWindows()
        }
        window.decorView.viewTreeObserver.addOnGlobalLayoutListener {
            applyImmersiveToAllWindows()
        }

        // 3. Tự động kích hoạt Kiosk Lock Task nếu được cấp quyền Device Owner
        setupDeviceOwnerKiosk()

        // 4. CHẶN THOÁT APP: Khi bấm phím Back hoặc ESC trên bàn phím
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isProtectedByCashierLock()) return
                // Nếu đang ở màn hình con (Menu, Điểm danh, Thanh toán), quay về màn hình Bán hàng (ORDER)
                val controller = navControllerRef
                if (controller != null && controller.previousBackStackEntry != null) {
                    controller.popBackStack()
                } else {
                    // Đang ở màn hình chính ORDER: TUYỆT ĐỐI KHÔNG LÀM GÌ, KHÔNG THOÁT APP!
                }
            }
        })

        setContent {
            CoffeePOSTheme {
                Surface(modifier = Modifier.fillMaxSize().onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown) cashierLockViewModel.recordActivity()
                    isProtectedByCashierLock()
                }) {
                    val navController = rememberNavController()
                    navControllerRef = navController
                    PosNavGraph(navController = navController, cashierLockViewModel = cashierLockViewModel)
                }
            }
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        cashierLockViewModel.recordActivity()
        if (isProtectedByCashierLock()) return true
        return super.dispatchTouchEvent(event)
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        cashierLockViewModel.recordActivity()
    }

    private fun isProtectedByCashierLock(): Boolean =
        !DesignPreviewMode.isActive(this) && cashierLockViewModel.state.value.isLocked

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        applyImmersiveToAllWindows()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        cashierLockViewModel.recordActivity()
        if (isProtectedByCashierLock()) return true
        // Chặn phím ESC từ bàn phím máy tính và phím BACK cứng
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            val controller = navControllerRef
            if (controller != null && controller.previousBackStackEntry != null) {
                controller.popBackStack()
            }
            return true // Đã tiêu thụ sự kiện, không để hệ điều hành thoát app!
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())

        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
    }

    private fun setupDeviceOwnerKiosk() {
        // Android Studio phải có thể dừng/cài lại bản debug trên emulator.
        if (BuildConfig.DEBUG) return
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, PosDeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
                startLockTask()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun enableKioskMode() {
        if (BuildConfig.DEBUG) return
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, PosDeviceAdminReceiver::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
            }
            startLockTask()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun disableKioskMode() {
        try {
            stopLockTask()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun applyImmersiveToAllWindows() {
        hideSystemBars()
        try {
            val wmgClass = Class.forName("android.view.WindowManagerGlobal")
            val wmg = wmgClass.getMethod("getInstance").invoke(null)
            val mViewsField = wmgClass.getDeclaredField("mViews")
            mViewsField.isAccessible = true
            @Suppress("UNCHECKED_CAST")
            val views = mViewsField.get(wmg) as? List<View> ?: return

            for (view in views) {
                if (view === window.decorView) continue
                applyImmersiveToSubWindow(view)
            }
        } catch (_: Throwable) {
        }
    }

    private fun applyImmersiveToSubWindow(view: View) {
        @Suppress("DEPRECATION")
        view.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )

        val lp = view.layoutParams
        if (lp is WindowManager.LayoutParams) {
            if ((lp.flags and WindowManager.LayoutParams.FLAG_FULLSCREEN) == 0) {
                lp.flags = lp.flags or WindowManager.LayoutParams.FLAG_FULLSCREEN
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            view.windowInsetsController?.let { controller ->
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsets.Type.systemBars())
            }
        }

        findDialogWindowFromViewTree(view)?.let { win ->
            if (win !== window) {
                if ((win.attributes.flags and WindowManager.LayoutParams.FLAG_FULLSCREEN) == 0) {
                    win.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
                }
                WindowCompat.setDecorFitsSystemWindows(win, false)
                val controller = WindowCompat.getInsetsController(win, win.decorView)
                controller.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                controller.hide(WindowInsetsCompat.Type.systemBars())

                @Suppress("DEPRECATION")
                win.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )

                win.decorView.setOnSystemUiVisibilityChangeListener { visibility ->
                    if ((visibility and View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
                        applyImmersiveToSubWindow(win.decorView)
                    }
                }
            }
        }
    }

    private fun findDialogWindowFromViewTree(view: View): Window? {
        if (view is DialogWindowProvider) return view.window
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val win = findDialogWindowFromViewTree(view.getChildAt(i))
                if (win != null) return win
            }
        }
        return null
    }
}
