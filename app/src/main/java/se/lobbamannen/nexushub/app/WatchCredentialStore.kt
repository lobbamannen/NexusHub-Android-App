package se.lobbamannen.nexushub.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Only ciphertext is stored in preferences; the AES key stays in Android Keystore. */
class WatchCredentialStore(context: Context) {
    private val preferences = context.getSharedPreferences("nexushub_watch_credentials", Context.MODE_PRIVATE)
    private val alias = "nexushub-app-watch-key-v1"

    @Synchronized private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    @Synchronized fun get(): String {
        val encrypted = preferences.getString("encrypted", null) ?: return ""
        val iv = preferences.getString("iv", null) ?: return ""
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (_: Exception) { "" }
    }

    @Synchronized fun set(value: String): Boolean = try {
        val token = value.trim()
        if (token.isEmpty()) preferences.edit().clear().commit()
        else {
            require(token.length in 8..512 && token.none { it.isWhitespace() || it.isISOControl() })
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
            preferences.edit().putString("encrypted", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).commit()
        }
    } catch (_: Exception) { false }
}
