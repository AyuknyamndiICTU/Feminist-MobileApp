package expo.modules.sostrigger

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Keeps the hands-free triggers alive while the app is closed. The persistent notification is
 * minimal and uses the disguise name; on Android 13+ it stays hidden unless notifications are
 * allowed. Microphone and location types are only requested when permitted; when Android refuses
 * them (e.g. after a reboot on Android 14+) the service falls back to the volume trigger alone.
 */
class SosService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private var volume: VolumeTrigger? = null
  private var volumeKey: String? = null
  private var voice: VoiceListener? = null
  private var engine: VoiceEngine? = null
  private var voiceKey: String? = null
  private var voiceGen = 0
  private var voiceLock: PowerManager.WakeLock? = null
  @Volatile
  private var config: SosConfig? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val cfg = ConfigStore.loadConfig(this)
    if (cfg == null || !ConfigStore.isArmed(this)) {
      // A started foreground service must call startForeground before it may stop.
      runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(null), baseType()) }
      stopSelf()
      return START_NOT_STICKY
    }
    config = cfg
    val micType = goForeground(cfg)
    running = true
    applyVolume(cfg)
    applyVoice(cfg, micType)
    SosBus.emit("armed", mapOf("voice" to (voice != null), "volume" to cfg.volumeTrigger))
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    volume?.stop()
    volume = null
    stopVoice()
    config = null
    SosBus.emit("disarmed")
    super.onDestroy()
  }

  private fun baseType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0

  /** Returns true if the microphone type was granted to this foreground service. */
  private fun goForeground(cfg: SosConfig): Boolean {
    var types = baseType()
    val wantMic = cfg.voice != null && granted(Manifest.permission.RECORD_AUDIO) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    val wantLocation = cfg.locationEnabled &&
      (granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION)) &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    if (wantMic) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    if (wantLocation) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    val note = notification(cfg)
    for (attempt in listOf(types, baseType())) {
      try {
        ServiceCompat.startForeground(this, NOTIFICATION_ID, note, attempt)
        return wantMic && attempt == types
      } catch (e: Exception) {
        // Try again with fewer capabilities.
      }
    }
    return false
  }

  private fun applyVolume(cfg: SosConfig) {
    val key = "${cfg.pressCount}/${cfg.pressWindowMs}"
    if (volume != null && key == volumeKey) return
    volume?.stop()
    // Always on while armed: volume-UP × N is also the cancel gesture for the voice trigger.
    volume = VolumeTrigger(this, cfg.pressCount, cfg.pressWindowMs, ::onVolumePattern).also { it.start() }
    volumeKey = key
  }

  private fun onVolumePattern(direction: Int) {
    val cfg = config ?: return
    if (direction < 0) {
      if (cfg.volumeTrigger || SosDispatcher.isTestMode()) SosDispatcher.trigger(this, "volume")
    } else {
      SosDispatcher.cancel(this)
    }
  }

  private fun applyVoice(cfg: SosConfig, micAllowed: Boolean) {
    val v = cfg.voice
    val ready = v != null && micAllowed &&
      ModelManager.isReady(this, v.model) && ModelManager.isReady(this, v.speakerModel)
    if (!ready) {
      stopVoice()
      if (v != null) SosBus.emit("error", mapOf("detail" to if (micAllowed) "voice_models" else "mic_not_allowed"))
      return
    }
    val key = "${v!!.model}/${v.speakerModel}"
    // Same models already listening or still loading: the listener reads the latest config itself.
    if (key == voiceKey) return
    stopVoice()
    voiceKey = key
    val gen = ++voiceGen
    acquireVoiceLock()
    Thread({
      val loaded = try {
        VoiceEngine(ModelManager.dir(this, v.model), ModelManager.dir(this, v.speakerModel))
      } catch (e: Throwable) {
        null
      }
      main.post {
        if (gen != voiceGen || !running) {
          loaded?.close()
          return@post
        }
        if (loaded == null) {
          stopVoice()
          SosBus.emit("error", mapOf("detail" to "voice_load"))
          return@post
        }
        engine = loaded
        voice = VoiceListener(loaded, ::onUtterance) { err ->
          main.post {
            if (gen == voiceGen) stopVoice()
            SosBus.emit("error", mapOf("detail" to err))
          }
        }.also { it.start() }
      }
    }, "calc-load").start()
  }

  private fun onUtterance(u: Utterance) {
    if (!running) return
    val v = config?.voice ?: return
    val d = VoiceMatch.decide(u.text, u.vector, u.frames, v)
    if (SosDispatcher.isTestMode() && d.phrase) {
      SosBus.emit("voice", mapOf("score" to d.score, "accepted" to d.accepted))
    }
    if (d.accepted) main.post { if (running) SosDispatcher.trigger(this, "voice") }
  }

  /** Also invalidates any model load still in progress (its result is closed when it arrives). */
  private fun stopVoice() {
    voiceGen++
    voice?.stop()
    voice = null
    engine?.close()
    engine = null
    voiceKey = null
    runCatching { voiceLock?.takeIf { it.isHeld }?.release() }
    voiceLock = null
  }

  /** Continuous capture must keep running when the screen is off. */
  private fun acquireVoiceLock() {
    if (voiceLock?.isHeld == true) return
    voiceLock = getSystemService(PowerManager::class.java)
      ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "calc:audio")
      ?.apply {
        setReferenceCounted(false)
        acquire()
      }
  }

  private fun notification(cfg: SosConfig?): Notification {
    val title = cfg?.notificationTitle ?: applicationInfo.loadLabel(packageManager).toString()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, title, NotificationManager.IMPORTANCE_MIN).apply {
        setShowBadge(false)
        setSound(null, null)
        enableVibration(false)
      }
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(cfg?.notificationText ?: "")
      .setContentIntent(launch)
      .setOngoing(true)
      .setSilent(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "calc_bg"
    private const val NOTIFICATION_ID = 7301

    @Volatile
    var running = false
      private set

    fun start(ctx: Context) {
      ContextCompat.startForegroundService(ctx, Intent(ctx, SosService::class.java))
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, SosService::class.java))
    }
  }
}
