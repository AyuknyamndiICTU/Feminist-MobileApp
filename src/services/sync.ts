/**
 * Offline-first outbox. Records are always saved locally first; this engine pushes them when a
 * connection exists and keeps them queued otherwise. Only the anonymized register record leaves.
 */
import { toRegisterRecord } from '../domain/anonymize';
import type { AgentSession } from '../domain/types';
import { NetworkError, type NisApi } from './api';
import type { LocalRepository } from './repository';

export interface SyncResult {
  pushed: number;
  failed: number;
  offline: boolean;
}

export class SyncEngine {
  private running: Promise<SyncResult> | null = null;

  constructor(private readonly repo: LocalRepository, private readonly api: NisApi) {}

  /** Concurrent callers share one in-flight run instead of double-posting. */
  syncCases(session: AgentSession): Promise<SyncResult> {
    this.running ??= this.runCases(session).finally(() => { this.running = null; });
    return this.running;
  }

  private async runCases(session: AgentSession): Promise<SyncResult> {
    const result: SyncResult = { pushed: 0, failed: 0, offline: false };
    const pending = (await this.repo.listCases()).filter(
      (c) => (c.syncState === 'queued' || c.syncState === 'error') && c.createdBy === session.agentId,
    );
    for (const c of pending) {
      try {
        const { caseNumber, record } = await this.api.pushCase(session, toRegisterRecord(c));
        await this.repo.upsertCase({
          ...c,
          caseNumber,
          history: record.history,
          procedureStatus: record.procedureStatus,
          syncState: 'synced',
          lastSyncError: undefined,
        });
        result.pushed += 1;
      } catch (e) {
        if (e instanceof NetworkError) { result.offline = true; break; }
        await this.repo.upsertCase({ ...c, syncState: 'error', lastSyncError: (e as Error).message });
        result.failed += 1;
      }
    }
    return result;
  }

  async flushCitizenReports(): Promise<SyncResult> {
    const result: SyncResult = { pushed: 0, failed: 0, offline: false };
    const queued = (await this.repo.listReports()).filter((r) => r.outbox === 'queued');
    for (const r of queued) {
      try {
        const receipt = await this.api.submitCitizenReport(r);
        // Data minimisation: once delivered, the phone keeps only what is needed to follow the report.
        await this.repo.upsertReport({
          ...r,
          outbox: 'sent',
          trackingCode: receipt.trackingCode,
          safeContact: undefined,
          details: undefined,
        });
        result.pushed += 1;
      } catch (e) {
        if (e instanceof NetworkError) { result.offline = true; break; }
        result.failed += 1;
      }
    }
    return result;
  }
}
