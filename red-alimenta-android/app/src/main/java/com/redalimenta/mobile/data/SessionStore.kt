package com.redalimenta.mobile.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object SessionStore {
    private const val PREFERENCES_NAME = "red_alimenta_session"
    private const val TOKEN_KEY = "encrypted_access_token"
    private const val ANDROID_KEY_STORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "red_alimenta_session_key"
    private const val GCM_TAG_LENGTH_BITS = 128

    @Volatile
    private var applicationContext: Context? = null

    fun initialize(context: Context) {
        applicationContext = context.applicationContext
    }

    @Synchronized
    fun saveToken(token: String) {
        require(token.isNotBlank()) { "Access token cannot be blank" }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        val storedValue = listOf(
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            Base64.encodeToString(encrypted, Base64.NO_WRAP),
        ).joinToString(":")
        val saved = preferences().edit().putString(TOKEN_KEY, storedValue).commit()
        check(saved) { "Unable to securely persist the session token" }
    }

    @Synchronized
    fun getToken(): String? {
        val storedValue = preferences().getString(TOKEN_KEY, null) ?: return null
        return try {
            val parts = storedValue.split(":")
            require(parts.size == 2) { "Encrypted session data is malformed" }
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateSecretKey(),
                GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv),
            )
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (error: Exception) {
            preferences().edit().remove(TOKEN_KEY).commit()
            throw IllegalStateException("The saved session could not be decrypted", error)
        }
    }

    @Synchronized
    fun clearToken() {
        val cleared = preferences().edit().remove(TOKEN_KEY).commit()
        check(cleared) { "Unable to clear the saved session token" }
    }

    private fun preferences() =
        requireNotNull(applicationContext) { "SessionStore has not been initialized" }
            .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        val existingKey = keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existingKey != null) return existingKey

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }
}
