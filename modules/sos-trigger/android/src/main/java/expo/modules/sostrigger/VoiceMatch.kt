package expo.modules.sostrigger

import java.text.Normalizer
import java.util.Locale
import kotlin.math.max
import kotlin.math.sqrt

/** Phrase and speaker decision for the voice trigger. Mirrors `matchesPhrase` in src/domain/sos.ts. */
object VoiceMatch {
  private val marks = Regex("\\p{M}+")
  private val nonWord = Regex("[^\\p{L}\\p{N}' ]+")
  private val spaces = Regex("\\s+")

  fun words(text: String): List<String> {
    val folded = Normalizer.normalize(text.lowercase(Locale.ROOT), Normalizer.Form.NFD).replace(marks, "")
    return folded
      .replace("[unk]", " ")
      .replace('\u2019', '\'')
      .replace(nonWord, " ")
      .replace(spaces, " ")
      .trim()
      .split(' ')
      .filter { it.isNotEmpty() }
  }

  /**
   * Only the phrase's words, all of them, in any order and possibly repeated; any other word
   * rejects it and at most one "[unk]" is tolerated. Mirrors `matchesPhrase` in src/domain/sos.ts.
   */
  fun matchesPhrase(text: String, phrases: List<String>): Boolean {
    val unknown = Regex("\\[unk]").findAll(text.lowercase(Locale.ROOT)).count()
    val heard = words(text)
    if (unknown > 1 || heard.isEmpty()) return false
    return phrases.any { phrase ->
      val target = words(phrase)
      target.isNotEmpty() && heard.size <= target.size * 2 &&
        heard.all { it in target } && target.all { it in heard }
    }
  }

  fun cosine(a: FloatArray, b: FloatArray): Double {
    if (a.isEmpty() || a.size != b.size) return 0.0
    var dot = 0.0
    var na = 0.0
    var nb = 0.0
    for (i in a.indices) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return if (na == 0.0 || nb == 0.0) 0.0 else dot / sqrt(na * nb)
  }

  data class Decision(val phrase: Boolean, val score: Double, val accepted: Boolean)

  fun decide(text: String, vector: FloatArray?, frames: Int, cfg: VoiceConfig): Decision {
    val phrase = matchesPhrase(text, cfg.phrases)
    val score = if (vector != null && frames >= cfg.minFrames) cosine(vector, cfg.voiceprint) else 0.0
    return Decision(phrase, score, phrase && score >= cfg.threshold)
  }
}

/**
 * Energy-based speech gate so the recogniser only decodes audio that may contain speech (battery).
 * The noise floor is the quietest chunk of the last [window] chunks, so a steady background (fan,
 * street) raises the threshold instead of keeping the gate open forever.
 */
class EnergyGate(private val minRms: Double = 80.0, private val ratio: Double = 2.5, private val window: Int = 30) {
  private val history = ArrayDeque<Double>()
  var silentChunks = 0
    private set
  var lastRms = 0.0
    private set

  fun update(samples: ShortArray, length: Int = samples.size): Boolean {
    if (length <= 0) return false
    var sum = 0.0
    for (i in 0 until length) sum += samples[i].toDouble() * samples[i]
    val rms = sqrt(sum / length)
    lastRms = rms
    history.addLast(rms)
    if (history.size > window) history.removeFirst()
    val floor = history.min()
    val speech = rms > max(minRms, floor * ratio)
    silentChunks = if (speech) 0 else silentChunks + 1
    return speech
  }
}
