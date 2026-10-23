import { hasArrondissementList } from './geography';
import type { CaseRecord, CitizenReport } from './types';

export type MandatoryField =
  | 'incidentDate'
  | 'incidentType'
  | 'relationship'
  | 'region'
  | 'department'
  | 'arrondissement'
  | 'procedureStatus'
  | 'victimAgeBand'
  | 'repeatIncident';

const UNKNOWN_VALUES = new Set(['UNKNOWN', 'unknown']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string | undefined, today = new Date()): boolean {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return parsed.getTime() <= today.getTime();
}

export function mandatoryFields(c: Pick<CaseRecord, 'location'>): MandatoryField[] {
  const fields: MandatoryField[] = [
    'incidentDate', 'incidentType', 'relationship', 'region', 'department',
    'procedureStatus', 'victimAgeBand', 'repeatIncident',
  ];
  if (hasArrondissementList(c.location.region, c.location.department)) fields.push('arrondissement');
  return fields;
}

function fieldValue(c: CaseRecord, field: MandatoryField): string | undefined {
  switch (field) {
    case 'region': return c.location.region;
    case 'department': return c.location.department;
    case 'arrondissement': return c.location.arrondissement;
    default: return c[field];
  }
}

export interface CaseValidation {
  missing: MandatoryField[];
  invalid: MandatoryField[];
  invalidPhone: boolean;
  canSubmit: boolean;
  /** Share of mandatory fields answered (unknown counts as answered). */
  completeness: number;
  /** Share of mandatory fields with an informative (non-unknown) value: Layer 1 indicator. */
  informativeCompleteness: number;
}

export function validateCase(c: CaseRecord, today = new Date()): CaseValidation {
  const fields = mandatoryFields(c);
  const missing: MandatoryField[] = [];
  const invalid: MandatoryField[] = [];
  let informative = 0;
  for (const f of fields) {
    const v = fieldValue(c, f);
    if (!v) { missing.push(f); continue; }
    if (f === 'incidentDate' && !isValidIsoDate(v, today)) { invalid.push(f); continue; }
    if (!UNKNOWN_VALUES.has(v)) informative += 1;
  }
  const answered = fields.length - missing.length - invalid.length;
  const invalidPhone = Boolean(
    c.consentToName && c.identity?.contactPhone && !isPlausiblePhone(c.identity.contactPhone),
  );
  return {
    missing,
    invalid,
    invalidPhone,
    canSubmit: missing.length === 0 && invalid.length === 0 && !invalidPhone,
    completeness: answered / fields.length,
    informativeCompleteness: informative / fields.length,
  };
}

export function isPlausiblePhone(value: string): boolean {
  const digits = value.replace(/[\s.+-]/g, '');
  return /^\d{8,15}$/.test(digits);
}

export interface ReportValidation { errors: string[]; ok: boolean }

export function validateCitizenReport(r: Partial<CitizenReport>): ReportValidation {
  const errors: string[] = [];
  if (!r.incidentType) errors.push('incidentType');
  if (!r.location?.region) errors.push('region');
  if (!r.location?.department) errors.push('department');
  if (!r.consentToShare) errors.push('consent');
  if (r.contactPreference && r.contactPreference !== 'none') {
    if (!r.safeContact || !isPlausiblePhone(r.safeContact)) errors.push('safeContact');
  }
  if (r.details && r.details.length > 500) errors.push('details');
  return { errors, ok: errors.length === 0 };
}
