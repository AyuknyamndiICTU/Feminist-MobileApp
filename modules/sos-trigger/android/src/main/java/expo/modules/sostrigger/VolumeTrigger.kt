package expo.modules.sostrigger

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.content.ContextCompat

/**
 * Detects "volume-DOWN × N" (trigger) and "volume-UP × N" (cancel) while the app is closed.
 *
 * Primary path: an active MediaSession with a remote VolumeProvider receives volume keys even with
 * the screen off on devices that route keys to it. Each press is forwarded to the real stream
 * so the phone's volume keeps working normally.
 * Fallback: the system volume-changed broadcast, for screen-on presses on devices that keep volume
 * keys for themselves. It cannot see presses once the volume is already at its minimum.
 * Behaviour varies by manufacturer, hence the in-app test mode.
 */
class VolumeTrigger(
  private val ctx: Context,
  pressCount: Int,
  windowMs: Long,
  private val onPattern: (direction: Int) -> Unit,
) {
  private val audio = ctx.getSystemService(AudioManager::class.java)
  private val power = ctx.getSystemService(PowerManager::class.java)
  private val down = PressPatternDetector(pressCount, windowMs)
  private val up = PressPatternDetector(pressCount, windowMs)
  private val fallbackDown = PressPatternDetector(pressCount, windowMs)
  private val fallbackUp = PressPatternDetector(pressCount, windowMs)
  private var session: MediaSession? = null
  private var receiver: BroadcastReceiver? = null
  private var lastSessionEventAt = 0L

  fun start() {
    val main = Handler(Looper.getMainLooper())
    val s = MediaSession(ctx, "calc")
    // VolumeProvider callbacks are delivered through the session's callback handler: without one
    // the session would swallow volume keys and never report them.
    s.setCallback(object : MediaSession.Callback() {}, main)
    s.setPlaybackToRemote(object : VolumeProvider(VOLUME_CONTROL_RELATIVE, 100, 50) {
      override fun onAdjustVolume(direction: Int) = onSessionKey(direction)
    })
    s.setPlaybackState(
      PlaybackState.Builder().setState(PlaybackState.STATE_PLAYING, 0L, 0f).setActions(0L).build(),
    )
    s.isActive = true
    session = s

    val r = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = onVolumeChanged(intent)
    }
    ContextCompat.registerReceiver(ctx, r, IntentFilter(VOLUME_CHANGED), ContextCompat.RECEIVER_EXPORTED)
    receiver = r
  }

  fun stop() {
    receiver?.let { runCatching { ctx.unregisterReceiver(it) } }
    receiver = null
    session?.run {
      isActive = false
      release()
    }
    session = null
  }

  private fun onSessionKey(direction: Int) {
    val now = SystemClock.elapsedRealtime()
    lastSessionEventAt = now
    when {
      direction < 0 -> {
        forward(AudioManager.ADJUST_LOWER)
        if (down.onDown(now)) onPattern(-1)
      }
      direction > 0 -> {
        forward(AudioManager.ADJUST_RAISE)
        if (up.onDown(now)) onPattern(1)
      }
      else -> {
        down.onUp()
        up.onUp()
      }
    }
  }

  /**
   * Keeps the volume keys working: in a call they change the call volume (also with the screen off
   * against the ear), otherwise the media volume while the screen is on. adjustStreamVolume goes
   * straight to AudioService; the "suggested stream" APIs would route back into this session.
   */
  private fun forward(direction: Int) {
    val am = audio ?: return
    val inCall = am.mode == AudioManager.MODE_IN_CALL || am.mode == AudioManager.MODE_IN_COMMUNICATION
    if (!inCall && power?.isInteractive != true) return
    val stream = if (inCall) AudioManager.STREAM_VOICE_CALL else AudioManager.STREAM_MUSIC
    runCatching { am.adjustStreamVolume(stream, direction, AudioManager.FLAG_SHOW_UI) }
  }

  private fun onVolumeChanged(intent: Intent) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastSessionEventAt < SESSION_ECHO_MS) return
    val value = intent.getIntExtra(EXTRA_VALUE, -1)
    val prev = intent.getIntExtra(EXTRA_PREV_VALUE, -1)
    if (value < 0 || prev < 0 || value == prev) return
    if (value < prev) {
      if (fallbackDown.onDown(now)) onPattern(-1)
    } else if (fallbackUp.onDown(now)) {
      onPattern(1)
    }
  }

  private companion object {
    const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
    const val EXTRA_VALUE = "android.media.EXTRA_VOLUME_STREAM_VALUE"
    const val EXTRA_PREV_VALUE = "android.media.EXTRA_PREV_VOLUME_STREAM_VALUE"
    /** Our own forwarded adjustment also fires the broadcast; ignore it. */
    const val SESSION_ECHO_MS = 600L
  }
}
