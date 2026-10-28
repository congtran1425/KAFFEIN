package vn.id.congtc145.coffeepos.receiver

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class PosDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
    }
}
