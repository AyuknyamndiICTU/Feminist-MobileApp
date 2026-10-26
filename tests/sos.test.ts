import {
  assessEnrollment,
  averageVoiceprint,
  buildCallChain,
  buildNativeSosConfig,
  cosineSimilarity,
  decodeSosSms,
  DEFAULT_SOS_SETTINGS,
  encodeSosSms,
  fillSosTemplate,
  isValidSosAlert,
  mapLink,
  matchesPhrase,
  normalizePhone,
  safeCallbackNumber,
  sosSmsTemplate,
  validateContact,
  validateSosSettings,
  VOICE_PHRASES,
  type NativeConfigOptions,
  type SosAlert,
  type SosSettings,
} from '../src/domain/sos';
import { can } from '../src/domain/permissions';

const contacts = [
  { id: 'a', name: 'Maman', phone: '699 11 22 33' },
  { id: 'b', name: 'Awa', phone: '+237 677-00-11-22' },
];

const settings = (over: Partial<SosSettings> = {}): SosSettings => ({
  ...DEFAULT_SOS_SETTINGS,
  contacts,
  senderName: 'Amina',
  homeArea: { region: 'CE', department: 'MFO', arrondissement: 'YDE3' },
  ...over,
});

const OPTIONS: NativeConfigOptions = {
  hotline: '1166',
  gateway: { number: '00000', isPlaceholder: true },
  pressCount: 3,
  pressWindowMs: 3000,
  graceMs: 5000,
  locationTimeoutMs: 10000,
  testModeMs: 120000,
  voiceThreshold: 0.5,
  voiceMinFrames: 50,
  voiceModel: 'vosk-model-small-en-us-0.15',
  speakerModel: 'vosk-model-spk-0.4',
  notification: { title: 'Calculator', text: '' },
};

describe('emergency contacts', () => {
  it('normalises phone numbers and rejects bad or duplicate entries', () => {
    expect(normalizePhone(' 00237 699.11.22.33 ')).toBe('+237699112233');
    expect(validateContact({ name: 'Ada', phone: '699112233' })).toEqual([]);
    expect(validateContact({ name: '', phone: '12' })).toEqual(['name', 'phone']);
    expect(validateContact({ name: 'X', phone: '699-11-22-33' }, contacts)).toEqual(['duplicate']);
  });

  it('calls contacts in order, then the hotline, each number once', () => {
    expect(buildCallChain([...contacts, { id: 'c', name: 'Dup', phone: '699112233' }], '1166')).toEqual(
      ['699112233', '+237677001122', '1166'],
    );
  });

  it('cannot be armed without a contact, a trigger, or an enrolled voice', () => {
    expect(validateSosSettings(settings(), 5)).toEqual([]);
    expect(validateSosSettings(settings({ contacts: [] }), 5)).toEqual(['contacts']);
    expect(validateSosSettings(settings({ volumeTrigger: false }), 5)).toEqual(['trigger']);
    expect(validateSosSettings(settings({ voiceTrigger: true }), 5)).toEqual(['voiceprint']);
    expect(validateSosSettings(settings({ volumeTrigger: false, voiceTrigger: true }), 5)).toEqual(['trigger', 'voiceprint']);
    expect(validateSosSettings(settings({ callbackNumber: 'abc' }), 5)).toEqual(['callbackNumber']);
    expect(validateSosSettings(settings(), 1)).toEqual(['tooManyContacts']);
  });
});

