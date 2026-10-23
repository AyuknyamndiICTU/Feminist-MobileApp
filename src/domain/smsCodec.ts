/**
 * Compact, name-free SMS encoding of a citizen report for low-connectivity areas (Layer 4).
 * Format: R1 <type> <relationship> <region> <department> <arrondissement|-> <D0|D1> <S|O> <contact><time>
 * Example: "R1 PA CP CE MFO YDE3 D1 S CE" (no keyword revealing the purpose if the phone is inspected).
 */
import { findDepartment, findRegion } from './geography';
import { byShort, INCIDENT_TYPES, RELATIONSHIPS, shortOf } from './typology';
import type { CitizenReport, ContactPreference, SafeTime } from './types';

const CONTACT: Record<ContactPreference, string> = { none: 'N', call: 'C', sms: 'M' };
const TIME: Record<SafeTime, string> = { morning: 'M', afternoon: 'A', evening: 'E', any: 'X' };
const invert = <K extends string>(m: Record<K, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
const CONTACT_INV = invert(CONTACT);
const TIME_INV = invert(TIME);

export type SmsReport = Pick<
  CitizenReport,
  'incidentType' | 'relationship' | 'location' | 'immediateDanger' | 'forWhom' | 'contactPreference' | 'safeTime'
>;

export function encodeReportSms(r: SmsReport): string {
  const contact = CONTACT[r.contactPreference] + (r.contactPreference === 'none' ? '' : TIME[r.safeTime ?? 'any']);
  return [
    'R1',
    shortOf(INCIDENT_TYPES, r.incidentType),
    shortOf(RELATIONSHIPS, r.relationship),
    r.location.region ?? '-',
    r.location.department ?? '-',
    r.location.arrondissement ?? '-',
    r.immediateDanger ? 'D1' : 'D0',
    r.forWhom === 'self' ? 'S' : 'O',
    contact,
  ].join(' ');
}

export function decodeReportSms(text: string): SmsReport | null {
  const parts = text.trim().toUpperCase().split(/\s+/);
  if (parts.length !== 9 || parts[0] !== 'R1') return null;
  const [, type, rel, region, dept, arr, danger, who, contact] = parts;
  const incidentType = byShort(INCIDENT_TYPES, type);
  const relationship = byShort(RELATIONSHIPS, rel);
  const contactPreference = CONTACT_INV[contact[0]];
  if (!incidentType || !relationship || !contactPreference) return null;
  if (!findRegion(region) || !findDepartment(region, dept)) return null;
  if (danger !== 'D0' && danger !== 'D1') return null;
  if (who !== 'S' && who !== 'O') return null;
  const dep = findDepartment(region, dept);
  const arrondissement = arr === '-' ? undefined : arr;
  if (arrondissement && !dep?.arrondissements?.some((x) => x.code === arrondissement)) return null;
  const safeTime = contactPreference === 'none' ? undefined : TIME_INV[contact[1]];
  if (contactPreference !== 'none' && !safeTime) return null;
  return {
    incidentType,
    relationship,
    location: { region, department: dept, arrondissement },
    immediateDanger: danger === 'D1',
    forWhom: who === 'S' ? 'self' : 'other',
    contactPreference,
    safeTime,
  };
}
