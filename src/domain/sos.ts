/**
 * Hands-free SOS: pure rules shared by the settings screen, the Android trigger service
 * configuration and the national SMS gateway decoder. No React and no device APIs here.
 *
 * Coded gateway SMS: S1 <region|-> <department|-> <arrondissement|-> <lat,lng[,accuracy]|->
 * Example: "S1 CE MFO YDE3 3.86670,11.51670,25" (no word revealing the purpose).
 */
import { findDepartment, findRegion } from './geography';
import type { Bilingual, Lang, Location } from './types';
import { isPlausiblePhone } from './validation';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

/** Averaged, L2-normalised x-vector of the user's enrolled phrase. Biometric data: never leaves the phone. */
export interface Voiceprint {
  lang: Lang;
  vector: number[];
  samples: number;
  enrolledAt: string;
}

export interface SosSettings {
  /** The user turned the background triggers on (Android only). */
  armed: boolean;
  volumeTrigger: boolean;
  voiceTrigger: boolean;
  shareLocation: boolean;
  senderName: string;
  callbackNumber: string;
  /** Usual area, so the alert can be routed to the right command when GPS is off. */
  homeArea: Location;
  contacts: EmergencyContact[];
  voiceprint?: Voiceprint;
}

export const DEFAULT_SOS_SETTINGS: SosSettings = {
  armed: false,
  volumeTrigger: true,
  voiceTrigger: false,
  shareLocation: false,
  senderName: '',
  callbackNumber: '',
  homeArea: {},
  contacts: [],
};

export type SosSource = 'volume' | 'voice' | 'button';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy?: number;
}

/** What the national platform receives (Layer 4 → police, gendarmerie, MINPROFF, helpline). */
export interface SosAlert {
  alertId: string;
  triggeredAt: string;
  source: SosSource;
  location: Location;
  geo?: GeoFix;
  callbackNumber?: string;
  contactsNotified: number;
}

export type SosAlertStatus = 'NEW' | 'ACKNOWLEDGED';

export interface ServerSosAlert extends SosAlert {
  receivedAt: string;
  status: SosAlertStatus;
  handledBy?: string;
  acknowledgedAt?: string;
}

const SOURCES: SosSource[] = ['volume', 'voice', 'button'];
const isCode = (v: unknown) => v === undefined || (typeof v === 'string' && /^[A-Z0-9]{1,8}$/.test(v));

/** System-boundary check for alerts arriving from the native outbox or the network. */
export function isValidSosAlert(a: unknown): a is SosAlert {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  if (typeof x.alertId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(x.alertId)) return false;
  if (typeof x.triggeredAt !== 'string' || Number.isNaN(Date.parse(x.triggeredAt))) return false;
  if (!SOURCES.includes(x.source as SosSource)) return false;
  if (typeof x.contactsNotified !== 'number' || x.contactsNotified < 0 || x.contactsNotified > 50) return false;
  const loc = x.location as Record<string, unknown> | undefined;
  if (typeof loc !== 'object' || loc === null) return false;
  if (!isCode(loc.region) || !isCode(loc.department) || !isCode(loc.arrondissement)) return false;
  if (x.callbackNumber !== undefined && (typeof x.callbackNumber !== 'string' || !isPlausiblePhone(x.callbackNumber))) return false;
  if (x.geo !== undefined) {
    const g = x.geo as Record<string, unknown>;
    if (typeof g !== 'object' || g === null || typeof g.lat !== 'number' || typeof g.lng !== 'number') return false;
    if (Math.abs(g.lat) > 90 || Math.abs(g.lng) > 180) return false;
    if (g.accuracy !== undefined && (typeof g.accuracy !== 'number' || g.accuracy < 0)) return false;
  }
  return true;
}

/**
 * Phrases accepted by the voice trigger. Recognition uses the full model vocabulary (not a tiny
 * grammar, which forces look-alike sentences onto the phrase), then the whole utterance must match.
 */
