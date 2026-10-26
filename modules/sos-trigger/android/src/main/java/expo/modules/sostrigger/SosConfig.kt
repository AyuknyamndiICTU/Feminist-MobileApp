package expo.modules.sostrigger

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.math.roundToLong

data class VoiceConfig(
  val model: String,
  val speakerModel: String,
  val phrases: List<String>,
  val voiceprint: FloatArray,
  val threshold: Double,
  val minFrames: Int,
  val grammar: List<String> = emptyList(),
) {
  /** JSON grammar for the recogniser, or null for the full vocabulary. */
  fun grammarJson(): String? = if (grammar.isEmpty()) null else JSONArray(grammar).toString()
}

/** Parsed form of `NativeSosConfig` (src/domain/sos.ts). Everything the service needs without JavaScript. */
data class SosConfig(
  val volumeTrigger: Boolean,
  val voice: VoiceConfig?,
  val pressCount: Int,
  val pressWindowMs: Long,
  val graceMs: Long,
  val vibrate: Boolean,
  val testModeMs: Long,
  val smsRecipients: List<String>,
  val smsText: String,
  val gatewayNumber: String?,
  val gatewayPrefix: String,
  val calls: List<String>,
  val locationEnabled: Boolean,
  val locationTimeoutMs: Long,
  val locationKnown: String,
  val locationUnknown: String,
  val alertLocation: JSONObject,
  val callbackNumber: String?,
  val apiUrl: String?,
  val notificationTitle: String,
  val notificationText: String,
) {
  companion object {
    private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }
    private fun JSONObject.optText(name: String): String? = if (has(name) && !isNull(name)) getString(name) else null

    fun parse(json: String): SosConfig {
      val o = JSONObject(json)
      require(o.getInt("version") == 1) { "Unsupported SOS config version" }
      val triggers = o.getJSONObject("triggers")
      val sms = o.getJSONObject("sms")
      val location = o.getJSONObject("location")
      val alert = o.getJSONObject("alert")
      val notification = o.getJSONObject("notification")
      val voice = if (triggers.getBoolean("voice") && o.has("voice") && !o.isNull("voice")) {
        val v = o.getJSONObject("voice")
        val print = v.getJSONArray("voiceprint")
        VoiceConfig(
          model = v.getString("model"),
          speakerModel = v.getString("speakerModel"),
          phrases = v.getJSONArray("phrases").strings(),
          grammar = v.optJSONArray("grammar")?.strings() ?: emptyList(),
          voiceprint = FloatArray(print.length()) { print.getDouble(it).toFloat() },
          threshold = v.getDouble("threshold"),
          minFrames = v.getInt("minFrames"),
        )
      } else {
        null
      }
      return SosConfig(
        volumeTrigger = triggers.getBoolean("volume"),
        voice = voice,
        pressCount = o.getInt("pressCount").coerceIn(2, 6),
        pressWindowMs = o.getLong("pressWindowMs").coerceIn(1000, 10000),
        graceMs = o.getLong("graceMs").coerceIn(0, 30000),
        vibrate = o.getBoolean("vibrate"),
        testModeMs = o.getLong("testModeMs").coerceIn(10000, 600000),
        smsRecipients = sms.getJSONArray("recipients").strings(),
        smsText = sms.getString("text"),
        gatewayNumber = sms.optText("gatewayNumber"),
        gatewayPrefix = sms.getString("gatewayPrefix"),
        calls = o.getJSONArray("calls").strings(),
        locationEnabled = location.getBoolean("enabled"),
        locationTimeoutMs = location.getLong("timeoutMs").coerceIn(1000, 60000),
        locationKnown = location.getString("known"),
        locationUnknown = location.getString("unknown"),
        alertLocation = alert.optJSONObject("location") ?: JSONObject(),
        callbackNumber = alert.optText("callbackNumber"),
        apiUrl = alert.optText("apiUrl")?.takeIf { it.startsWith("https://") },
        notificationTitle = notification.getString("title"),
        notificationText = notification.getString("text"),
      )
    }
  }
}

data class GeoFix(val lat: Double, val lng: Double, val accuracy: Float?)

/** Send-time text filling. Mirrors `fillSosTemplate` / `encodeSosSms` in src/domain/sos.ts. */
object SosText {
  private fun fixed(v: Double) = String.format(Locale.US, "%.5f", v)

  fun contactMessage(cfg: SosConfig, fix: GeoFix?, time: String): String {
    val location = if (fix == null) {
      cfg.locationUnknown
    } else {
      cfg.locationKnown
        .replace("{lat}", fixed(fix.lat))
        .replace("{lng}", fixed(fix.lng))
        .replace("{acc}", (fix.accuracy ?: 0f).toDouble().roundToLong().toString())
    }
    return cfg.smsText.replace("{location}", location).replace("{time}", time)
  }

  fun geoToken(fix: GeoFix?): String {
    if (fix == null) return "-"
    val base = "${fixed(fix.lat)},${fixed(fix.lng)}"
    return if (fix.accuracy == null) base else "$base,${fix.accuracy.toDouble().roundToLong()}"
  }

  fun gatewayMessage(cfg: SosConfig, fix: GeoFix?): String = "${cfg.gatewayPrefix} ${geoToken(fix)}"
}
