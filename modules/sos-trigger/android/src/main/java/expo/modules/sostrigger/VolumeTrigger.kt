package expo.modules.sostrigger

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.media.AudioTrack
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
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
  private val main = Handler(Looper.getMainLooper())
  private val calls = CallStateWatcher(ctx) { scheduleReclaim() }
  private var playbackCallback: AudioManager.AudioPlaybackCallback? = null
  private var telephonyAudioSeen = false
  private var reclaimAttempts = 0
  private val reclaimTask = Runnable { reclaim() }

  fun start() {
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
    calls.start()
    watchPlayback()
    scheduleReclaim(500)
  }

  fun stop() {
    main.removeCallbacks(reclaimTask)
    calls.stop()
    playbackCallback?.let { cb -> runCatching { audio?.unregisterAudioPlaybackCallback(cb) } }
    playbackCallback = null
    receiver?.let { runCatching { ctx.unregisterReceiver(it) } }
    receiver = null
    session?.run {
      isActive = false
      release()
    }
    session = null
  }

  /**
   * With the screen off and during calls, Android dispatches volume keys as the system and, on
   * recent versions, bypasses media sessions when the system itself played audio last. Telecom's
   * call and ring tones do exactly that, so after any call the gesture (and the cancel) would
   * silently stop working. Whenever such audio ends and nothing else is playing, a 0.3 s silent
   * clip makes this app the last player again. Side effect: a music app paused before a call may
   * need reopening before headset buttons resume it.
   */
  private fun watchPlayback() {
    val am = audio ?: return
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val cb = object : AudioManager.AudioPlaybackCallback() {
      override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) {
        if (configs.any { it.audioAttributes.usage in TELEPHONY_USAGES }) telephonyAudioSeen = true
        if (configs.isEmpty() && telephonyAudioSeen) {
          telephonyAudioSeen = false
          scheduleReclaim(300)
        }
      }
    }
    runCatching { am.registerAudioPlaybackCallback(cb, main) }.onSuccess { playbackCallback = cb }
  }

  private fun scheduleReclaim(delayMs: Long = 2500) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    reclaimAttempts = 0
    main.removeCallbacks(reclaimTask)
    main.postDelayed(reclaimTask, delayMs)
  }

  private fun reclaim() {
    val am = audio ?: return
    if (session == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (am.activePlaybackConfigurations.isNotEmpty()) {
      if (++reclaimAttempts < 10) main.postDelayed(reclaimTask, 2000)
      return
    }
    runCatching {
      val rate = 16000
      val samples = rate * 3 / 10
      val track = AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build(),
        )
        .setBufferSizeInBytes(samples * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()
      track.write(ShortArray(samples), 0, samples)
      track.play()
      main.postDelayed({
        runCatching { track.stop() }
        track.release()
      }, 700)
    }
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
    val TELEPHONY_USAGES = setOf(
      AudioAttributes.USAGE_VOICE_COMMUNICATION,
      AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING,
      AudioAttributes.USAGE_NOTIFICATION_RINGTONE,
    )
    const val VOLUME_CHANGED = "android.media.VOLUME_CHANGED_ACTION"
    const val EXTRA_VALUE = "android.media.EXTRA_VOLUME_STREAM_VALUE"
    const val EXTRA_PREV_VALUE = "android.media.EXTRA_PREV_VOLUME_STREAM_VALUE"
    /** Our own forwarded adjustment also fires the broadcast; ignore it. */
    const val SESSION_ECHO_MS = 600L
  }
}
