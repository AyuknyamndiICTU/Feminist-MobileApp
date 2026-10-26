/**
 * Contract between the mobile app and the national platform (Layer 2 interoperability bus).
 * The prototype ships an in-device mock; production points this at the BUCREP-hosted API gateway.
 */
import type { ServerSosAlert, SosAlert } from '../domain/sos';
import type {
  AgentSession,
  CitizenReport,
  ProcedureStatus,
  RegisterRecord,
  ReportServerStatus,
  ServerCitizenReport,
} from '../domain/types';

export class NetworkError extends Error {
  constructor() {
    super('offline');
    this.name = 'NetworkError';
  }
}

export class ApiError extends Error {
  constructor(public readonly code: 'unauthorized' | 'forbidden' | 'not_found' | 'invalid', message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

export interface ReportReceipt {
  trackingCode: string;
  receivedAt: string;
}

export interface ReportStatus {
  status: ReportServerStatus;
  firstResponseAt?: string;
  linkedCaseNumber?: string;
}

export interface NisApi {
  login(agentId: string, pin: string): Promise<AgentSession>;
  submitCitizenReport(report: CitizenReport): Promise<ReportReceipt>;
  getReportStatus(trackingCode: string): Promise<ReportStatus | null>;
  listReportsForVerification(session: AgentSession): Promise<ServerCitizenReport[]>;
  acknowledgeReport(session: AgentSession, trackingCode: string): Promise<ServerCitizenReport>;
  closeReport(
    session: AgentSession,
    trackingCode: string,
    outcome: 'VERIFIED' | 'NOT_CONFIRMED',
    linkedCaseNumber?: string,
  ): Promise<ServerCitizenReport>;
  pushCase(session: AgentSession, record: RegisterRecord): Promise<{ caseNumber: string; record: RegisterRecord }>;
  lookupCase(session: AgentSession, caseNumber: string): Promise<RegisterRecord>;
  appendProcedureEvent(session: AgentSession, caseNumber: string, status: ProcedureStatus): Promise<RegisterRecord>;
  fetchRegister(session: AgentSession): Promise<RegisterRecord[]>;
  fetchAllReports(session: AgentSession): Promise<ServerCitizenReport[]>;
  /** Hands-free SOS: routed to police, gendarmerie, MINPROFF and the 1166 helpline (idempotent on alertId). */
  submitSosAlert(alert: SosAlert): Promise<{ receivedAt: string }>;
  listSosAlerts(session: AgentSession): Promise<ServerSosAlert[]>;
  acknowledgeSosAlert(session: AgentSession, alertId: string): Promise<ServerSosAlert>;
}
