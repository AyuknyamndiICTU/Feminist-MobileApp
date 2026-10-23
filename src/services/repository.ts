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

  wipe(): Promise<void> {
    return this.store.clearAll();
  }
}
