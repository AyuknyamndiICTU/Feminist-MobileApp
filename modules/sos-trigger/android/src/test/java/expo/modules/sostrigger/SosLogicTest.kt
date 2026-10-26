package expo.modules.sostrigger

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PressPatternDetectorTest {
  @Test
  fun `three distinct presses inside the window trigger`() {
    val d = PressPatternDetector(required = 3, windowMs = 3000)
    assertFalse(d.onDown(0)); d.onUp()
    assertFalse(d.onDown(300)); d.onUp()
    assertTrue(d.onDown(600))
  }

  @Test
  fun `presses spread beyond the window do not trigger`() {
    val d = PressPatternDetector(required = 3, windowMs = 3000)
    d.onDown(0); d.onUp()
    d.onDown(2000); d.onUp()
    assertFalse(d.onDown(4000)); d.onUp()
    assertTrue(d.onDown(4500))
  }

  @Test
  fun `holding the key (auto-repeat) counts as one press`() {
    val d = PressPatternDetector(required = 3, windowMs = 3000)
    d.onUp()
    assertFalse(d.onDown(0))
    for (t in 500L..1500L step 50) assertFalse(d.onDown(t))
    d.onUp()
    assertFalse(d.onDown(1700))
  }

  @Test
  fun `devices without key-up still count separated presses but not rapid repeats`() {
    val d = PressPatternDetector(required = 3, windowMs = 3000, minGapMs = 150)
    assertFalse(d.onDown(0))
    assertFalse(d.onDown(40))
    assertFalse(d.onDown(250))
    assertTrue(d.onDown(500))
  }

  @Test
  fun `a stale hold is treated as released`() {
    val d = PressPatternDetector(required = 2, windowMs = 5000)
    d.onUp()
    d.onDown(0)
    assertTrue(d.onDown(2000))
  }

  @Test
  fun `the counter restarts after a completed pattern`() {
    val d = PressPatternDetector(required = 2, windowMs = 3000)
    d.onDown(0); d.onUp()
    assertTrue(d.onDown(200)); d.onUp()
    assertFalse(d.onDown(400))
  }
}

class VoiceMatchTest {
  private val en = listOf("please help me")
  private val fr = listOf("aidez moi s'il vous plaît")

  @Test
  fun `whole utterance must be the phrase, possibly repeated`() {
    assertTrue(VoiceMatch.matchesPhrase("please help me", en))
    assertTrue(VoiceMatch.matchesPhrase("Please, help me!", en))
    assertTrue(VoiceMatch.matchesPhrase("[unk] please help me", en))
    assertTrue(VoiceMatch.matchesPhrase("please help me please help me", en))
    assertFalse(VoiceMatch.matchesPhrase("please help me carry this", en))
    assertFalse(VoiceMatch.matchesPhrase("please tell me", en))
    assertFalse(VoiceMatch.matchesPhrase("", en))
  }

  @Test
  fun `french phrase ignores accents, hyphens and curly apostrophes`() {
    assertTrue(VoiceMatch.matchesPhrase("aidez-moi s’il vous plait", fr))
    assertTrue(VoiceMatch.matchesPhrase("Aidez moi, s'il vous plaît.", fr))
    assertFalse(VoiceMatch.matchesPhrase("aidez moi", fr))
  }

  @Test
  fun `cosine similarity`() {
    assertEquals(1.0, VoiceMatch.cosine(floatArrayOf(1f, 2f), floatArrayOf(2f, 4f)), 1e-6)
    assertEquals(0.0, VoiceMatch.cosine(floatArrayOf(1f, 0f), floatArrayOf(0f, 1f)), 1e-6)
    assertEquals(0.0, VoiceMatch.cosine(floatArrayOf(1f), floatArrayOf(1f, 1f)), 1e-6)
  }

  @Test
  fun `speaker must match and enough speech is needed`() {
    val cfg = VoiceConfig("m", "s", en, floatArrayOf(1f, 0f, 0f), threshold = 0.5, minFrames = 50)
    assertTrue(VoiceMatch.decide("please help me", floatArrayOf(0.9f, 0.3f, 0f), 80, cfg).accepted)
    assertFalse(VoiceMatch.decide("please help me", floatArrayOf(0f, 1f, 0f), 80, cfg).accepted)
    assertFalse(VoiceMatch.decide("please help me", floatArrayOf(1f, 0f, 0f), 20, cfg).accepted)
    assertFalse(VoiceMatch.decide("please help me", null, 80, cfg).accepted)
    assertFalse(VoiceMatch.decide("hello there", floatArrayOf(1f, 0f, 0f), 80, cfg).accepted)
  }

