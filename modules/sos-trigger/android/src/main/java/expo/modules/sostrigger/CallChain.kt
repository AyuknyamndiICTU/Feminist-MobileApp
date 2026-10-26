package expo.modules.sostrigger

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.TelecomManager
import android.telephony.TelephonyManager

/**
 * Calls each number in turn (emergency contacts, then the 1166 hotline). The next call starts a
 * few seconds after the previous one ends; Android cannot tell whether a call was answered. During
 * a call the phone app owns the volume keys, so the gap is what lets the user stop the chain with
 * volume-UP × 3 right after hanging up. If call state cannot be observed, only the first number is
 * called so calls never overlap. Official emergency numbers cannot be auto-dialled by apps (the
 * system shows the dialer instead), so a watchdog moves on.
 */
class CallChain(private val ctx: Context, private val numbers: List<String>, private val onDone: () -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private val watcher = CallStateWatcher(ctx, ::onState)
  private var index = 0
  private var offhook = false
  private var stopped = false
  private var listening = false
  private val watchdog = Runnable { next() }

  fun start() {
    listening = watcher.start()
    next()
  }

  fun cancel() {
    if (stopped) return
    stopped = true
    watcher.stop()
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

  private fun finish() {
    if (stopped) return
    cancel()
    onDone()
  }

  private companion object {
    const val NO_CALL_TIMEOUT_MS = 25_000L
    const val BETWEEN_CALLS_MS = 6_000L
  }
}
