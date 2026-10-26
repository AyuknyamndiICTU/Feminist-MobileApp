package expo.modules.sostrigger

import android.Manifest
import android.content.Context
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

/** Call-state updates (TelephonyManager.CALL_STATE_*) on the main thread, on every API level. */
class CallStateWatcher(private val ctx: Context, private val onState: (Int) -> Unit) {
  private val telephony = ctx.getSystemService(TelephonyManager::class.java)
  private var callback: Any? = null

  /** Returns false if call state cannot be observed (no permission or no telephony). */
  fun start(): Boolean {
    val tm = telephony ?: return false
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (!ctx.granted(Manifest.permission.READ_PHONE_STATE)) return false
        val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
          override fun onCallStateChanged(state: Int) = onState(state)
        }
        tm.registerTelephonyCallback(ContextCompat.getMainExecutor(ctx), cb)
        callback = cb
      } else {
        @Suppress("DEPRECATION")
        val l = object : PhoneStateListener() {
          @Deprecated("Deprecated in Java")
          override fun onCallStateChanged(state: Int, phoneNumber: String?) = onState(state)
        }
        @Suppress("DEPRECATION")
        tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
        callback = l
      }
      true
    } catch (e: Exception) {
      false
    }
  }

  fun stop() {
    val tm = telephony ?: return
    val cb = callback ?: return
    callback = null
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && cb is TelephonyCallback) {
        tm.unregisterTelephonyCallback(cb)
      } else if (cb is PhoneStateListener) {
        @Suppress("DEPRECATION")
        tm.listen(cb, PhoneStateListener.LISTEN_NONE)
      }
    }
  }
}
