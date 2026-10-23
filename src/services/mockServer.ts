/**
 * In-device mock of the national platform so the prototype runs end-to-end without a backend.
 * It enforces the same rules the real API gateway must enforce (role checks, regional scoping,
 * idempotent case registration, PII minimisation). Production auth is OIDC, not demo PINs.
 */
import { can, canSetStatus } from '../domain/permissions';
import type {
  AgentSession,
  CitizenReport,
  ProcedureEvent,
  ProcedureStatus,
  RegisterRecord,
  ServerCitizenReport,
} from '../domain/types';
import { ApiError, NetworkError, type NisApi, type ReportReceipt, type ReportStatus } from './api';
import type { EncryptedStore } from './encryptedStore';

export const DEMO_AGENTS = [
  { agentId: 'POL-001', pin: '1234', displayName: 'Police officer (demo)', role: 'police', facility: 'Commissariat – Yaoundé I (demo)', region: 'CE' },
  { agentId: 'GEN-001', pin: '1234', displayName: 'Gendarme (demo)', role: 'gendarmerie', facility: 'Brigade – Mora (demo)', region: 'EN' },
  { agentId: 'JUS-001', pin: '1234', displayName: 'Court clerk (demo)', role: 'justice', facility: 'Tribunal de Première Instance – Yaoundé (demo)', region: 'CE' },
  { agentId: 'MIN-001', pin: '1234', displayName: 'MINPROFF social worker (demo)', role: 'minproff', facility: 'Délégation MINPROFF – Mfoundi (demo)', region: 'CE' },
  { agentId: 'HEA-001', pin: '1234', displayName: 'Health worker (demo)', role: 'health', facility: 'Hôpital régional – Bertoua (demo)', region: 'ES' },
  { agentId: 'HLP-001', pin: '1234', displayName: 'Helpline counsellor (demo)', role: 'helpline', facility: 'Centre d’appel 1166 (demo)', region: 'CE' },
] as const;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface MockServerDeps {
  store: EncryptedStore;
  isOnline: () => boolean;
  randomBytes: (n: number) => Uint8Array;
  now?: () => Date;
  latencyMs?: number;
}

function mergeHistory(a: ProcedureEvent[], b: ProcedureEvent[]): ProcedureEvent[] {
  const seen = new Map<string, ProcedureEvent>();
  for (const e of [...a, ...b]) seen.set(`${e.at}|${e.status}|${e.byAgent}`, e);
  return [...seen.values()].sort((x, y) => x.at.localeCompare(y.at));
}

export class MockNisServer implements NisApi {
  private readonly now: () => Date;

