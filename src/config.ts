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
} as const;
