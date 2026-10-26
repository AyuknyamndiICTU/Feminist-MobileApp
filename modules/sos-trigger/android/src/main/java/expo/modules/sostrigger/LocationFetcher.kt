package expo.modules.sostrigger

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

fun Context.granted(permission: String): Boolean =
  ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

/**
 * One-shot position: listens to every enabled provider at once (older phones have no fused
 * provider and GPS rarely fixes indoors), returns early on a precise fix, otherwise the best fix
 * or a recent last-known position when the timeout expires.
 */
class LocationFetcher(private val ctx: Context, private val timeoutMs: Long, private val onResult: (GeoFix?) -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private val lm = ctx.getSystemService(LocationManager::class.java)
  private var best: Location? = null
  private var done = false
  private val listener = object : LocationListener {
    override fun onLocationChanged(location: Location) = consider(location)

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit
  }

  @SuppressLint("MissingPermission")
  fun start() {
    val allowed = ctx.granted(Manifest.permission.ACCESS_FINE_LOCATION) || ctx.granted(Manifest.permission.ACCESS_COARSE_LOCATION)
    if (!allowed || lm == null) return finish()
    val providers = buildList {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) add(LocationManager.FUSED_PROVIDER)
      add(LocationManager.GPS_PROVIDER)
      add(LocationManager.NETWORK_PROVIDER)
    }.filter { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
    for (p in providers) {
      runCatching { lm.getLastKnownLocation(p) }.getOrNull()?.let { last ->
        if (ageMs(last) < 120_000) consider(last)
      }
      if (done) return
    }
    if (providers.isEmpty()) return finish()
    for (p in providers) runCatching { lm.requestLocationUpdates(p, 0L, 0f, listener, Looper.getMainLooper()) }
    main.postDelayed({ finish() }, timeoutMs)
  }

  fun cancel() {
    done = true
    stop()
  }

  private fun ageMs(l: Location) = (SystemClock.elapsedRealtimeNanos() - l.elapsedRealtimeNanos) / 1_000_000

  private fun consider(l: Location) {
    if (done) return
    val current = best
    if (current == null || (l.hasAccuracy() && (!current.hasAccuracy() || l.accuracy < current.accuracy))) best = l
    if (l.hasAccuracy() && l.accuracy <= 50f) finish()
  }

  private fun stop() {
    main.removeCallbacksAndMessages(null)
    runCatching { lm?.removeUpdates(listener) }
  }

  private fun finish() {
    if (done) return
    done = true
    stop()
    val l = best
    onResult(l?.let { GeoFix(it.latitude, it.longitude, if (it.hasAccuracy()) it.accuracy else null) })
  }
}

object Sms {
  /** Dual-SIM phones are common: use the default SMS SIM, or the first active one if none is set. */
  @SuppressLint("MissingPermission")
  private fun manager(ctx: Context): SmsManager {
    var subId = SubscriptionManager.getDefaultSmsSubscriptionId()
    if (subId == SubscriptionManager.INVALID_SUBSCRIPTION_ID && ctx.granted(Manifest.permission.READ_PHONE_STATE)) {
      subId = runCatching {
        ctx.getSystemService(SubscriptionManager::class.java)?.activeSubscriptionInfoList?.firstOrNull()?.subscriptionId
      }.getOrNull() ?: SubscriptionManager.INVALID_SUBSCRIPTION_ID
    }
    val base = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ctx.getSystemService(SmsManager::class.java)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getDefault()
    }
    if (subId == SubscriptionManager.INVALID_SUBSCRIPTION_ID) return base
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      base.createForSubscriptionId(subId)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getSmsManagerForSubscriptionId(subId)
    }
  }

  fun send(ctx: Context, number: String, text: String): Boolean {
    if (!ctx.granted(Manifest.permission.SEND_SMS)) return false
    return try {
      val sm = manager(ctx)
      val parts = sm.divideMessage(text)
      if (parts.size > 1) sm.sendMultipartTextMessage(number, null, parts, null, null) else sm.sendTextMessage(number, null, text, null, null)
      true
    } catch (e: Exception) {
      false
    }
  }
}
