package expo.modules.sostrigger

import android.content.Context
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SosTriggerModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private val enrollLock = Any()
  private var enrollEngine: VoiceEngine? = null
  private var enrollKey: String? = null
  @Volatile
  private var recording: VoiceListener? = null

  override fun definition() = ModuleDefinition {
    Name("SosTrigger")

    Events("onSosEvent")

    OnCreate {
      SosBus.listener = { sendEvent("onSosEvent", it) }
    }

    OnDestroy {
      SosBus.listener = null
      releaseEnrollment()
    }

    AsyncFunction("configure") { json: String ->
      SosConfig.parse(json)
      ConfigStore.saveConfig(context, json)
      if (ConfigStore.isArmed(context)) SosService.start(context)
    }

    AsyncFunction("arm") {
      ConfigStore.setArmed(context, true)
      SosService.start(context)
    }

    AsyncFunction("disarm") {
      ConfigStore.setArmed(context, false)
      SosService.stop(context)
    }

    Function("isRunning") {
      SosService.running
    }

    AsyncFunction("clear") {
      SosDispatcher.cancel(context)
      ConfigStore.setArmed(context, false)
      SosService.stop(context)
      ConfigStore.clear(context)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("trigger") { source: String, immediate: Boolean ->
      SosDispatcher.trigger(context, source, immediate)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") {
      SosDispatcher.cancel(context)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("isActive") {
      SosDispatcher.isActive()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setTestMode") { enabled: Boolean ->
      SosDispatcher.setTestMode(context, enabled)
    }.runOnQueue(Queues.MAIN)

    Function("getTestStatus") {
      SosDispatcher.testStatus()
    }

    Function("isModelReady") { name: String ->
      ModelManager.isReady(context, name)
    }

    AsyncFunction("downloadModel") { name: String, url: String, sha256: String?, promise: Promise ->
      val ctx = context
      Thread {
        try {
          ModelManager.download(ctx, name, url, sha256) { pct ->
            SosBus.emit("download", mapOf("name" to name, "progress" to pct))
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("E_DOWNLOAD", e.message, e)
        }
      }.start()
    }

    AsyncFunction("recordVoiceSample") { model: String, speakerModel: String, timeoutMs: Int, promise: Promise ->
      val ctx = context
      Thread { recordSample(ctx, model, speakerModel, timeoutMs.toLong(), promise) }.start()
    }

    Function("stopRecording") {
      recording?.stop()
    }

    AsyncFunction("endEnrollment") {
      releaseEnrollment()
    }

    AsyncFunction("takePendingAlerts") {
      ConfigStore.takeAlerts(context)
    }
  }

  /** Records until the first utterance (or timeout) and returns its text and speaker vector. */
  private fun recordSample(ctx: Context, model: String, speakerModel: String, timeoutMs: Long, promise: Promise) {
    val engine = try {
      synchronized(enrollLock) {
        val key = "$model/$speakerModel"
        if (enrollKey != key) {
          enrollEngine?.close()
          enrollEngine = VoiceEngine(ModelManager.dir(ctx, model), ModelManager.dir(ctx, speakerModel))
          enrollKey = key
        }
        enrollEngine!!
      }
    } catch (e: Throwable) {
      promise.reject("E_VOICE_LOAD", e.message, e)
      return
    }
    val lock = Object()
    var result: Utterance? = null
    var error: String? = null
    val listener = VoiceListener(
      engine,
      onUtterance = { u -> synchronized(lock) { if (result == null) { result = u; lock.notifyAll() } } },
      onError = { e -> synchronized(lock) { error = e; lock.notifyAll() } },
      flushOnStop = true,
    )
    recording = listener
    listener.start()
    val deadline = System.currentTimeMillis() + timeoutMs
    synchronized(lock) {
      while (result == null && error == null) {
        val left = deadline - System.currentTimeMillis()
        if (left <= 0) break
        lock.wait(left)
      }
    }
    // Stopping also flushes a sentence still in progress into `result`.
    listener.stop()
    recording = null
    // Levels only (no audio, no words): helps tell a quiet microphone from a recognition problem.
    Log.i(TAG, "enrol sample: peakRms=${listener.peakRms.toInt()} speechChunks=${listener.speechChunks} " +
      "gotText=${result?.text?.isNotEmpty() == true} frames=${result?.frames ?: 0}")
    val err = error
    if (err != null && result == null) {
      promise.reject("E_MIC", err, null)
      return
    }
    val u = result
    promise.resolve(
      mapOf(
        "text" to (u?.text ?: ""),
        "vector" to (u?.vector?.map { it.toDouble() } ?: emptyList<Double>()),
        "frames" to (u?.frames ?: 0),
      ),
    )
  }

  private fun releaseEnrollment() {
    recording?.stop()
    recording = null
    synchronized(enrollLock) {
      enrollEngine?.close()
      enrollEngine = null
      enrollKey = null
    }
  }

  private companion object {
    const val TAG = "CalcVoice"
  }
}
