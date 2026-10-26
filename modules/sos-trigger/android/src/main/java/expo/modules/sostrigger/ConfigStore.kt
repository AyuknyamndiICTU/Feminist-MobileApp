package expo.modules.sostrigger

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Native copy of the SOS settings (contacts, message, voiceprint) and the alert outbox, sealed with
 * an AES-256-GCM key that never leaves the Android Keystore. The service reads it without JavaScript.
 */
object ConfigStore {
  private const val PREFS = "calc_bg"
  private const val KEY_ALIAS = "calc_bg_key"
  private const val CONFIG = "c"
  private const val ARMED = "a"
  private const val OUTBOX = "o"
  private const val MAX_OUTBOX = 20

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return gen.generateKey()
  }

  private fun seal(plain: String): String {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val out = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(out, Base64.NO_WRAP)
  }

  private fun open(sealed: String): String? = try {
    val bytes = Base64.decode(sealed, Base64.NO_WRAP)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
    String(cipher.doFinal(bytes, 12, bytes.size - 12), Charsets.UTF_8)
  } catch (e: Exception) {
    null
  }

  @Synchronized
  fun saveConfig(ctx: Context, json: String) {
    prefs(ctx).edit().putString(CONFIG, seal(json)).commit()
  }

  @Synchronized
  fun loadConfig(ctx: Context): SosConfig? {
    val sealed = prefs(ctx).getString(CONFIG, null) ?: return null
    val json = open(sealed) ?: return null
    return try {
      SosConfig.parse(json)
    } catch (e: Exception) {
      null
    }
  }

  fun setArmed(ctx: Context, armed: Boolean) {
    prefs(ctx).edit().putBoolean(ARMED, armed).commit()
  }

  fun isArmed(ctx: Context): Boolean = prefs(ctx).getBoolean(ARMED, false)

  @Synchronized
  fun appendAlert(ctx: Context, alert: JSONObject) {
    val list = readOutbox(ctx)
    list.put(alert)
    while (list.length() > MAX_OUTBOX) list.remove(0)
    prefs(ctx).edit().putString(OUTBOX, seal(list.toString())).commit()
  }

  /** Hands the queued alerts to the app (which delivers them to the national platform) and forgets them. */
  @Synchronized
  fun takeAlerts(ctx: Context): String {
    val list = readOutbox(ctx)
    prefs(ctx).edit().remove(OUTBOX).commit()
    return list.toString()
  }

  private fun readOutbox(ctx: Context): JSONArray {
    val sealed = prefs(ctx).getString(OUTBOX, null) ?: return JSONArray()
    return open(sealed)?.let { runCatching { JSONArray(it) }.getOrNull() } ?: JSONArray()
  }

  /** Crypto-erase, consistent with the app's "delete all data" action. */
  @Synchronized
  fun clear(ctx: Context) {
    prefs(ctx).edit().clear().commit()
    runCatching {
      KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(KEY_ALIAS)
    }
  }
}
