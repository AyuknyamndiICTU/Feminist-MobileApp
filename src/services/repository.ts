import { DEFAULT_SOS_SETTINGS, type SosAlert, type SosSettings } from '../domain/sos';
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

  wipe(): Promise<void> {
    return this.store.clearAll();
  }
}
