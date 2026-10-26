package expo.modules.sostrigger

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arms the triggers after a reboot or app update, if the user had armed them. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (!ConfigStore.isArmed(context) || ConfigStore.loadConfig(context) == null) return
    runCatching { SosService.start(context) }
  }
}
