import { computeIndicators } from '../src/domain/indicators';
import { ApiError, NetworkError } from '../src/services/api';
import { EncryptedStore } from '../src/services/encryptedStore';
import { MockNisServer } from '../src/services/mockServer';
import { LocalRepository } from '../src/services/repository';
import { SyncEngine } from '../src/services/sync';
import type { CitizenReport } from '../src/domain/types';
import { completeCase, fakeCipher, MemoryStore, seqRandom } from './helpers';

function setup() {
  const raw = new MemoryStore();
  let online = true;
  const repo = new LocalRepository(new EncryptedStore(raw, fakeCipher, 'nis:'));
  const api = new MockNisServer({ store: new EncryptedStore(raw, fakeCipher, 'srv:'), isOnline: () => online, randomBytes: seqRandom });
  const sync = new SyncEngine(repo, api);
  return { raw, repo, api, sync, setOnline: (v: boolean) => { online = v; } };
}

const citizenReport = (over: Partial<CitizenReport> = {}): CitizenReport => ({
  localId: 'r-1',
  createdAt: '2026-10-20T08:00:00.000Z',
  forWhom: 'self',
  incidentType: 'PHYSICAL_ASSAULT',
  immediateDanger: false,
  relationship: 'CURRENT_PARTNER',
  location: { region: 'CE', department: 'MFO', arrondissement: 'YDE3' },
  contactPreference: 'call',
  safeContact: '699112233',
  safeTime: 'morning',
  consentToShare: true,
  details: 'secret detail',
  channel: 'app',
  outbox: 'queued',
  ...over,
});

describe('encrypted local storage', () => {
  it('never writes plaintext to the device store', async () => {
    const { raw, repo } = setup();
    await repo.upsertCase(completeCase({ consentToName: true, identity: { victimName: 'Amina' } }));
    const dump = [...raw.data.values()].join('');
    expect(dump).not.toContain('Amina');
    expect((await repo.listCases())[0].identity?.victimName).toBe('Amina');
  });
});

