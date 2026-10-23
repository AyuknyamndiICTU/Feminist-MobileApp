import { suppressSmallCells, toRegisterRecord } from '../src/domain/anonymize';
import { allowedStatuses, can, canSetStatus } from '../src/domain/permissions';
import { decodeReportSms, encodeReportSms, type SmsReport } from '../src/domain/smsCodec';
import { INCIDENT_TYPES, PROCEDURE_STATUSES, RELATIONSHIPS } from '../src/domain/typology';
import { REGIONS } from '../src/domain/geography';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { evaluate, formatResult } from '../src/lib/calc';
import { utf8Decode, utf8Encode } from '../src/lib/utf8';
import { completeCase } from './helpers';

describe('SMS codec (low-connectivity channel)', () => {
  const report: SmsReport = {
    incidentType: 'PHYSICAL_ASSAULT',
    relationship: 'CURRENT_PARTNER',
    location: { region: 'CE', department: 'MFO', arrondissement: 'YDE3' },
    immediateDanger: true,
    forWhom: 'self',
    contactPreference: 'sms',
    safeTime: 'evening',
  };

  it('round-trips a report through a short, name-free message', () => {
    const sms = encodeReportSms(report);
    expect(sms).toBe('R1 PA CP CE MFO YDE3 D1 S ME');
    expect(sms.length).toBeLessThan(40);
    expect(decodeReportSms(sms)).toEqual(report);
  });

  it('handles anonymous reports and departments without an arrondissement list', () => {
    const anon: SmsReport = { ...report, location: { region: 'AD', department: 'VIN' }, contactPreference: 'none', safeTime: undefined };
    expect(decodeReportSms(encodeReportSms(anon))).toEqual({ ...anon, location: { region: 'AD', department: 'VIN', arrondissement: undefined } });
  });

  it('rejects malformed or inconsistent messages', () => {
    expect(decodeReportSms('hello')).toBeNull();
    expect(decodeReportSms('R1 ZZ CP CE MFO YDE3 D1 S N')).toBeNull();
    expect(decodeReportSms('R1 PA CP CE WOU - D1 S N')).toBeNull();
    expect(decodeReportSms('R1 PA CP CE MFO DLA1 D1 S N')).toBeNull();
    expect(decodeReportSms('R1 PA CP CE MFO YDE3 D2 S N')).toBeNull();
  });

  it('uses unique short codes for every nomenclature entry', () => {
    for (const list of [INCIDENT_TYPES, RELATIONSHIPS, PROCEDURE_STATUSES]) {
      expect(new Set(list.map((e) => e.short)).size).toBe(list.length);
    }
  });
});

describe('geography reference data', () => {
  it('has the 10 regions and 58 departments of Cameroon', () => {
    expect(REGIONS).toHaveLength(10);
    expect(REGIONS.reduce((n, r) => n + r.departments.length, 0)).toBe(58);
  });
});

describe('anonymization for the national register', () => {
  it('never sends identity, notes or detailed risk answers', () => {
    const c = completeCase({
      consentToName: true,
      identity: { victimName: 'Jane Doe', contactPhone: '699000000' },
      notes: 'lives behind the market',
      risk: { strangulation: true },
    });
    const rec = toRegisterRecord(c);
    const json = JSON.stringify(rec);
    expect(json).not.toContain('Jane');
    expect(json).not.toContain('699000000');
    expect(json).not.toContain('market');
    expect(json).not.toContain('strangulation');
    expect(rec.riskLevel).toBe('HIGH');
  });

  it('suppresses small cells in disseminated counts', () => {
    expect(suppressSmallCells({ a: 0, b: 3, c: 5, d: 12 })).toEqual({ a: 0, b: '<5', c: 5, d: 12 });
  });
});

describe('least-privilege permissions', () => {
  it('health workers cannot capture identities or verify reports', () => {
    expect(can('health', 'case.captureIdentity')).toBe(false);
    expect(can('health', 'report.verify')).toBe(false);
  });

  it('only justice records judicial steps, only security forces record investigations', () => {
    expect(canSetStatus('police', 'JUDGMENT_CONVICTION')).toBe(false);
    expect(canSetStatus('justice', 'JUDGMENT_CONVICTION')).toBe(true);
    expect(canSetStatus('justice', 'UNDER_INVESTIGATION')).toBe(false);
    expect(canSetStatus('gendarmerie', 'REFERRED_PROSECUTOR')).toBe(true);
    expect(canSetStatus('justice', 'CLOSED_NO_ACTION')).toBe(true);
    expect(allowedStatuses('minproff', PROCEDURE_STATUSES.map((s) => s.code))).toEqual(
      ['REPORTED', 'REFERRED_SERVICES', 'WITHDRAWN', 'UNKNOWN'],
    );
  });
});

describe('i18n', () => {
  it('French and English use the same placeholders for every key', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect([key, vars(fr[key])]).toEqual([key, vars(en[key])]);
    }
  });
});

describe('calculator disguise', () => {
  it('evaluates with operator precedence and without eval', () => {
    expect(evaluate('2+3×4')).toBe(14);
    expect(evaluate('10÷4')).toBe(2.5);
    expect(evaluate('−5+2')).toBe(-3);
    expect(evaluate('1÷0')).toBeNull();
    expect(evaluate('2+')).toBeNull();
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
    expect(formatResult(-3)).toBe('−3');
  });
});

describe('utf8', () => {
  it('round-trips French accents and emoji', () => {
    const s = 'Féminicide – Extrême-Nord ✓ 👩🏾';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(Array.from(utf8Encode('é'))).toEqual([0xc3, 0xa9]);
  });
});