export const VOICE_PHRASES: Record<Lang, string[]> = {
  en: ['please help me'],
  fr: ["aidez moi s'il vous plaît"],
};

export const VOICE_PHRASE_LABEL: Bilingual = { en: '“Please, help me”', fr: '« Aidez-moi, s’il vous plaît »' };

export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s.()-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

/** The optional call-back number, only if plausible: a typo must never make an SOS alert invalid. */
export function safeCallbackNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const n = normalizePhone(value);
  return isPlausiblePhone(n) ? n : undefined;
}

export type ContactError = 'name' | 'phone' | 'duplicate';

export function validateContact(c: Pick<EmergencyContact, 'name' | 'phone'>, others: EmergencyContact[] = []): ContactError[] {
  const errors: ContactError[] = [];
  const name = c.name.trim();
  if (name.length === 0 || name.length > 40) errors.push('name');
  const phone = normalizePhone(c.phone);
  if (!isPlausiblePhone(phone)) errors.push('phone');
  else if (others.some((o) => normalizePhone(o.phone) === phone)) errors.push('duplicate');
  return errors;
}

export type SosSettingsError = 'contacts' | 'trigger' | 'voiceprint' | 'callbackNumber' | 'tooManyContacts';

/** Problems that do not stop the SOS from working (the voice trigger waits for enrolment). */
export const NON_BLOCKING_SOS_ERRORS: readonly SosSettingsError[] = ['voiceprint', 'callbackNumber'];

export function validateSosSettings(s: SosSettings, maxContacts: number): SosSettingsError[] {
  const errors: SosSettingsError[] = [];
  if (s.contacts.length === 0) errors.push('contacts');
  if (s.contacts.length > maxContacts) errors.push('tooManyContacts');
  if (!s.volumeTrigger && !(s.voiceTrigger && s.voiceprint)) errors.push('trigger');
  if (s.voiceTrigger && !s.voiceprint) errors.push('voiceprint');
  if (s.callbackNumber && !isPlausiblePhone(normalizePhone(s.callbackNumber))) errors.push('callbackNumber');
  return errors;
}

/** Contacts first (in the user's order), then the hotline. Duplicates are called once. */
export function buildCallChain(contacts: EmergencyContact[], hotline: string): string[] {
  const chain: string[] = [];
  for (const n of [...contacts.map((c) => normalizePhone(c.phone)), hotline]) {
    if (n && !chain.includes(n)) chain.push(n);
  }
  return chain;
}

const SMS_TEMPLATE: Record<Lang, { named: string; anonymous: string; known: string; unknown: string }> = {
  en: {
    named: 'SOS from {name}: I am in danger and need help now. {location} Time: {time}. (automatic alert)',
    anonymous: 'SOS: I am in danger and need help now. {location} Time: {time}. (automatic alert)',
    known: 'Location: https://maps.google.com/?q={lat},{lng} (+/-{acc} m).',
    unknown: 'Location unavailable.',
  },
  fr: {
    named: "SOS de {name} : je suis en danger, j'ai besoin d'aide maintenant. {location} Heure : {time}. (alerte automatique)",
    anonymous: "SOS : je suis en danger, j'ai besoin d'aide maintenant. {location} Heure : {time}. (alerte automatique)",
    known: 'Position : https://maps.google.com/?q={lat},{lng} (+/-{acc} m).',
    unknown: 'Position indisponible.',
  },
};

/** Contacts' SMS with {location} and {time} left for the phone to fill at send time. */
export function sosSmsTemplate(lang: Lang, senderName: string): string {
  const name = senderName.trim().replace(/[{}]/g, '').slice(0, 40);
  return name ? SMS_TEMPLATE[lang].named.replace('{name}', name) : SMS_TEMPLATE[lang].anonymous;
}

