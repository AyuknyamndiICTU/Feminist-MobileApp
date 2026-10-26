/** Least-privilege access matrix (Layer 5 governance): each role sees and does only what it needs. */
import type { ProcedureStatus, Role } from './types';

export type Permission =
  | 'case.create'
  | 'case.captureIdentity'
  | 'report.verify'
  | 'sos.respond'
  | 'procedure.services'
  | 'procedure.investigation'
  | 'procedure.judicial';

const MATRIX: Record<Role, Permission[]> = {
  police: ['case.create', 'case.captureIdentity', 'report.verify', 'sos.respond', 'procedure.services', 'procedure.investigation'],
  gendarmerie: ['case.create', 'case.captureIdentity', 'report.verify', 'sos.respond', 'procedure.services', 'procedure.investigation'],
  justice: ['case.create', 'case.captureIdentity', 'procedure.judicial'],
  minproff: ['case.create', 'case.captureIdentity', 'report.verify', 'sos.respond', 'procedure.services'],
  health: ['case.create', 'procedure.services'],
  helpline: ['case.create', 'report.verify', 'sos.respond', 'procedure.services'],
};

const STATUS_PERMISSION: Record<ProcedureStatus, Permission | null> = {
  REPORTED: null,
  WITHDRAWN: null,
  UNKNOWN: null,
  REFERRED_SERVICES: 'procedure.services',
  UNDER_INVESTIGATION: 'procedure.investigation',
  REFERRED_PROSECUTOR: 'procedure.investigation',
  CLOSED_NO_ACTION: 'procedure.investigation',
  PROSECUTION_OPEN: 'procedure.judicial',
  TRIAL: 'procedure.judicial',
  JUDGMENT_CONVICTION: 'procedure.judicial',
  JUDGMENT_ACQUITTAL: 'procedure.judicial',
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function canSetStatus(role: Role, status: ProcedureStatus): boolean {
  const needed = STATUS_PERMISSION[status];
  if (needed === null) return true;
  if (status === 'CLOSED_NO_ACTION' && can(role, 'procedure.judicial')) return true;
  return can(role, needed);
}

export function allowedStatuses(role: Role, all: ProcedureStatus[]): ProcedureStatus[] {
  return all.filter((s) => canSetStatus(role, s));
}
