import { DEFAULT_SOS_SETTINGS, type SosAlert, type SosSettings } from '../domain/sos';
import type { PlanId, Provider } from '../domain/subscription';
import type { CaseRecord, CitizenReport, Lang } from '../domain/types';
import type { EncryptedStore } from './encryptedStore';

export interface DeviceSettings {
  lang: Lang;
  simulateOffline: boolean;
}

const DEFAULT_SETTINGS: DeviceSettings = { lang: 'fr', simulateOffline: false };

/** On-device data (encrypted at rest). Collections are small, so whole-document writes are fine. */
export class LocalRepository {
  constructor(private readonly store: EncryptedStore) {}

  listCases(): Promise<CaseRecord[]> {
    return this.store.get<CaseRecord[]>('cases', []);
  }

  async getCase(localId: string): Promise<CaseRecord | undefined> {
    return (await this.listCases()).find((c) => c.localId === localId);
  }

  async upsertCase(record: CaseRecord): Promise<void> {
    const all = await this.listCases();
    const i = all.findIndex((c) => c.localId === record.localId);
    if (i >= 0) all[i] = record;
    else all.unshift(record);
    await this.store.set('cases', all);
  }

  async deleteCase(localId: string): Promise<void> {
    await this.store.set('cases', (await this.listCases()).filter((c) => c.localId !== localId));
  }

  listReports(): Promise<CitizenReport[]> {
    return this.store.get<CitizenReport[]>('reports', []);
  }

  async upsertReport(report: CitizenReport): Promise<void> {
    const all = await this.listReports();
    const i = all.findIndex((r) => r.localId === report.localId);
    if (i >= 0) all[i] = report;
    else all.unshift(report);
    await this.store.set('reports', all);
  }

  async getSettings(): Promise<DeviceSettings> {
    return { ...DEFAULT_SETTINGS, ...(await this.store.get<Partial<DeviceSettings>>('settings', {})) };
  }

  async saveSettings(settings: DeviceSettings): Promise<void> {
    await this.store.set('settings', settings);
  }

  /** Emergency contacts and the voiceprint are personal data: encrypted like everything else. */
  async getSosSettings(): Promise<SosSettings> {
    return { ...DEFAULT_SOS_SETTINGS, ...(await this.store.get<Partial<SosSettings>>('sos', {})) };
  }

  async saveSosSettings(settings: SosSettings): Promise<void> {
    await this.store.set('sos', settings);
  }

  listSosOutbox(): Promise<SosAlert[]> {
    return this.store.get<SosAlert[]>('sosOutbox', []);
  }

  async enqueueSosAlerts(alerts: SosAlert[]): Promise<void> {
    if (alerts.length === 0) return;
    const all = await this.listSosOutbox();
    for (const a of alerts) if (!all.some((x) => x.alertId === a.alertId)) all.push(a);
    await this.store.set('sosOutbox', all);
  }

  /** Data minimisation: an alert (with its GPS position) leaves the phone once delivered. */
  async removeSosAlert(alertId: string): Promise<void> {
    await this.store.set('sosOutbox', (await this.listSosOutbox()).filter((a) => a.alertId !== alertId));
  }

  /* ---------- SafeHer Premium ---------- */

  async getSubscriptionCache(): Promise<SubscriptionCache> {
    return { ...EMPTY_SUBSCRIPTION, ...(await this.store.get<Partial<SubscriptionCache>>('subscription', {})) };
  }

  async saveSubscriptionCache(cache: SubscriptionCache): Promise<void> {
    await this.store.set('subscription', cache);
  }

  listVault(): Promise<VaultEntry[]> {
    return this.store.get<VaultEntry[]>('vault', []);
  }

  async upsertVaultEntry(entry: VaultEntry): Promise<void> {
    const all = await this.listVault();
    const i = all.findIndex((e) => e.id === entry.id);
    if (i >= 0) all[i] = entry;
    else all.unshift(entry);
    await this.store.set('vault', all);
  }

  async deleteVaultEntry(id: string): Promise<void> {
    await this.store.set('vault', (await this.listVault()).filter((e) => e.id !== id));
  }

  async getPremiumPrefs(): Promise<PremiumPrefs> {
    return { ...DEFAULT_PREMIUM_PREFS, ...(await this.store.get<Partial<PremiumPrefs>>('premiumPrefs', {})) };
  }

  async savePremiumPrefs(prefs: PremiumPrefs): Promise<void> {
    await this.store.set('premiumPrefs', prefs);
  }

  wipe(): Promise<void> {
    return this.store.clearAll();
  }
}

/** Latest signed entitlement and the clock watermark used to detect a phone clock set back. */
export interface SubscriptionCache {
  entitlement?: string;
  maxSeenTime: number;
  /** Unredeemed SafeHer Plus code for a loved one. */
  familyCode?: string;
  /** For one-tap renewal ("quick renew"); stays encrypted on the phone. */
  lastProvider?: Provider;
  lastMsisdn?: string;
  lastPlanId?: PlanId;
  /** Expiry for which the "plan ended" dialog was already shown. */
  expiredNoticeFor?: number;
  /** In-app payment awaiting approval, re-checked when the app is opened again. */
  pendingPaymentId?: string;
}

const EMPTY_SUBSCRIPTION: SubscriptionCache = { maxSeenTime: 0 };

export type VaultCategory = 'physical' | 'verbal' | 'threat' | 'economic' | 'sexual' | 'other';

/** Evidence vault entry: stays on the phone, sealed with the device key like all other data. */
export interface VaultEntry {
  id: string;
  createdAt: string;
  incidentDate: string;
  category: VaultCategory;
  description: string;
  place?: string;
  witnesses?: string;
}

export interface PremiumPrefs {
  fakeCallerName: string;
  fakeCallDelaySec: number;
  counsellingRequests: string[];
}

const DEFAULT_PREMIUM_PREFS: PremiumPrefs = { fakeCallerName: 'Maman', fakeCallDelaySec: 10, counsellingRequests: [] };
