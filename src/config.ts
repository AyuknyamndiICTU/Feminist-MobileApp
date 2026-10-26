/**
 * Deployment configuration. Hotline numbers were verified against CRTV (Aug 2026) and must be
 * re-confirmed with MINPROFF before release. SMS/USSD codes are placeholders to be assigned by operators.
 */
export const CONFIG = {
  hotlines: [
    { id: 'minproff', number: '1166', label: { en: 'MINPROFF GBV helpline (toll-free)', fr: 'Ligne verte VBG du MINPROFF' } },
    { id: 'police', number: '117', label: { en: 'Police', fr: 'Police' } },
    { id: 'gendarmerie', number: '113', label: { en: 'Gendarmerie', fr: 'Gendarmerie' } },
    { id: 'samu', number: '119', label: { en: 'Ambulance (SAMU)', fr: 'Ambulance (SAMU)' } },
  ],
  smsGateway: { number: '00000', isPlaceholder: true },
  ussdCode: { code: '*000#', isPlaceholder: true },
  /** Agents keep their session this long in background; citizens are always locked immediately. */
  agentBackgroundGraceMs: 5 * 60 * 1000,
  minSecretCodeLength: 4,
  maxSecretCodeLength: 8,
  /** Hands-free SOS (Android). Thresholds are prototype values to be calibrated during the pilot. */
  sos: {
    /** Last number of the call chain, after the user's emergency contacts. */
    hotline: '1166',
    /** Same SMS short code as coded reports; skipped while it is a placeholder. */
    gateway: { number: '00000', isPlaceholder: true },
    /** Production NIS endpoint for SOS alerts posted directly by the phone; unset in the prototype. */
    apiUrl: undefined as string | undefined,
    maxContacts: 5,
    pressCount: 3,
    pressWindowMs: 3000,
    graceMs: 5000,
    locationTimeoutMs: 10000,
    testModeMs: 2 * 60 * 1000,
    voice: {
      /**
       * Cosine similarity between x-vectors (Vosk speaker model) needed to accept the speaker.
       * Lenient on purpose: rejecting the victim costs more than a rare false accept. Offline check
       * with synthetic voices: same voice 0.84–0.94, different voices 0.13–0.41.
       */
      threshold: 0.5,
      enrollmentSamples: 3,
      /** Speech frames (10 ms each) needed before a speaker vector is trusted. */
      minFrames: 50,
      sampleTimeoutMs: 8000,
    },
    /** Offline Vosk models (Apache-2.0), downloaded once when the voice trigger is turned on. */
    voiceModels: {
      en: { name: 'vosk-model-small-en-us-0.15', url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip', sha256: '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498', sizeMb: 40 },
      fr: { name: 'vosk-model-small-fr-0.22', url: 'https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip', sha256: 'cabf6180e177eb9b3a9a9d43a437bd5e549f3a7d09525e5d69a3fed787be12ad', sizeMb: 42 },
      speaker: { name: 'vosk-model-spk-0.4', url: 'https://alphacephei.com/vosk/models/vosk-model-spk-0.4.zip', sha256: 'a74d8f51144484813e16af689bb0f916b7a111e2347f467c4933c1166097b5a7', sizeMb: 14 },
    },
  },
} as const;