  constructor(private readonly deps: MockServerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async call(): Promise<void> {
    if (!this.deps.isOnline()) throw new NetworkError();
    if (this.deps.latencyMs) await new Promise((r) => setTimeout(r, this.deps.latencyMs));
  }

  private reports() { return this.deps.store.get<ServerCitizenReport[]>('reports', []); }
  private register() { return this.deps.store.get<RegisterRecord[]>('register', []); }

  private trackingCode(): string {
    const bytes = this.deps.randomBytes(8);
    const chars = Array.from(bytes, (b) => CODE_ALPHABET[b & 31]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  }

  private async nextCaseNumber(region: string): Promise<string> {
    const year = this.now().getFullYear();
    const seq = await this.deps.store.get<Record<string, number>>('seq', {});
    const key = `${region}-${year}`;
    seq[key] = (seq[key] ?? 0) + 1;
    await this.deps.store.set('seq', seq);
    return `CM-${region}-${year}-${String(seq[key]).padStart(6, '0')}`;
  }

  async login(agentId: string, pin: string): Promise<AgentSession> {
    await this.call();
    const agent = DEMO_AGENTS.find((a) => a.agentId === agentId.trim().toUpperCase());
    if (!agent || agent.pin !== pin) throw new ApiError('unauthorized');
    const token = Array.from(this.deps.randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
    const { pin: _omit, ...profile } = agent;
    return { ...profile, token, signedInAt: this.now().toISOString() };
  }

  async submitCitizenReport(report: CitizenReport): Promise<ReportReceipt> {
    await this.call();
    if (!report.consentToShare) throw new ApiError('invalid', 'consent required');
    const all = await this.reports();
    const existing = all.find((r) => r.localId === report.localId);
    if (existing) return { trackingCode: existing.trackingCode, receivedAt: existing.receivedAt };
    const { outbox: _o, ...rest } = report;
    const rec: ServerCitizenReport = { ...rest, trackingCode: this.trackingCode(), receivedAt: this.now().toISOString(), status: 'RECEIVED' };
    all.unshift(rec);
    await this.deps.store.set('reports', all);
    return { trackingCode: rec.trackingCode, receivedAt: rec.receivedAt };
  }

  async getReportStatus(trackingCode: string): Promise<ReportStatus | null> {
    await this.call();
    const r = (await this.reports()).find((x) => x.trackingCode === trackingCode.trim().toUpperCase());
    return r ? { status: r.status, firstResponseAt: r.firstResponseAt, linkedCaseNumber: r.linkedCaseNumber } : null;
  }

  private assert(session: AgentSession, ok: boolean): void {
    if (!session?.token) throw new ApiError('unauthorized');
    if (!ok) throw new ApiError('forbidden');
  }

  private inScope(session: AgentSession, r: ServerCitizenReport): boolean {
    return session.role === 'helpline' || r.location.region === session.region;
  }

  async listReportsForVerification(session: AgentSession): Promise<ServerCitizenReport[]> {
    await this.call();
    this.assert(session, can(session.role, 'report.verify'));
    return (await this.reports()).filter(
      (r) => this.inScope(session, r) && (r.status === 'RECEIVED' || r.status === 'UNDER_VERIFICATION'),
    );
  }

  private async updateReport(
    session: AgentSession,
    trackingCode: string,
    patch: (r: ServerCitizenReport) => void,
  ): Promise<ServerCitizenReport> {
    await this.call();
    this.assert(session, can(session.role, 'report.verify'));
    const all = await this.reports();
    const r = all.find((x) => x.trackingCode === trackingCode);
    if (!r || !this.inScope(session, r)) throw new ApiError('not_found');
    r.firstResponseAt ??= this.now().toISOString();
    r.handledBy = session.agentId;
    patch(r);
    await this.deps.store.set('reports', all);
    return r;
  }

  acknowledgeReport(session: AgentSession, trackingCode: string) {
    return this.updateReport(session, trackingCode, (r) => { r.status = 'UNDER_VERIFICATION'; });
  }

  closeReport(session: AgentSession, trackingCode: string, outcome: 'VERIFIED' | 'NOT_CONFIRMED', linkedCaseNumber?: string) {
    return this.updateReport(session, trackingCode, (r) => {
      r.status = outcome;
      if (linkedCaseNumber) r.linkedCaseNumber = linkedCaseNumber;
    });
  }

  async pushCase(session: AgentSession, record: RegisterRecord) {
    await this.call();
    this.assert(session, can(session.role, 'case.create') && record.institution === session.role);
    const all = await this.register();
    let stored = all.find((r) => r.localId === record.localId);
    if (stored) {
      const history = mergeHistory(stored.history, record.history);
      Object.assign(stored, record, { caseNumber: stored.caseNumber, history });
      stored.procedureStatus = history[history.length - 1]?.status ?? stored.procedureStatus;
    } else {
      stored = { ...record, caseNumber: await this.nextCaseNumber(record.location.region ?? 'XX') };
      all.push(stored);
    }
    await this.deps.store.set('register', all);
    if (record.sourceReportId) await this.linkReport(record.sourceReportId, stored.caseNumber!, session.agentId);
    return { caseNumber: stored.caseNumber!, record: stored };
  }

  private async linkReport(trackingCode: string, caseNumber: string, agentId: string): Promise<void> {
    const all = await this.reports();
    const r = all.find((x) => x.trackingCode === trackingCode);
    if (!r) return;
    r.status = 'VERIFIED';
    r.linkedCaseNumber = caseNumber;
    r.firstResponseAt ??= this.now().toISOString();
    r.handledBy ??= agentId;
    await this.deps.store.set('reports', all);
  }

  async lookupCase(session: AgentSession, caseNumber: string): Promise<RegisterRecord> {
    await this.call();
    this.assert(session, true);
    const r = (await this.register()).find((x) => x.caseNumber === caseNumber.trim().toUpperCase());
    if (!r) throw new ApiError('not_found');
    return r;
  }

  async appendProcedureEvent(session: AgentSession, caseNumber: string, status: ProcedureStatus) {
    await this.call();
    this.assert(session, canSetStatus(session.role, status));
    const all = await this.register();
    const r = all.find((x) => x.caseNumber === caseNumber.trim().toUpperCase());
    if (!r) throw new ApiError('not_found');
    const at = this.now().toISOString();
    r.history = mergeHistory(r.history, [{ at, status, byAgent: session.agentId, institution: session.role }]);
    r.procedureStatus = status;
    r.updatedAt = at;
    await this.deps.store.set('register', all);
    return r;
  }

  async fetchRegister(session: AgentSession): Promise<RegisterRecord[]> {
    await this.call();
    this.assert(session, true);
    return this.register();
  }

  async fetchAllReports(session: AgentSession): Promise<ServerCitizenReport[]> {
    await this.call();
    this.assert(session, true);
    return (await this.reports()).map(({ safeContact: _c, details: _d, ...rest }) => rest);
  }

  wipe(): Promise<void> {
    return this.deps.store.clearAll();
  }
}
