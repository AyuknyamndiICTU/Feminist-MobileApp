/**
 * Bridge between the SOS settings and the Android trigger service (modules/sos-trigger).
 * iOS, the web build and Expo Go have no background triggers: they get the in-app fallback
 * (pre-filled SMS composer, then a call to the hotline).
 */
import Constants from 'expo-constants';
import * as SMS from 'expo-sms';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import SosTrigger, { type VoiceSample } from '../../modules/sos-trigger';
import { CONFIG } from '../config';
import {
  buildNativeSosConfig,
  fillSosTemplate,
  isValidSosAlert,
  normalizePhone,
  safeCallbackNumber,
  sosSmsTemplate,
  VOICE_GRAMMAR,
  type NativeSosConfig,
  type SosAlert,
  type SosSettings,
} from '../domain/sos';
import type { Lang } from '../domain/types';
import { callNumber } from '../lib/device';
import { withoutAutoLock } from '../lib/autoLock';
import type { LocalRepository } from './repository';

export const sosNative = Platform.OS === 'android' ? SosTrigger : null;
export const handsFreeSupported = sosNative !== null;

export type SosPermission = 'sms' | 'call' | 'phoneState' | 'mic' | 'location';

const P = PermissionsAndroid.PERMISSIONS;
const ANDROID: Record<SosPermission, Permission[]> = {
  sms: [P.SEND_SMS],
  call: [P.CALL_PHONE],
  phoneState: [P.READ_PHONE_STATE],
  mic: [P.RECORD_AUDIO],
  location: [P.ACCESS_FINE_LOCATION, P.ACCESS_COARSE_LOCATION],
};

export function requiredPermissions(s: Pick<SosSettings, 'voiceTrigger' | 'shareLocation'>): SosPermission[] {
  const list: SosPermission[] = ['sms', 'call', 'phoneState'];
  if (s.voiceTrigger) list.push('mic');
  if (s.shareLocation) list.push('location');
  return list;
}

export type PermissionState = Partial<Record<SosPermission, boolean>>;

export async function checkPermissions(list: SosPermission[]): Promise<PermissionState> {
  const out: PermissionState = {};
  if (Platform.OS !== 'android') return out;
  for (const p of list) {
    const results = await Promise.all(ANDROID[p].map((perm) => PermissionsAndroid.check(perm)));
    out[p] = results.some(Boolean);
  }
  return out;
}

export async function requestPermissions(list: SosPermission[]): Promise<PermissionState> {
  if (Platform.OS !== 'android') return {};
  const res = await withoutAutoLock(() => PermissionsAndroid.requestMultiple(list.flatMap((p) => ANDROID[p])));
  const out: PermissionState = {};
  for (const p of list) out[p] = ANDROID[p].some((perm) => res[perm] === PermissionsAndroid.RESULTS.GRANTED);
  return out;
}

export function voiceModels(lang: Lang) {
  return { model: CONFIG.sos.voiceModels[lang], speaker: CONFIG.sos.voiceModels.speaker };
}

export function nativeConfigFor(s: SosSettings, lang: Lang): NativeSosConfig {
  const voiceLang = s.voiceprint?.lang ?? lang;
  const o = CONFIG.sos;
  return buildNativeSosConfig(s, lang, {
    hotline: o.hotline,
    gateway: o.gateway,
    apiUrl: o.apiUrl,
    pressCount: o.pressCount,
    pressWindowMs: o.pressWindowMs,
    graceMs: o.graceMs,
    locationTimeoutMs: o.locationTimeoutMs,
    testModeMs: o.testModeMs,
    voiceThreshold: o.voice.threshold,
    voiceMinFrames: o.voice.minFrames,
    voiceModel: o.voiceModels[voiceLang].name,
    speakerModel: o.voiceModels.speaker.name,
    // Same innocuous name as the launcher entry, so the background notification fits the disguise.
    notification: { title: Constants.expoConfig?.name ?? 'Calculator', text: '' },
  });
}

/** Pushes the settings to the service and arms or disarms it. Call while the app is in the foreground. */
export async function applySosSettings(s: SosSettings, lang: Lang): Promise<boolean> {
  if (!sosNative) return false;
  await sosNative.configure(JSON.stringify(nativeConfigFor(s, lang)));
  if (s.armed && s.contacts.length > 0) {
    await sosNative.arm();
    return true;
  }
  await sosNative.disarm();
  return false;
}

/** Moves alerts recorded by the background service into the app's encrypted outbox. */
export async function collectNativeAlerts(repo: LocalRepository): Promise<number> {
  if (!sosNative) return 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await sosNative.takePendingAlerts());
  } catch {
    return 0;
  }
  const alerts = Array.isArray(parsed) ? parsed.filter(isValidSosAlert) : [];
  await repo.enqueueSosAlerts(alerts);
  return alerts.length;
}

export function voiceModelsReady(lang: Lang): boolean {
  if (!sosNative) return false;
  const { model, speaker } = voiceModels(lang);
  return sosNative.isModelReady(model.name) && sosNative.isModelReady(speaker.name);
}

export async function downloadVoiceModels(lang: Lang): Promise<void> {
  if (!sosNative) throw new Error('unsupported');
  const { model, speaker } = voiceModels(lang);
  for (const m of [speaker, model]) {
    if (!sosNative.isModelReady(m.name)) await sosNative.downloadModel(m.name, m.url, m.sha256);
  }
}

export function recordVoiceSample(lang: Lang): Promise<VoiceSample> {
  if (!sosNative) return Promise.reject(new Error('unsupported'));
  const { model, speaker } = voiceModels(lang);
  return sosNative.recordVoiceSample(model.name, speaker.name, CONFIG.sos.voice.sampleTimeoutMs, JSON.stringify(VOICE_GRAMMAR[lang]));
}

function clock(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type SosSendResult = 'native' | 'fallback' | 'hotline';

/**
 * In-app SOS (after the on-screen countdown). On Android the service sends the SMS and runs the
 * call chain itself; elsewhere the user confirms a pre-filled SMS, then the hotline is called.
 */
export async function sendSosNow(s: SosSettings, lang: Lang, repo: LocalRepository, newId: () => string): Promise<SosSendResult> {
  if (s.contacts.length === 0) {
    callNumber(CONFIG.sos.hotline);
    return 'hotline';
  }
  if (sosNative) {
    let perms = await checkPermissions(['sms', 'call']);
    if (!perms.sms || !perms.call) perms = await requestPermissions(['sms', 'call', 'phoneState']);
    if (perms.sms && perms.call) {
      await sosNative.configure(JSON.stringify(nativeConfigFor(s, lang)));
      await sosNative.trigger('button', true);
      return 'native';
    }
  }
  const alert: SosAlert = {
    alertId: newId(),
    triggeredAt: new Date().toISOString(),
    source: 'button',
    location: s.homeArea,
    callbackNumber: safeCallbackNumber(s.callbackNumber),
    contactsNotified: s.contacts.length,
  };
  await repo.enqueueSosAlerts([alert]);
  if (await SMS.isAvailableAsync().catch(() => false)) {
    const text = fillSosTemplate(sosSmsTemplate(lang, s.senderName), lang, undefined, clock());
    await SMS.sendSMSAsync(s.contacts.map((c) => normalizePhone(c.phone)), text).catch(() => undefined);
  }
  callNumber(CONFIG.sos.hotline);
  return 'fallback';
}
