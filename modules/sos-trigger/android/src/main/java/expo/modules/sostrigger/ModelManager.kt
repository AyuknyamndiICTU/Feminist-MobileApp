package expo.modules.sostrigger

import android.content.Context
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.zip.ZipInputStream

/** Downloads and unpacks the offline Vosk models into the app's private storage (once). */
object ModelManager {
  private val safeName = Regex("^[A-Za-z0-9._-]+$")

  private fun root(ctx: Context) = File(ctx.filesDir, "vosk")

  fun dir(ctx: Context, name: String): File {
    require(safeName.matches(name) && name != "." && name != "..") { "Invalid model name" }
    return File(root(ctx), name)
  }

  fun isReady(ctx: Context, name: String): Boolean = File(dir(ctx, name), ".ready").exists()

  fun download(ctx: Context, name: String, url: String, sha256: String?, onProgress: (Int) -> Unit) {
    require(url.startsWith("https://")) { "Model URL must use HTTPS" }
    val target = dir(ctx, name)
    if (isReady(ctx, name)) return
    val zip = File(ctx.cacheDir, "$name.zip.part")
    val digest = MessageDigest.getInstance("SHA-256")
    val conn = URL(url).openConnection() as HttpURLConnection
    conn.connectTimeout = 15_000
    conn.readTimeout = 30_000
    try {
      if (conn.responseCode != HttpURLConnection.HTTP_OK) throw IllegalStateException("HTTP ${conn.responseCode}")
      val total = conn.contentLengthLong
      var read = 0L
      var lastPct = -1
      conn.inputStream.use { input ->
        FileOutputStream(zip).use { out ->
          val buf = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            digest.update(buf, 0, n)
            read += n
            if (total > 0) {
              val pct = (read * 100 / total).toInt()
              if (pct != lastPct) {
                lastPct = pct
                onProgress(pct)
              }
            }
          }
        }
      }
    } finally {
      conn.disconnect()
    }
    try {
      val actual = digest.digest().joinToString("") { "%02x".format(it) }
      if (sha256 != null && !actual.equals(sha256, ignoreCase = true)) throw SecurityException("Model checksum mismatch")
      unpack(zip, root(ctx), name)
      File(target, ".ready").writeText(actual)
    } finally {
      zip.delete()
    }
  }

  /** Extracts only entries under "<name>/" and refuses any path escaping the target (zip-slip). */
  private fun unpack(zip: File, root: File, name: String) {
    val staging = File(root, ".staging-$name")
    staging.deleteRecursively()
    staging.mkdirs()
    val base = staging.canonicalPath + File.separator
    ZipInputStream(zip.inputStream().buffered()).use { zin ->
      while (true) {
        val entry = zin.nextEntry ?: break
        if (!entry.name.startsWith("$name/")) continue
        val out = File(staging, entry.name)
        if (!out.canonicalPath.startsWith(base)) throw SecurityException("Unsafe zip entry")
        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          FileOutputStream(out).use { zin.copyTo(it) }
        }
      }
    }
    val unpacked = File(staging, name)
    if (!unpacked.isDirectory) throw IllegalStateException("Unexpected model archive layout")
    val target = File(root, name)
    target.deleteRecursively()
    if (!unpacked.renameTo(target)) throw IllegalStateException("Could not install model")
    staging.deleteRecursively()
  }
}