export function sosLocationTemplates(lang: Lang): { known: string; unknown: string } {
  return { known: SMS_TEMPLATE[lang].known, unknown: SMS_TEMPLATE[lang].unknown };
}

const fixed = (n: number) => n.toFixed(5);

export function mapLink(geo: GeoFix): string {
  return `https://maps.google.com/?q=${fixed(geo.lat)},${fixed(geo.lng)}`;
}

/** Mirror of the native substitution, used by the in-app fallback and the message preview. */
export function fillSosTemplate(template: string, lang: Lang, geo: GeoFix | undefined, time: string): string {
  const loc = sosLocationTemplates(lang);
  const location = geo
    ? loc.known.replace('{lat}', fixed(geo.lat)).replace('{lng}', fixed(geo.lng)).replace('{acc}', String(Math.round(geo.accuracy ?? 0)))
    : loc.unknown;
  return template.replace('{location}', location).replace('{time}', time);
}

function geoToken(geo?: GeoFix): string {
  if (!geo) return '-';
  const base = `${fixed(geo.lat)},${fixed(geo.lng)}`;
  return geo.accuracy === undefined ? base : `${base},${Math.round(geo.accuracy)}`;
}

/** Gateway message prefix; the phone appends the position token (or "-") at send time. */
export function sosGatewayPrefix(area: Location): string {
  return ['S1', area.region ?? '-', area.department ?? '-', area.arrondissement ?? '-'].join(' ');
}

export function encodeSosSms(area: Location, geo?: GeoFix): string {
  return `${sosGatewayPrefix(area)} ${geoToken(geo)}`;
}

export interface DecodedSosSms {
  location: Location;
  geo?: GeoFix;
}

export function decodeSosSms(text: string): DecodedSosSms | null {
  const parts = text.trim().toUpperCase().split(/\s+/);
  if (parts.length !== 5 || parts[0] !== 'S1') return null;
  const [, region, dept, arr, geo] = parts;
  const location: Location = {};
  if (region !== '-') {
    if (!findRegion(region)) return null;
    location.region = region;
  }
  if (dept !== '-') {
    const d = findDepartment(region, dept);
    if (!d) return null;
    location.department = dept;
    if (arr !== '-') {
      if (!d.arrondissements?.some((a) => a.code === arr)) return null;
      location.arrondissement = arr;
    }
  } else if (arr !== '-') {
    return null;
  }
  if (geo === '-') return { location };
  const nums = geo.split(',').map(Number);
  if (nums.length < 2 || nums.length > 3 || nums.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng, accuracy] = nums;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (accuracy !== undefined && accuracy < 0)) return null;
  return { location, geo: accuracy === undefined ? { lat, lng } : { lat, lng, accuracy } };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n === 0 ? v.slice() : v.map((x) => x / n);
}

/** Mean of the normalised samples, renormalised: a stable voiceprint for cosine scoring. */
export function averageVoiceprint(samples: number[][]): number[] {
  if (samples.length === 0) return [];
  const dim = samples[0].length;
  const sum = new Array<number>(dim).fill(0);
  for (const s of samples.map(normalize)) for (let i = 0; i < dim; i++) sum[i] += s[i];
  return normalize(sum);
}

export interface EnrollmentAssessment {
  ok: boolean;
  reason?: 'too_few' | 'dimension' | 'inconsistent';
  minSimilarity: number;
}

/**
 * Enrollment is accepted only if every pair of samples already matches at the runtime threshold:
 * if the user's own recordings disagree, genuine attempts would be rejected later.
 */
export function assessEnrollment(samples: number[][], minSamples: number, threshold: number): EnrollmentAssessment {
  if (samples.length < minSamples) return { ok: false, reason: 'too_few', minSimilarity: 0 };
  const dim = samples[0].length;
  if (dim === 0 || samples.some((s) => s.length !== dim)) return { ok: false, reason: 'dimension', minSimilarity: 0 };
  let min = 1;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) min = Math.min(min, cosineSimilarity(samples[i], samples[j]));
  }
  return min >= threshold ? { ok: true, minSimilarity: min } : { ok: false, reason: 'inconsistent', minSimilarity: min };
}

