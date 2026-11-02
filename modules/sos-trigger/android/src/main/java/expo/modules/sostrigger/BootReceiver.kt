package expo.modules.sostrigger

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arms the triggers and any Safe Walk deadline after a reboot or app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (ConfigStore.isArmed(context) && ConfigStore.loadConfig(context) != null) runCatching { SosService.start(context) }
    runCatching { CheckIn.restoreAfterBoot(context) }
  }
}
