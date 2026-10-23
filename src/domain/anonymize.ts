import { assessRisk } from './risk';
import type { CaseRecord, RegisterRecord } from './types';

/**
 * Builds the record sent to the national statistical register. Identity, free-text notes and the
 * detailed risk answers stay in the operational case file; only coded, non-identifying data leaves.
 */
export function toRegisterRecord(c: CaseRecord): RegisterRecord {
  return {
    caseNumber: c.caseNumber,
    localId: c.localId,
    institution: c.institution,
    facility: c.facility,
    incidentDate: c.incidentDate,
    incidentType: c.incidentType,
    relationship: c.relationship,
    location: { region: c.location.region, department: c.location.department, arrondissement: c.location.arrondissement },
    procedureStatus: c.procedureStatus,
    victimAgeBand: c.victimAgeBand,
    repeatIncident: c.repeatIncident,
    riskLevel: assessRisk(c.risk),
    referrals: [...c.referrals],
    sourceReportId: c.sourceReportId,
    history: c.history.map((h) => ({ ...h })),
    updatedAt: c.updatedAt,
  };
}

export type SuppressedCount = number | '<5';

/** Small-cell suppression for any figure disseminated beyond authorized institutional users. */
export function suppressSmallCells(counts: Record<string, number>, threshold = 5): Record<string, SuppressedCount> {
  const out: Record<string, SuppressedCount> = {};
  for (const [k, v] of Object.entries(counts)) out[k] = v > 0 && v < threshold ? '<5' : v;
  return out;
}