describe('offline-first sync + national register (Layers 1-2)', () => {
  it('queues while offline, then assigns a national case number once online', async () => {
    const { repo, api, sync, setOnline } = setup();
    const police = await api.login('POL-001', '1234');
    setOnline(false);
    await repo.upsertCase(completeCase({ localId: 'c1' }));
    expect(await sync.syncCases(police)).toEqual({ pushed: 0, failed: 0, offline: true });
    expect((await repo.getCase('c1'))?.syncState).toBe('queued');

    setOnline(true);
    expect((await sync.syncCases(police)).pushed).toBe(1);
    const synced = await repo.getCase('c1');
    expect(synced?.syncState).toBe('synced');
    expect(synced?.caseNumber).toMatch(/^CM-CE-\d{4}-000001$/);
  });

  it('is idempotent: re-pushing the same record keeps the same case number', async () => {
    const { repo, api, sync } = setup();
    const police = await api.login('POL-001', '1234');
    await repo.upsertCase(completeCase({ localId: 'c1' }));
    await sync.syncCases(police);
    const first = (await repo.getCase('c1'))!;
    await repo.upsertCase({ ...first, syncState: 'queued' });
    await sync.syncCases(police);
    expect((await repo.getCase('c1'))?.caseNumber).toBe(first.caseNumber);
    expect(await api.fetchRegister(police)).toHaveLength(1);
  });

  it('lets police and justice follow the same case end-to-end', async () => {
    const { repo, api, sync } = setup();
    const police = await api.login('POL-001', '1234');
    const justice = await api.login('JUS-001', '1234');
    await repo.upsertCase(completeCase({
      localId: 'c1',
      history: [{ at: '2026-10-01T10:00:00.000Z', status: 'REPORTED', byAgent: 'POL-001', institution: 'police' }],
    }));
    await sync.syncCases(police);
    const num = (await repo.getCase('c1'))!.caseNumber!;

    await api.appendProcedureEvent(police, num, 'REFERRED_PROSECUTOR');
    await expect(api.appendProcedureEvent(police, num, 'TRIAL')).rejects.toBeInstanceOf(ApiError);
    const rec = await api.appendProcedureEvent(justice, num, 'PROSECUTION_OPEN');
    expect(rec.history.map((h) => h.status)).toEqual(['REPORTED', 'REFERRED_PROSECUTOR', 'PROSECUTION_OPEN']);

    // A later re-push of the police device's stale copy must not erase justice's steps.
    await repo.upsertCase({ ...(await repo.getCase('c1'))!, syncState: 'queued' });
    await sync.syncCases(police);
    const after = await api.lookupCase(justice, num);
    expect(after.procedureStatus).toBe('PROSECUTION_OPEN');
    expect(after.history).toHaveLength(3);
  });

  it('rejects pushes on behalf of another institution', async () => {
    const { repo, api, sync } = setup();
    const health = await api.login('HEA-001', '1234');
    await repo.upsertCase(completeCase({ localId: 'c1', createdBy: 'HEA-001', institution: 'police' }));
    expect((await sync.syncCases(health)).failed).toBe(1);
    expect((await repo.getCase('c1'))?.syncState).toBe('error');
  });

  it('refuses bad credentials and offline login', async () => {
    const { api, setOnline } = setup();
    await expect(api.login('POL-001', '0000')).rejects.toBeInstanceOf(ApiError);
    setOnline(false);
    await expect(api.login('POL-001', '1234')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('citizen report verification (Layer 4 → register)', () => {
  it('delivers, minimises local data, and links the report to the verified case', async () => {
    const { repo, api, sync } = setup();
    await repo.upsertReport(citizenReport());
    await sync.flushCitizenReports();
    const local = (await repo.listReports())[0];
    expect(local.trackingCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(local.safeContact).toBeUndefined();
    expect(local.details).toBeUndefined();

    const police = await api.login('POL-001', '1234');
    const gendarme = await api.login('GEN-001', '1234');
    expect(await api.listReportsForVerification(police)).toHaveLength(1);
    expect(await api.listReportsForVerification(gendarme)).toHaveLength(0);
    await expect(api.listReportsForVerification(await api.login('HEA-001', '1234'))).rejects.toBeInstanceOf(ApiError);

    await api.acknowledgeReport(police, local.trackingCode!);
    await repo.upsertCase(completeCase({ localId: 'c1', sourceReportId: local.trackingCode }));
    await sync.syncCases(police);

    const status = await api.getReportStatus(local.trackingCode!);
    expect(status?.status).toBe('VERIFIED');
    expect(status?.linkedCaseNumber).toBe((await repo.getCase('c1'))?.caseNumber);
    expect(await api.listReportsForVerification(police)).toHaveLength(0);

    const all = await api.fetchAllReports(police);
    expect(JSON.stringify(all)).not.toContain('699112233');
    expect(JSON.stringify(all)).not.toContain('secret detail');
  });

  it('accepts the same report only once', async () => {
    const { api } = setup();
    const a = await api.submitCitizenReport(citizenReport());
    const b = await api.submitCitizenReport(citizenReport());
    expect(b.trackingCode).toBe(a.trackingCode);
  });
});

describe('Chapter 25 indicators', () => {
  it('computes completeness, linkage, coverage and response time', () => {
    const cases = [
      completeCase({ syncState: 'synced', caseNumber: 'CM-CE-2026-000001' }),
      completeCase({ syncState: 'queued', relationship: 'UNKNOWN' }),
      completeCase({ syncState: 'draft' }),
    ];
    const register = [
      { ...cases[0], riskLevel: 'LOW' as const },
      { ...cases[0], location: { region: 'LT', department: 'WOU', arrondissement: 'DLA1' }, riskLevel: 'LOW' as const },
    ];
    const reports = [
      { ...citizenReport(), trackingCode: 'AAAA-BBBB', receivedAt: '2026-10-20T08:00:00.000Z', firstResponseAt: '2026-10-20T11:00:00.000Z', status: 'VERIFIED' as const },
      { ...citizenReport(), trackingCode: 'CCCC-DDDD', receivedAt: '2026-10-20T08:00:00.000Z', status: 'RECEIVED' as const },
    ];
    const ind = computeIndicators(cases, register, reports, new Date('2026-10-22T00:00:00Z'));
    expect(ind.submittedCount).toBe(2);
    expect(ind.completenessRate).toBeCloseTo((1 + 8 / 9) / 2);
    expect(ind.linkedRate).toBe(0.5);
    expect(ind.coveredUnits).toBe(2);
    expect(ind.meanHoursToFirstResponse).toBe(3);
    expect(ind.pendingVerification).toBe(1);
    expect(ind.byIncidentType).toEqual({ PHYSICAL_ASSAULT: '<5' });
  });
});