describe('SOS messages', () => {
  it('fills the contact SMS with a map link, or says the position is unknown', () => {
    const tpl = sosSmsTemplate('en', 'Amina');
    expect(fillSosTemplate(tpl, 'en', { lat: 3.866667, lng: 11.516667, accuracy: 12.4 }, '21:04')).toBe(
      'SOS from Amina: I am in danger and need help now. Location: https://maps.google.com/?q=3.86667,11.51667 (+/-12 m). Time: 21:04. (automatic alert)',
    );
    expect(fillSosTemplate(sosSmsTemplate('fr', ''), 'fr', undefined, '21:04')).toBe(
      "SOS : je suis en danger, j'ai besoin d'aide maintenant. Position indisponible. Heure : 21:04. (alerte automatique)",
    );
    expect(sosSmsTemplate('en', 'A{location}B')).toContain('SOS from AlocationB:');
    expect(mapLink({ lat: 3.8, lng: 11.5 })).toBe('https://maps.google.com/?q=3.80000,11.50000');
  });

  it('round-trips the coded gateway SMS and rejects malformed ones', () => {
    const area = { region: 'CE', department: 'MFO', arrondissement: 'YDE3' };
    const geo = { lat: 3.86667, lng: 11.51667, accuracy: 25 };
    const sms = encodeSosSms(area, geo);
    expect(sms).toBe('S1 CE MFO YDE3 3.86667,11.51667,25');
    expect(sms).not.toMatch(/sos|help|aide/i);
    expect(decodeSosSms(sms)).toEqual({ location: area, geo });
    expect(decodeSosSms('S1 - - - -')).toEqual({ location: {} });
    expect(decodeSosSms('S1 AD VIN - 7.3,13.58')).toEqual({ location: { region: 'AD', department: 'VIN' }, geo: { lat: 7.3, lng: 13.58 } });
    for (const bad of ['R1 CE MFO YDE3 -', 'S1 ZZ - - -', 'S1 CE WOU - -', 'S1 - - YDE3 -', 'S1 CE MFO YDE3 95,11', 'S1 CE MFO YDE3 x,y', 'S1 CE']) {
      expect(decodeSosSms(bad)).toBeNull();
    }
  });
});

describe('voice trigger', () => {
  it('accepts only the phrase words (any order, repeats), ignoring accents and punctuation', () => {
    expect(matchesPhrase('Please, help me!', VOICE_PHRASES.en)).toBe(true);
    expect(matchesPhrase('[unk] please help me please help me', VOICE_PHRASES.en)).toBe(true);
    // Heard on a real phone (Samsung S22, accented English) for "Please, help me".
    expect(matchesPhrase('help help me please', VOICE_PHRASES.en)).toBe(true);
    expect(matchesPhrase('please help me carry this', VOICE_PHRASES.en)).toBe(false);
    expect(matchesPhrase('please help me with the dishes', VOICE_PHRASES.en)).toBe(false);
    expect(matchesPhrase('please help me [unk] [unk]', VOICE_PHRASES.en)).toBe(false);
    expect(matchesPhrase('please tell me', VOICE_PHRASES.en)).toBe(false);
    expect(matchesPhrase('help me', VOICE_PHRASES.en)).toBe(false);
    expect(matchesPhrase('aidez-moi s’il vous plait', VOICE_PHRASES.fr)).toBe(true);
    expect(matchesPhrase('aidez moi', VOICE_PHRASES.fr)).toBe(false);
    expect(matchesPhrase('', VOICE_PHRASES.en)).toBe(false);
  });

  it('builds a normalised voiceprint and rejects inconsistent enrolments', () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    const same = [[1, 0.1, 0], [0.9, 0.2, 0], [1, 0, 0.1]];
    const vp = averageVoiceprint(same);
    expect(Math.hypot(...vp)).toBeCloseTo(1);
    expect(cosineSimilarity(vp, [1, 0, 0])).toBeGreaterThan(0.95);
    expect(assessEnrollment(same, 3, 0.5).ok).toBe(true);
    expect(assessEnrollment(same.slice(0, 2), 3, 0.5)).toMatchObject({ ok: false, reason: 'too_few' });
    expect(assessEnrollment([[1, 0], [0, 1], [1, 0]], 3, 0.5)).toMatchObject({ ok: false, reason: 'inconsistent' });
    expect(assessEnrollment([[1, 0], [1, 0, 0], [1, 0]], 3, 0.5)).toMatchObject({ ok: false, reason: 'dimension' });
  });
});

