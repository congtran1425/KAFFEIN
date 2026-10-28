package vn.id.congtc145.coffeepos.data.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class DeviceSession(
    val deviceId: String,
    val storeId: String,
    val storeName: String,
    val credential: String
)

class DeviceCredentialStore(context: Context) {
    private val applicationContext = context.applicationContext
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    init { DeviceAccessState.initialize(context) }

    fun hasStoredEnrollment(): Boolean =
        preferences.contains(KEY_CREDENTIAL) || preferences.contains(KEY_IV) ||
            preferences.contains(KEY_DEVICE_ID) || preferences.contains(KEY_STORE_ID)

    fun load(): DeviceSession? {
        val encrypted = preferences.getString(KEY_CREDENTIAL, null) ?: return null
        val iv = preferences.getString(KEY_IV, null) ?: return null
        val deviceId = preferences.getString(KEY_DEVICE_ID, null) ?: return null
        val storeId = preferences.getString(KEY_STORE_ID, null) ?: return null
        val storeName = preferences.getString(KEY_STORE_NAME, null) ?: return null

        return runCatching {
            DeviceSession(
                deviceId = deviceId,
                storeId = storeId,
                storeName = storeName,
                credential = decrypt(encrypted, iv)
            )
        }.getOrNull()
    }

    fun save(session: DeviceSession) {
        val (encrypted, iv) = encrypt(session.credential)
        check(preferences.edit()
            .putString(KEY_DEVICE_ID, session.deviceId)
            .putString(KEY_STORE_ID, session.storeId)
            .putString(KEY_STORE_NAME, session.storeName)
            .putString(KEY_CREDENTIAL, encrypted)
            .putString(KEY_IV, iv)
            .commit()) { "Không thể lưu kích hoạt thiết bị." }
        DeviceAccessState.initialize(applicationContext)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return keyGenerator.generateKey()
    }

    private fun encrypt(value: String): Pair<String, String> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(ciphertext, Base64.NO_WRAP) to
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    }

    private fun decrypt(value: String, iv: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
        )
        return cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }

    private companion object {
        const val PREFERENCES = "device_enrollment"
        const val KEY_ALIAS = "coffee_pos_device_credential"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_STORE_ID = "store_id"
        const val KEY_STORE_NAME = "store_name"
        const val KEY_CREDENTIAL = "credential_ciphertext"
        const val KEY_IV = "credential_iv"
    }
}
