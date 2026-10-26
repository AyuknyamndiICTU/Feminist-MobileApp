package expo.modules.sostrigger

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * One SOS at a time: trigger → silent cancel window (location is fetched meanwhile) → SMS to every
 * contact and the national gateway → alert queued for the national platform → call chain.
 * Volume-UP pressed three times cancels before sending, or stops the remaining calls afterwards.
 * All methods must run on the main thread.
 */
object SosDispatcher {
  private val main = Handler(Looper.getMainLooper())
  private var generation = 0
  private var inProgress = false
  private var sendTask: Runnable? = null
  private var locator: LocationFetcher? = null
  private var chain: CallChain? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var testUntil = 0L
  private val testEvents = ArrayList<Map<String, Any?>>()

  fun setTestMode(ctx: Context, enabled: Boolean) {
    val duration = ConfigStore.loadConfig(ctx)?.testModeMs ?: 120_000L
    testUntil = if (enabled) SystemClock.elapsedRealtime() + duration else 0L
    if (enabled) synchronized(testEvents) { testEvents.clear() }
    SosBus.emit("testMode", mapOf("enabled" to enabled, "durationMs" to if (enabled) duration else 0L))
  }

  fun isTestMode() = SystemClock.elapsedRealtime() < testUntil

  /**
   * Test detections are kept here because locking the screen also locks the app: the results must
   * still be there when the user comes back to the SOS screen.
   */
  fun recordTest(type: String, extra: Map<String, Any?>) {
    val event = mapOf("type" to type, "at" to System.currentTimeMillis()) + extra
    synchronized(testEvents) {
      testEvents.add(event)
      while (testEvents.size > 20) testEvents.removeAt(0)
    }
    SosBus.emit(type, extra)
  }

  fun testStatus(): Map<String, Any?> = synchronized(testEvents) {
    mapOf(
      "active" to isTestMode(),
      "remainingMs" to (testUntil - SystemClock.elapsedRealtime()).coerceAtLeast(0L),
      "events" to testEvents.toList(),
    )
  }

  fun isActive() = inProgress

  /** In test mode a detected gesture or phrase only vibrates and reports back; nothing is sent. */
  fun trigger(ctx: Context, source: String, immediate: Boolean = false) {
    val app = ctx.applicationContext
    if (isTestMode() && source != "button") {
      Haptics.play(app, Haptics.TEST)
      recordTest("test", mapOf("source" to source))
      return
    }
    if (inProgress) return
    val cfg = ConfigStore.loadConfig(app) ?: run {
      SosBus.emit("error", mapOf("detail" to "not_configured"))
      return
    }
    inProgress = true
    val gen = ++generation
    acquireWakeLock(app)
    if (cfg.vibrate && !immediate) Haptics.play(app, Haptics.TRIGGERED)
    SosBus.emit("triggered", mapOf("source" to source, "graceMs" to if (immediate) 0L else cfg.graceMs))

    var graceOver = false
    var located = !cfg.locationEnabled
    var fix: GeoFix? = null
    var sent = false
    fun maybeSend() {
      if (gen != generation || sent || !graceOver || !located) return
      sent = true
      sendTask = null
      dispatch(app, cfg, source, fix, gen)
    }
    if (cfg.locationEnabled) {
      locator = LocationFetcher(app, cfg.locationTimeoutMs) { f ->
        fix = f
        located = true
        maybeSend()
      }.also { it.start() }
    }
    val task = Runnable {
      graceOver = true
      maybeSend()
    }
    sendTask = task
    main.postDelayed(task, if (immediate) 0L else cfg.graceMs)
  }

  /** Returns true if something was cancelled. */
  fun cancel(ctx: Context): Boolean {
    if (!inProgress) {
      if (isTestMode()) {
        Haptics.play(ctx.applicationContext, Haptics.CANCELLED)
        recordTest("test", mapOf("source" to "cancel"))
      }
      return false
    }
    generation++
    sendTask?.let { main.removeCallbacks(it) }
    sendTask = null
    locator?.cancel()
    locator = null
    chain?.cancel()
    chain = null
    inProgress = false
    releaseWakeLock()
    Haptics.play(ctx.applicationContext, Haptics.CANCELLED)
    SosBus.emit("cancelled")
    return true
  }

  private fun dispatch(ctx: Context, cfg: SosConfig, source: String, fix: GeoFix?, gen: Int) {
    locator = null
    val time = SimpleDateFormat("HH:mm", Locale.US).format(Date())
    val text = SosText.contactMessage(cfg, fix, time)
    val notified = cfg.smsRecipients.count { Sms.send(ctx, it, text) }
    cfg.gatewayNumber?.let { Sms.send(ctx, it, SosText.gatewayMessage(cfg, fix)) }

    val alert = JSONObject().apply {
      put("alertId", UUID.randomUUID().toString())
      put("triggeredAt", isoNow())
      put("source", source)
      put("location", cfg.alertLocation)
      fix?.let { f ->
        put("geo", JSONObject().apply {
          put("lat", f.lat)
          put("lng", f.lng)
          f.accuracy?.let { put("accuracy", it.toDouble()) }
        })
      }
      cfg.callbackNumber?.let { put("callbackNumber", it) }
      put("contactsNotified", notified)
    }
    ConfigStore.appendAlert(ctx, alert)
    cfg.apiUrl?.let { url -> Thread { post(url, alert) }.start() }
    SosBus.emit("dispatched", mapOf("source" to source, "smsSent" to notified, "calls" to cfg.calls.size))

    chain = CallChain(ctx, cfg.calls) {
      if (gen == generation) {
        chain = null
        inProgress = false
        releaseWakeLock()
        SosBus.emit("finished")
      }
    }.also { it.start() }
  }

  /** Production path: the phone posts the alert straight to the national platform. */
  private fun post(url: String, alert: JSONObject) {
    runCatching {
      val conn = URL(url).openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.connectTimeout = 10_000
      conn.readTimeout = 10_000
      conn.doOutput = true
      conn.setRequestProperty("Content-Type", "application/json")
      conn.outputStream.use { it.write(alert.toString().toByteArray(Charsets.UTF_8)) }
      conn.responseCode
      conn.disconnect()
    }
  }

  private fun isoNow(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    .apply { timeZone = TimeZone.getTimeZone("UTC") }
    .format(Date())

  /** Without a wake lock the cancel-window timer would stall once the screen is off and the CPU sleeps. */
  private fun acquireWakeLock(ctx: Context) {
    if (wakeLock?.isHeld == true) return
    wakeLock = ctx.getSystemService(PowerManager::class.java)
      ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "calc:task")
      ?.apply {
        setReferenceCounted(false)
        acquire(30 * 60 * 1000L)
      }
  }

  private fun releaseWakeLock() {
    runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
    wakeLock = null
  }
}