describe('native service configuration', () => {
  it('carries contacts, call chain, templates and the gateway prefix, skipping placeholder numbers', () => {
    const cfg = buildNativeSosConfig(settings({ shareLocation: true, callbackNumber: '699 00 00 00' }), 'en', OPTIONS);
    expect(cfg.sms.recipients).toEqual(['699112233', '+237677001122']);
    expect(cfg.calls).toEqual(['699112233', '+237677001122', '1166']);
    expect(cfg.sms.gatewayNumber).toBeUndefined();
    expect(cfg.sms.gatewayPrefix).toBe('S1 CE MFO YDE3');
    expect(cfg.sms.text).toContain('{location}');
    expect(cfg.location.enabled).toBe(true);
    expect(cfg.alert.callbackNumber).toBe('699000000');
    expect(cfg.voice).toBeUndefined();
    expect(cfg.triggers).toEqual({ volume: true, voice: false });
    expect(buildNativeSosConfig(settings(), 'en', { ...OPTIONS, gateway: { number: '8080', isPlaceholder: false } }).sms.gatewayNumber).toBe('8080');
  });

  it('leaves out an implausible call-back number so the platform never rejects the alert', () => {
    expect(safeCallbackNumber('699 00 00 00')).toBe('699000000');
    expect(safeCallbackNumber('1234567')).toBeUndefined();
    expect(safeCallbackNumber(undefined)).toBeUndefined();
    expect(buildNativeSosConfig(settings({ callbackNumber: '1234567' }), 'en', OPTIONS).alert.callbackNumber).toBeUndefined();
  });

  it('enables voice only with an enrolled voiceprint, in the enrolment language', () => {
    const voiceprint = { lang: 'fr' as const, vector: [0.6, 0.8], samples: 3, enrolledAt: '2026-10-24T00:00:00Z' };
    const cfg = buildNativeSosConfig(settings({ voiceTrigger: true, voiceprint }), 'en', OPTIONS);
    expect(cfg.triggers.voice).toBe(true);
    expect(cfg.voice?.phrases).toEqual(VOICE_PHRASES.fr);
    expect(cfg.voice?.grammar).toContain(VOICE_PHRASES.fr[0]);
    expect(cfg.voice?.grammar).toContain('[unk]');
    expect(cfg.voice?.voiceprint).toEqual([0.6, 0.8]);
    expect(buildNativeSosConfig(settings({ voiceTrigger: true }), 'en', OPTIONS).triggers.voice).toBe(false);
  });
});

describe('SOS alert validation and routing permissions', () => {
  const alert: SosAlert = {
    alertId: '3f2b8c1e-1111-4a5b-9c1d-000000000001',
    triggeredAt: '2026-10-24T00:00:00.000Z',
    source: 'volume',
    location: { region: 'CE' },
    geo: { lat: 3.8, lng: 11.5, accuracy: 20 },
    contactsNotified: 2,
  };

  it('accepts well-formed alerts and rejects tampered ones', () => {
    expect(isValidSosAlert(alert)).toBe(true);
    expect(isValidSosAlert({ ...alert, geo: undefined, callbackNumber: '+237699000000' })).toBe(true);
    expect(isValidSosAlert({ ...alert, alertId: '../x' })).toBe(false);
    expect(isValidSosAlert({ ...alert, source: 'sms' })).toBe(false);
    expect(isValidSosAlert({ ...alert, geo: { lat: 200, lng: 0 } })).toBe(false);
    expect(isValidSosAlert({ ...alert, location: { region: '<script>' } })).toBe(false);
    expect(isValidSosAlert({ ...alert, callbackNumber: 'call me' })).toBe(false);
    expect(isValidSosAlert(null)).toBe(false);
  });

  it('routes alerts to police, gendarmerie, MINPROFF and the helpline only', () => {
    expect(['police', 'gendarmerie', 'minproff', 'helpline'].every((r) => can(r as never, 'sos.respond'))).toBe(true);
    expect(can('health', 'sos.respond')).toBe(false);
    expect(can('justice', 'sos.respond')).toBe(false);
  });
});
