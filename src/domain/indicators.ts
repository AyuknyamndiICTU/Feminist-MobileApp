/** Chapter 25 monitoring and evaluation indicators, computed from the data the system already holds. */
import { suppressSmallCells, type SuppressedCount } from './anonymize';
import { seededArrondissementKeys } from './geography';
import { validateCase } from './validation';
import type { CaseRecord, RegisterRecord, ServerCitizenReport } from './types';

export interface Indicators {
  /** Layer 1: mean informative completeness of submitted forms (0..1). */
  completenessRate: number | null;
  submittedCount: number;
  syncBreakdown: Record<CaseRecord['syncState'], number>;
  /** Layer 2: share of local records carrying a national case number. */
  linkedRate: number | null;
  /** Layer 3: share of seeded arrondissements with at least one conforming record. */
  coverageRate: number;
  coveredUnits: number;
  totalUnits: number;
  /** Layer 4: citizen reports and mean hours to first institutional response. */
  citizenReports: number;
  pendingVerification: number;
  meanHoursToFirstResponse: number | null;
  /** Layer 5: register counts by incident type with small-cell suppression. */
  byIncidentType: Record<string, SuppressedCount>;
}

export function computeIndicators(
  localCases: CaseRecord[],
  register: RegisterRecord[],
  reports: ServerCitizenReport[],
  now = new Date(),
): Indicators {
  const submitted = localCases.filter((c) => c.syncState !== 'draft');
  const completenessRate = submitted.length
    ? submitted.reduce((sum, c) => sum + validateCase(c, now).informativeCompleteness, 0) / submitted.length
    : null;

  const syncBreakdown = { draft: 0, queued: 0, synced: 0, error: 0 };
  for (const c of localCases) syncBreakdown[c.syncState] += 1;
  const linkedRate = submitted.length ? submitted.filter((c) => !!c.caseNumber).length / submitted.length : null;

  const seeded = new Set(seededArrondissementKeys());
  const covered = new Set(
    register
      .map((r) => `${r.location.region}.${r.location.department}.${r.location.arrondissement}`)
      .filter((k) => seeded.has(k)),
  );

  const responded = reports.filter((r) => r.firstResponseAt);
  const meanHoursToFirstResponse = responded.length
    ? responded.reduce(
        (sum, r) => sum + (new Date(r.firstResponseAt!).getTime() - new Date(r.receivedAt).getTime()) / 3_600_000,
        0,
      ) / responded.length
    : null;

  const counts: Record<string, number> = {};
  for (const r of register) {
    const key = r.incidentType ?? 'UNKNOWN';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return {
    completenessRate,
    submittedCount: submitted.length,
    syncBreakdown,
    linkedRate,
    coverageRate: seeded.size ? covered.size / seeded.size : 0,
    coveredUnits: covered.size,
    totalUnits: seeded.size,
    citizenReports: reports.length,
    pendingVerification: reports.filter((r) => r.status === 'RECEIVED' || r.status === 'UNDER_VERIFICATION').length,
    meanHoursToFirstResponse,
    byIncidentType: suppressSmallCells(counts),
  };
}
