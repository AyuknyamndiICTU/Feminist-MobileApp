import type { Cipher } from '../src/services/crypto';
import type { KeyValueStore } from '../src/services/storage';
import type { CaseRecord } from '../src/domain/types';

export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  async getItem(key: string) { return this.data.get(key) ?? null; }
  async setItem(key: string, value: string) { this.data.set(key, value); }
  async removeItem(key: string) { this.data.delete(key); }
  async getAllKeys() { return [...this.data.keys()]; }
}

/** Reversible but non-trivial transform so tests can prove plaintext never reaches the store. */
export const fakeCipher: Cipher = {
  encrypt: async (s) => 'ENC:' + Buffer.from(s, 'utf8').toString('base64'),
  decrypt: async (s) => Buffer.from(s.slice(4), 'base64').toString('utf8'),
};

let counter = 0;
export function seqRandom(n: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (counter++ * 31 + i * 7) & 255);
}

export function completeCase(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    localId: `local-${Math.random().toString(36).slice(2)}`,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'POL-001',
    institution: 'police',
    facility: 'Commissariat – Yaoundé I (demo)',
    incidentDate: '2026-09-30',
    incidentType: 'PHYSICAL_ASSAULT',
    relationship: 'CURRENT_PARTNER',
    location: { region: 'CE', department: 'MFO', arrondissement: 'YDE3' },
    procedureStatus: 'REPORTED',
    victimAgeBand: 'A25_34',
    repeatIncident: 'yes',
    risk: {},
    referrals: [],
    consentToName: false,
    history: [],
    syncState: 'queued',
    ...overrides,
  };
}