/** Lower-case words without accents or punctuation, dropping Vosk's [unk] filler, for phrase comparison. */
export function normalizeUtterance(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/\[unk\]/g, ' ')
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the whole utterance is one of the phrases, possibly repeated ("please help me please
 * help me"). Everyday sentences that merely contain the words ("please help me carry this") do not
 * match, which keeps false alarms from the user's own voice low.
 */
export function matchesPhrase(text: string, phrases: string[]): boolean {
  const words = normalizeUtterance(text).split(' ').filter(Boolean);
  return phrases.some((p) => {
    const target = normalizeUtterance(p).split(' ').filter(Boolean);
    if (target.length === 0 || words.length === 0 || words.length % target.length !== 0) return false;
    return words.every((w, i) => w === target[i % target.length]);
  });
}

export interface NativeSosConfig {
  version: 1;
  triggers: { volume: boolean; voice: boolean };
  pressCount: number;
  pressWindowMs: number;
  graceMs: number;
  vibrate: boolean;
  testModeMs: number;
  sms: { recipients: string[]; text: string; gatewayNumber?: string; gatewayPrefix: string };
  calls: string[];
  location: { enabled: boolean; timeoutMs: number; known: string; unknown: string };
  voice?: {
    model: string;
    speakerModel: string;
    phrases: string[];
    voiceprint: number[];
    threshold: number;
    minFrames: number;
  };
  alert: { location: Location; callbackNumber?: string; apiUrl?: string };
  notification: { title: string; text: string };
}

export interface NativeConfigOptions {
  hotline: string;
  gateway: { number: string; isPlaceholder: boolean };
  apiUrl?: string;
  pressCount: number;
  pressWindowMs: number;
  graceMs: number;
  locationTimeoutMs: number;
  testModeMs: number;
  voiceThreshold: number;
  voiceMinFrames: number;
  voiceModel: string;
  speakerModel: string;
  /** Innocuous text for the persistent Android notification (matches the calculator disguise). */
  notification: { title: string; text: string };
}

/** Everything the background service needs, so it can act without the JavaScript app running. */
export function buildNativeSosConfig(s: SosSettings, lang: Lang, o: NativeConfigOptions): NativeSosConfig {
  const recipients = buildCallChain(s.contacts, '').filter(Boolean);
  const voiceOn = s.voiceTrigger && !!s.voiceprint;
  const voiceLang = s.voiceprint?.lang ?? lang;
  const callback = safeCallbackNumber(s.callbackNumber);
  return {
    version: 1,
    triggers: { volume: s.volumeTrigger, voice: voiceOn },
    pressCount: o.pressCount,
    pressWindowMs: o.pressWindowMs,
    graceMs: o.graceMs,
    vibrate: true,
    testModeMs: o.testModeMs,
    sms: {
      recipients,
      text: sosSmsTemplate(lang, s.senderName),
      gatewayNumber: o.gateway.isPlaceholder ? undefined : o.gateway.number,
      gatewayPrefix: sosGatewayPrefix(s.homeArea),
    },
    calls: buildCallChain(s.contacts, o.hotline),
    location: { enabled: s.shareLocation, timeoutMs: o.locationTimeoutMs, ...sosLocationTemplates(lang) },
    voice: voiceOn
      ? {
          model: o.voiceModel,
          speakerModel: o.speakerModel,
          phrases: VOICE_PHRASES[voiceLang],
          voiceprint: s.voiceprint!.vector,
          threshold: o.voiceThreshold,
          minFrames: o.voiceMinFrames,
        }
      : undefined,
    alert: { location: s.homeArea, callbackNumber: callback, apiUrl: o.apiUrl },
    notification: o.notification,
  };
}
