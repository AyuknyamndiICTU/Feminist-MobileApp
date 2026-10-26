package expo.modules.sostrigger

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Bridges native events to JavaScript when the app is running; a no-op otherwise. */
object SosBus {
  @Volatile
  var listener: ((Map<String, Any?>) -> Unit)? = null

  fun emit(type: String, extra: Map<String, Any?> = emptyMap()) {
    runCatching { listener?.invoke(mapOf("type" to type) + extra) }
  }
}

/** Discreet haptic feedback: the victim can feel the phone's state without looking at it. */
object Haptics {
  val TRIGGERED = longArrayOf(0, 180)
  val CANCELLED = longArrayOf(0, 60, 120, 60)
  val TEST = longArrayOf(0, 250, 150, 250, 150, 250)

  fun play(ctx: Context, pattern: LongArray) {
    runCatching {
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(pattern, -1)
      }
    }
  }
}
