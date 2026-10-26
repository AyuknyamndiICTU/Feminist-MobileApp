package expo.modules.sostrigger

/**
 * Counts distinct presses of one volume key and reports when [required] presses fall within
 * [windowMs]. Holding the key produces auto-repeat events; they count as a single press because a
 * new press needs a key-up first. Some devices never report key-up, so a gap of [minGapMs] (or a
 * long silence) also starts a new press.
 */
class PressPatternDetector(
  private val required: Int,
  private val windowMs: Long,
  private val minGapMs: Long = 150,
  private val staleHoldMs: Long = 1500,
) {
  private val presses = ArrayDeque<Long>()
  private var lastDownAt: Long? = null
  private var released = true
  private var seenRelease = false

  /** Returns true when this key-down completes the pattern. */
  fun onDown(now: Long): Boolean {
    val last = lastDownAt
    val isNewPress = released ||
      last == null ||
      now - last > staleHoldMs ||
      (!seenRelease && now - last >= minGapMs)
    lastDownAt = now
    released = false
    if (!isNewPress) return false
    presses.addLast(now)
    while (presses.isNotEmpty() && now - presses.first() > windowMs) presses.removeFirst()
    if (presses.size >= required) {
      presses.clear()
      return true
    }
    return false
  }

  fun onUp() {
    released = true
    seenRelease = true
  }

  fun reset() {
    presses.clear()
    released = true
    lastDownAt = null
  }
}
