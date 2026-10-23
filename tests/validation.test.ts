import { validateCase, validateCitizenReport, isValidIsoDate, mandatoryFields } from '../src/domain/validation';
import { assessRisk } from '../src/domain/risk';
import { completeCase } from './helpers';

const TODAY = new Date('2026-10-22T12:00:00Z');

describe('validateCase (Layer 1 standardized form)', () => {
  it('accepts a complete record with 100% completeness', () => {
    const v = validateCase(completeCase(), TODAY);
    expect(v.canSubmit).toBe(true);
    expect(v.completeness).toBe(1);
    expect(v.informativeCompleteness).toBe(1);
  });

  it('requires the arrondissement only where the arrondissement list is available', () => {
    expect(mandatoryFields({ location: { region: 'CE', department: 'MFO' } })).toContain('arrondissement');
    expect(mandatoryFields({ location: { region: 'AD', department: 'VIN' } })).not.toContain('arrondissement');
    const v = validateCase(completeCase({ location: { region: 'CE', department: 'MFO' } }), TODAY);
    expect(v.missing).toEqual(['arrondissement']);
    expect(v.canSubmit).toBe(false);
  });

  it('counts "unknown" as answered but not informative', () => {
    const v = validateCase(completeCase({ relationship: 'UNKNOWN', repeatIncident: 'unknown' }), TODAY);
    expect(v.canSubmit).toBe(true);
    expect(v.completeness).toBe(1);
    expect(v.informativeCompleteness).toBeCloseTo(7 / 9);
  });

  it('rejects future and malformed dates', () => {
    expect(validateCase(completeCase({ incidentDate: '2026-12-01' }), TODAY).invalid).toContain('incidentDate');
    expect(isValidIsoDate('2026-02-30', TODAY)).toBe(false);
    expect(isValidIsoDate('01/10/2026', TODAY)).toBe(false);
    expect(isValidIsoDate('2026-10-22', TODAY)).toBe(true);
  });

  it('flags an implausible victim phone only when identity is captured', () => {
    const bad = completeCase({ consentToName: true, identity: { contactPhone: '12ab' } });
    expect(validateCase(bad, TODAY).invalidPhone).toBe(true);
    expect(validateCase(bad, TODAY).canSubmit).toBe(false);
    expect(validateCase(completeCase({ consentToName: true, identity: { contactPhone: '+237 6 99 99 99 99' } }), TODAY).canSubmit).toBe(true);
  });
});

describe('validateCitizenReport (Layer 4)', () => {
  const base = { incidentType: 'RAPE' as const, location: { region: 'LT', department: 'WOU' }, consentToShare: true, contactPreference: 'none' as const };

  it('accepts a minimal anonymous report', () => {
    expect(validateCitizenReport(base).ok).toBe(true);
  });

  it('requires consent, location and a valid safe contact when contact is requested', () => {
    expect(validateCitizenReport({ ...base, consentToShare: false }).errors).toContain('consent');
    expect(validateCitizenReport({ ...base, location: { region: 'LT' } }).errors).toContain('department');
    expect(validateCitizenReport({ ...base, contactPreference: 'call', safeContact: '12' }).errors).toContain('safeContact');
    expect(validateCitizenReport({ ...base, contactPreference: 'sms', safeContact: '699000000' }).ok).toBe(true);
  });
});

describe('assessRisk', () => {
  it('flags any critical lethality indicator as HIGH', () => {
    expect(assessRisk({ strangulation: true })).toBe('HIGH');
    expect(assessRisk({ weaponAccess: true })).toBe('HIGH');
  });
  it('escalates with the number of factors', () => {
    expect(assessRisk({})).toBe('LOW');
    expect(assessRisk({ pregnancy: true })).toBe('MEDIUM');
    expect(assessRisk({ pregnancy: true, escalation: true, coerciveControl: true })).toBe('HIGH');
    expect(assessRisk({ pregnancy: false })).toBe('LOW');
  });
});
