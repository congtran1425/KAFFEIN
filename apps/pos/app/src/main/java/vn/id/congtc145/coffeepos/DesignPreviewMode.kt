package vn.id.congtc145.coffeepos

import android.content.Context
import vn.id.congtc145.coffeepos.data.security.DeviceCredentialStore

/** Explicit, debug-only UI design switch. Missing enrollment must not turn on mock data. */
object DesignPreviewMode {
    fun isActive(context: Context): Boolean {
        if (!BuildConfig.DEBUG || !BuildConfig.ENABLE_DESIGN_PREVIEW) return false
        val credentials = DeviceCredentialStore(context)
        return !credentials.hasStoredEnrollment() && credentials.load() == null
    }
}
