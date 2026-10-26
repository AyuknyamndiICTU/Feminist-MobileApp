package expo.modules.sostrigger

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat

/**
 * Calls each number in turn (emergency contacts, then the 1166 hotline). The next call starts when
 * the previous one ends; Android cannot tell whether a call was answered. If call state cannot be
 * observed, only the first number is called so calls never overlap. Official emergency numbers
 * cannot be auto-dialled by apps (the system shows the dialer instead), so a watchdog moves on.
 */
class CallChain(private val ctx: Context, private val numbers: List<String>, private val onDone: () -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private val telephony = ctx.getSystemService(TelephonyManager::class.java)
  private var index = 0
  private var offhook = false
  private var stopped = false
  private var listening = false
  private var callback: Any? = null
  private val watchdog = Runnable { next() }

  fun start() {
    listening = listen()
    next()
  }

  fun cancel() {
    if (stopped) return
    stopped = true
    unlisten()
    main.removeCallbacksAndMessages(null)
  }

  private fun next() {
    main.removeCallbacks(watchdog)
    if (stopped) return
    if (index >= numbers.size || (!listening && index > 0)) return finish()
    val number = numbers[index++]
    offhook = false
    if (!place(number)) {
      main.postDelayed({ next() }, 500)
      return
    }
    if (listening) main.postDelayed(watchdog, NO_CALL_TIMEOUT_MS) else main.postDelayed({ finish() }, 1000)
  }

  private fun onState(state: Int) {
    if (stopped) return
    when (state) {
      TelephonyManager.CALL_STATE_OFFHOOK -> {
        offhook = true
        main.removeCallbacks(watchdog)
      }
      TelephonyManager.CALL_STATE_IDLE -> if (offhook) {
        offhook = false
        main.postDelayed({ next() }, BETWEEN_CALLS_MS)
      }
    }
  }

  @SuppressLint("MissingPermission")
  private fun place(number: String): Boolean {
    if (!ctx.granted(Manifest.permission.CALL_PHONE)) return false
    return try {
      val telecom = ctx.getSystemService(TelecomManager::class.java) ?: return false
      val extras = Bundle()
      if (ctx.granted(Manifest.permission.READ_PHONE_STATE)) {
        val account = telecom.getDefaultOutgoingPhoneAccount("tel") ?: telecom.callCapablePhoneAccounts.firstOrNull()
        if (account != null) extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, account)
      }
      telecom.placeCall(Uri.fromParts("tel", number, null), extras)
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun listen(): Boolean {
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

  private fun unlisten() {
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

  private fun finish() {
    if (stopped) return
    cancel()
    onDone()
  }

  private companion object {
    const val NO_CALL_TIMEOUT_MS = 25_000L
    const val BETWEEN_CALLS_MS = 2_000L
  }
}