  @Test
  fun `energy gate opens on speech and counts silence`() {
    val gate = EnergyGate()
    val quiet = ShortArray(1600) { 10 }
    val loud = ShortArray(1600) { if (it % 2 == 0) 3000 else -3000 }
    repeat(5) { assertFalse(gate.update(quiet)) }
    assertTrue(gate.update(loud))
    assertEquals(0, gate.silentChunks)
    gate.update(quiet)
    gate.update(quiet)
    assertEquals(2, gate.silentChunks)
  }

  @Test
  fun `steady background noise does not hold the gate open`() {
    val gate = EnergyGate()
    val fan = ShortArray(1600) { if (it % 2 == 0) 400 else -400 }
    val voice = ShortArray(1600) { if (it % 2 == 0) 3000 else -3000 }
    repeat(40) { assertFalse(gate.update(fan)) }
    assertTrue(gate.update(voice))
    repeat(12) { gate.update(fan) }
    assertEquals(12, gate.silentChunks)
  }
}

class SosConfigTest {
  /** Shape produced by buildNativeSosConfig() in src/domain/sos.ts. */
  private val json = """
    {"version":1,"triggers":{"volume":true,"voice":true},"pressCount":3,"pressWindowMs":3000,"graceMs":5000,
     "vibrate":true,"testModeMs":120000,
     "sms":{"recipients":["699112233","677001122"],"text":"SOS from Amina: I am in danger and need help now. {location} Time: {time}. (automatic alert)","gatewayPrefix":"S1 CE MFO YDE3"},
     "calls":["699112233","677001122","1166"],
     "location":{"enabled":true,"timeoutMs":10000,"known":"Location: https://maps.google.com/?q={lat},{lng} (+/-{acc} m).","unknown":"Location unavailable."},
     "voice":{"model":"vosk-model-small-en-us-0.15","speakerModel":"vosk-model-spk-0.4","phrases":["please help me"],"voiceprint":[0.6,0.8],"threshold":0.5,"minFrames":50},
     "alert":{"location":{"region":"CE","department":"MFO","arrondissement":"YDE3"},"callbackNumber":"699000000"},
     "notification":{"title":"Calculator","text":""}}
  """.trimIndent()

  @Test
  fun `parses the JavaScript config`() {
    val cfg = SosConfig.parse(json)
    assertEquals(listOf("699112233", "677001122", "1166"), cfg.calls)
    assertEquals(null, cfg.gatewayNumber)
    assertEquals(null, cfg.apiUrl)
    assertEquals("699000000", cfg.callbackNumber)
    assertEquals(2, cfg.voice!!.voiceprint.size)
    assertEquals("CE", cfg.alertLocation.getString("region"))
  }

  @Test
  fun `fills the contact message and the gateway code like the TypeScript side`() {
    val cfg = SosConfig.parse(json)
    val fix = GeoFix(3.866667, 11.516667, 12.4f)
    assertEquals(
      "SOS from Amina: I am in danger and need help now. Location: https://maps.google.com/?q=3.86667,11.51667 (+/-12 m). Time: 21:04. (automatic alert)",
      SosText.contactMessage(cfg, fix, "21:04"),
    )
    assertEquals(
      "SOS from Amina: I am in danger and need help now. Location unavailable. Time: 21:04. (automatic alert)",
      SosText.contactMessage(cfg, null, "21:04"),
    )
    assertEquals("S1 CE MFO YDE3 3.86667,11.51667,12", SosText.gatewayMessage(cfg, fix))
    assertEquals("S1 CE MFO YDE3 -", SosText.gatewayMessage(cfg, null))
  }

  @Test
  fun `voice is ignored when its trigger is off and unsafe values are clamped`() {
    val cfg = SosConfig.parse(
      json.replace("\"voice\":true", "\"voice\":false").replace("\"pressCount\":3", "\"pressCount\":1"),
    )
    assertEquals(null, cfg.voice)
    assertEquals(2, cfg.pressCount)
  }
}
