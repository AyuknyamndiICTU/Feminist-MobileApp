package expo.modules.sostrigger

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

/**
 * Safe Walk: if the user has not confirmed her arrival by the deadline, the SOS starts by itself
 * (with the usual cancel window). AlarmManager wakes the phone even in Doze; exact timing needs the
 * "Alarms & reminders" permission, otherwise Android may deliver it a few minutes late.
 */
object CheckIn {
  private const val PREFS = "calc_ci"
  private const val AT = "at"
  private const val MAIN_CODE = 4711
  private const val BACKUP_CODE = 4712

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun pending(ctx: Context, code: Int = MAIN_CODE): PendingIntent =
    PendingIntent.getBroadcast(
      ctx,
      code,
      Intent(ctx, CheckInReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  fun canScheduleExact(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return ctx.getSystemService(AlarmManager::class.java)?.canScheduleExactAlarms() == true
  }

  /** Returns true if the alarm is exact. */
  fun schedule(ctx: Context, atMs: Long): Boolean {
    prefs(ctx).edit().putLong(AT, atMs).commit()
    val am = ctx.getSystemService(AlarmManager::class.java) ?: return false
    am.cancel(pending(ctx, BACKUP_CODE))
    if (canScheduleExact(ctx)) {
      try {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending(ctx))
        return true
      } catch (_: SecurityException) {
        // Permission revoked meanwhile: fall through to the inexact pair.
      }
    }
    // Without "Alarms & reminders", an idle-safe alarm may arrive up to 75% of the delay late
    // (90 min on a 2 h walk). A second, windowed alarm is capped at about 10 min late while the
    // phone is in use, as it is during a walk. The first delivery fires the SOS; fire() runs once.
    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending(ctx))
    am.setWindow(AlarmManager.RTC_WAKEUP, atMs, 60_000L, pending(ctx, BACKUP_CODE))
    return false
  }

  fun cancel(ctx: Context) {
    prefs(ctx).edit().remove(AT).commit()
    ctx.getSystemService(AlarmManager::class.java)?.let {
      it.cancel(pending(ctx))
      it.cancel(pending(ctx, BACKUP_CODE))
    }
  }

  fun scheduledAt(ctx: Context): Long = prefs(ctx).getLong(AT, 0L)

  /** After a reboot alarms are gone: re-arm a future deadline, or fire one missed while off. */
  fun restoreAfterBoot(ctx: Context) {
    val at = scheduledAt(ctx)
    if (at <= 0L) return
    if (at > System.currentTimeMillis()) schedule(ctx, at) else fire(ctx)
  }

  fun fire(ctx: Context) {
    if (scheduledAt(ctx) <= 0L) return
    prefs(ctx).edit().remove(AT).commit()
    SosDispatcher.trigger(ctx.applicationContext, "checkin")
  }

  fun exactAlarmSettingsIntent(ctx: Context): Intent? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    return Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${ctx.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
  }
}

class CheckInReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val at = CheckIn.scheduledAt(context)
    // A deadline moved later ("add 15 minutes") replaces the alarm; ignore a stale early delivery.
    if (at <= 0L || System.currentTimeMillis() < at - 60_000L) return
    CheckIn.fire(context)
  }
}
