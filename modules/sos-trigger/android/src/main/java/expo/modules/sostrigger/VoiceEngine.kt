package expo.modules.sostrigger

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.SpeakerModel
import java.io.File
import kotlin.math.max

data class Utterance(val text: String, val vector: FloatArray?, val frames: Int)

/** Loaded Vosk models. Loading takes a few seconds and a few hundred MB, so it is done once. */
class VoiceEngine(modelDir: File, speakerDir: File) : AutoCloseable {
  private val model = Model(modelDir.absolutePath)
  private val speaker = SpeakerModel(speakerDir.absolutePath)

  /** Full-vocabulary recogniser: a tiny grammar would force look-alike sentences onto the phrase. */
  fun recognizer(): Recognizer = Recognizer(model, SAMPLE_RATE.toFloat(), speaker)

  override fun close() {
    runCatching { speaker.close() }
    runCatching { model.close() }
  }

  companion object {
    const val SAMPLE_RATE = 16000

    fun parse(json: String): Utterance? {
      val o = runCatching { JSONObject(json) }.getOrNull() ?: return null
      val text = o.optString("text", "").trim()
      if (text.isEmpty()) return null
      val spk = o.optJSONArray("spk")
      val vector = spk?.let { a -> FloatArray(a.length()) { a.getDouble(it).toFloat() } }
      return Utterance(text, vector, o.optInt("spk_frames", 0))
    }
  }
}

/**
 * Microphone loop on a background thread. Audio is only fed to the recogniser while the energy
 * gate detects possible speech (plus a short pre-roll), which keeps CPU and battery use low.
 */
class VoiceListener(
  private val engine: VoiceEngine,
  private val onUtterance: (Utterance) -> Unit,
  private val onError: (String) -> Unit,
  /** Enrolment: when stopped mid-sentence, hand over what was heard instead of dropping it. */
  private val flushOnStop: Boolean = false,
) {
  @Volatile
  private var running = false
  private var thread: Thread? = null

  /** Loudest chunk and number of speech chunks seen, for diagnosing quiet microphones. */
  @Volatile
  var peakRms = 0.0
    private set
  @Volatile
  var speechChunks = 0
    private set

  fun start() {
    if (running) return
    running = true
    thread = Thread({ loop() }, "calc-audio").apply {
      isDaemon = true
      start()
    }
  }

  fun stop() {
    running = false
    thread?.join(2000)
    thread = null
  }

  @SuppressLint("MissingPermission")
  private fun loop() {
    val chunkSize = VoiceEngine.SAMPLE_RATE / 10
    val minBuf = AudioRecord.getMinBufferSize(VoiceEngine.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val record = try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        VoiceEngine.SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        max(minBuf, chunkSize * 2 * 4),
      )
    } catch (e: Exception) {
      running = false
      return onError("mic")
    }
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      running = false
      return onError("mic")
    }
    val rec = engine.recognizer()
    val gate = EnergyGate()
    val preRoll = ArrayDeque<ShortArray>()
    val chunk = ShortArray(chunkSize)
    var active = false
    var activeChunks = 0

    fun feed(frame: ShortArray) {
      if (rec.acceptWaveForm(frame, frame.size)) VoiceEngine.parse(rec.result)?.let(onUtterance)
    }

    try {
      record.startRecording()
      while (running) {
        val n = record.read(chunk, 0, chunk.size)
        if (n <= 0) {
          if (n < 0) Thread.sleep(100)
          continue
        }
        val frame = chunk.copyOf(n)
        val speech = gate.update(frame, n)
        if (gate.lastRms > peakRms) peakRms = gate.lastRms
        if (speech) speechChunks++
        if (!active) {
          preRoll.addLast(frame)
          if (preRoll.size > PRE_ROLL_CHUNKS) preRoll.removeFirst()
          if (speech) {
            active = true
            activeChunks = 0
            while (preRoll.isNotEmpty()) feed(preRoll.removeFirst())
          }
        } else {
          feed(frame)
          activeChunks++
          if (gate.silentChunks >= END_SILENCE_CHUNKS || activeChunks >= MAX_ACTIVE_CHUNKS) {
            VoiceEngine.parse(rec.finalResult)?.let(onUtterance)
            rec.reset()
            active = false
          }
        }
      }
      if (active && flushOnStop) VoiceEngine.parse(rec.finalResult)?.let(onUtterance)
    } catch (e: Exception) {
      onError("audio")
    } finally {
      runCatching { record.stop() }
      record.release()
      rec.close()
    }
  }

  private companion object {
    const val PRE_ROLL_CHUNKS = 4
    const val END_SILENCE_CHUNKS = 12
    const val MAX_ACTIVE_CHUNKS = 150
  }
}
