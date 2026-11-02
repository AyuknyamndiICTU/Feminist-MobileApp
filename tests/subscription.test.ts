import { generateKeyPairSync, sign, verify, type KeyObject } from 'crypto';

import { PLANS as WEB_PLANS } from '../../website/src/lib/plans';
import { isValidCallbackRequest, type CallbackRequest } from '../src/domain/callback';
import {
  counsellingLeft,
  decodeEntitlement,
  detectProvider,
  evaluateSubscription,
  formatXaf,
  hasFeature,
  normalizeActivationCode,
  normalizeCmMsisdn,
  PLAN_IDS,
  PLANS,
  reminderSchedule,
  TIER_FEATURES,
  type EntitlementClaims,
} from '../src/domain/subscription';
import { ApiError } from '../src/services/api';
import { EncryptedStore } from '../src/services/encryptedStore';
import { MockNisServer } from '../src/services/mockServer';
import { fakeCipher, MemoryStore, seqRandom } from './helpers';

const DAY = 86_400_000;
const NOW = Date.parse('2026-05-10T10:00:00.000Z');
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

const keys = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519');

function token(claims: Partial<EntitlementClaims>, key: KeyObject = keys.privateKey): string {
  const full: EntitlementClaims = { v: 1, iss: 'safeher', sub: 'dev-1', plan: 'monthly', pu: 0, xu: 0, iat: NOW / 1000, ...claims };
  const head = `v1.${b64url(JSON.stringify(full))}`;
  return `${head}.${b64url(sign(null, Buffer.from(head), key))}`;
}

const verifier = (sig: Uint8Array, msg: Uint8Array) => verify(null, Buffer.from(msg), keys.publicKey, Buffer.from(sig));
const decode = (t: string) => decodeEntitlement(t, verifier);

describe('plan catalogue', () => {
  it('matches the website prices, periods and features exactly', () => {
    expect(PLAN_IDS.sort()).toEqual(Object.keys(WEB_PLANS).sort());
    for (const id of PLAN_IDS) {
      const web = WEB_PLANS[id];
      expect(PLANS[id]).toMatchObject({ tier: web.tier, priceXaf: web.priceXaf, periodDays: web.periodDays, name: web.name });
      expect(TIER_FEATURES[PLANS[id].tier]).toEqual(web.features);
    }
  });

  it('formats FCFA amounts for both languages', () => {
    expect(formatXaf(10000, 'en')).toBe('10,000 FCFA');
    expect(formatXaf(15000, 'fr')).toBe('15\u202f000 FCFA');
  });
});

describe('signed entitlement', () => {
  it('accepts a token signed by the SafeHer server key', () => {
    const c = decode(token({ plan: 'plus', pu: NOW / 1000 + 100, xu: NOW / 1000 + 100 }));
    expect(c).toMatchObject({ plan: 'plus', sub: 'dev-1' });
  });

  it('rejects other keys, tampered payloads and malformed tokens', () => {
    expect(decode(token({ pu: 1 }, other.privateKey))).toBeNull();
    const good = token({ plan: 'monthly', pu: NOW / 1000 + 100 });
    const [v, , sig] = good.split('.');
    const forged = `${v}.${b64url(JSON.stringify({ v: 1, iss: 'safeher', sub: 'dev-1', plan: 'plus', pu: 9e9, xu: 9e9, iat: 1 }))}.${sig}`;
    expect(decode(forged)).toBeNull();
    expect(decode('v1.abc')).toBeNull();
    expect(decode('v2.a.b')).toBeNull();
    expect(decode(`${v}.${good.split('.')[1]}.%%%`)).toBeNull();
    expect(decodeEntitlement(good, () => { throw new Error('boom'); })).toBeNull();
  });

  it('rejects signed tokens with unknown plans or a wrong issuer', () => {
    expect(decode(token({ plan: 'lifetime' as never }))).toBeNull();
    expect(decode(token({ iss: 'evil' as never }))).toBeNull();
  });

  it('refuses test-mode plans unless explicitly accepted (development builds)', () => {
    const test = token({ plan: 'yearly', pu: NOW / 1000 + 100, tm: 1 });
    expect(decode(test)).toBeNull();
    expect(decodeEntitlement(test, verifier, true)).toMatchObject({ plan: 'yearly', tm: 1 });
    expect(decodeEntitlement(token({ tm: 2 as never }), verifier, true)).toBeNull();
  });
});

describe('offline subscription evaluation', () => {
  const claims = (pu: number, xu = 0, plan: EntitlementClaims['plan'] = 'yearly'): EntitlementClaims =>
    ({ v: 1, iss: 'safeher', sub: 'dev-1', plan, pu: pu / 1000, xu: xu / 1000, iat: 0 });

  it('is active with the right tier, days left and features', () => {
    const v = evaluateSubscription(claims(NOW + 10 * DAY), 'dev-1', NOW, NOW, 3600_000);
    expect(v).toMatchObject({ status: 'active', tier: 'premium', daysLeft: 10, expiringSoon: false });
    expect(hasFeature(v, 'vault')).toBe(true);
    expect(hasFeature(v, 'counselling')).toBe(false);
    const plus = evaluateSubscription(claims(NOW + 10 * DAY, NOW + 10 * DAY, 'plus'), 'dev-1', NOW, NOW, 3600_000);
    expect(plus.tier).toBe('plus');
    expect(hasFeature(plus, 'counselling')).toBe(true);
  });

  it('falls back to premium when the Plus part ended first', () => {
    const v = evaluateSubscription(claims(NOW + 30 * DAY, NOW - 1), 'dev-1', NOW, NOW, 0);
    expect(v.tier).toBe('premium');
  });

  it('warns 3 days before the end and locks premium tools after it', () => {
    expect(evaluateSubscription(claims(NOW + 2 * DAY), 'dev-1', NOW, NOW, 0)).toMatchObject({ expiringSoon: true, daysLeft: 2, endsWithinDay: false });
    expect(evaluateSubscription(claims(NOW + 3600_000), 'dev-1', NOW, NOW, 0)).toMatchObject({ expiringSoon: true, endsWithinDay: true });
    const ended = evaluateSubscription(claims(NOW - 1), 'dev-1', NOW, NOW, 0);
    expect(ended.status).toBe('expired');
    expect(hasFeature(ended, 'vault')).toBe(false);
  });

  it('ignores tokens issued to another device', () => {
    expect(evaluateSubscription(claims(NOW + DAY), 'dev-2', NOW, NOW, 0).status).toBe('none');
    expect(evaluateSubscription(null, 'dev-1', NOW, NOW, 0).status).toBe('none');
  });

  it('distrusts the plan when the clock is turned back beyond the tolerance', () => {
    const later = NOW + 40 * DAY;
    expect(evaluateSubscription(claims(NOW + 30 * DAY), 'dev-1', NOW, later, 3600_000).status).toBe('untrusted');
    expect(evaluateSubscription(claims(NOW + 30 * DAY), 'dev-1', NOW, NOW + 1000, 3600_000).status).toBe('active');
  });
});

describe('renewal reminders', () => {
  it('schedules 3 days, 1 day before and at the end, skipping the past', () => {
    const end = NOW + 5 * DAY;
    expect(reminderSchedule(end, NOW, [3, 1])).toEqual([
      { at: end - 3 * DAY, daysLeft: 3 },
      { at: end - DAY, daysLeft: 1 },
      { at: end, daysLeft: 0 },
    ]);
    expect(reminderSchedule(end, end - 2 * DAY, [3, 1]).map((r) => r.daysLeft)).toEqual([1, 0]);
    expect(reminderSchedule(end, end + 1, [3, 1])).toEqual([]);
  });
});

describe('mobile money numbers and activation codes', () => {
  it('normalises Cameroon numbers and hints the operator', () => {
    expect(normalizeCmMsisdn('+237 6 77 12 34 56')).toBe('237677123456');
    expect(normalizeCmMsisdn('00237699123456')).toBe('237699123456');
    expect(normalizeCmMsisdn('2376991234')).toBeNull();
    expect(detectProvider('677123456')).toBe('mtn');
    expect(detectProvider('699123456')).toBe('orange');
  });

  it('accepts codes with dashes, lowercase and look-alike letters', () => {
    expect(normalizeActivationCode('abcd-efgh-jkmn-pqrs')).toBe('ABCD-EFGH-JKMN-PQRS');
    expect(normalizeActivationCode('ABCDEFGHOOIL2345')).toBe('ABCD-EFGH-0011-2345');
    expect(normalizeActivationCode('ABCD-EFGH')).toBeNull();
    expect(normalizeActivationCode('ABCD-EFGH-JKMN-PQRU')).toBeNull();
  });
});

describe('SafeHer Plus call-backs', () => {
  const request = (over: Partial<CallbackRequest> = {}): CallbackRequest => ({
    requestId: 'cb-00000001',
    createdAt: new Date(NOW).toISOString(),
    kind: 'counselling',
    phone: '699112233',
    safeTime: 'evening',
    region: 'CE',
    ...over,
  });

  it('validates requests', () => {
    expect(isValidCallbackRequest(request())).toBe(true);
    expect(isValidCallbackRequest(request({ kind: 'medical' as never }))).toBe(false);
    expect(isValidCallbackRequest(request({ phone: 'abc' }))).toBe(false);
    expect(isValidCallbackRequest(request({ note: 'x'.repeat(301) }))).toBe(false);
    expect(isValidCallbackRequest(request({ region: 'Centre' }))).toBe(false);
  });

  it('counts this month’s sessions only', () => {
    const now = new Date('2026-05-20T10:00:00Z');
    expect(counsellingLeft(['2026-05-02T10:00:00Z', '2026-04-29T10:00:00Z'], now, 2)).toBe(1);
    expect(counsellingLeft(['2026-05-02T10:00:00Z', '2026-05-03T10:00:00Z', '2026-05-04T10:00:00Z'], now, 2)).toBe(0);
  });

  function server() {
    return new MockNisServer({
      store: new EncryptedStore(new MemoryStore(), fakeCipher, 'srv:'),
      isOnline: () => true,
      randomBytes: seqRandom,
      now: () => new Date(NOW),
      verifyEntitlement: decode,
    });
  }
  const plus = token({ plan: 'plus', pu: NOW / 1000 + 100, xu: NOW / 1000 + 100 });

  it('requires a valid, current Plus entitlement', async () => {
    const api = server();
    await expect(api.submitCallbackRequest(request(), token({ plan: 'yearly', pu: NOW / 1000 + 100 }))).rejects.toBeInstanceOf(ApiError);
    await expect(api.submitCallbackRequest(request(), token({ plan: 'plus', pu: NOW / 1000 + 100, xu: NOW / 1000 - 1 }))).rejects.toBeInstanceOf(ApiError);
    await expect(api.submitCallbackRequest(request(), token({ plan: 'plus', pu: 9e9, xu: 9e9 }, other.privateKey))).rejects.toBeInstanceOf(ApiError);
    await expect(api.submitCallbackRequest(request(), plus)).resolves.toHaveProperty('receivedAt');
  });

  it('enforces 2 per month server-side and is idempotent', async () => {
    const api = server();
    await api.submitCallbackRequest(request({ requestId: 'cb-00000001' }), plus);
    await api.submitCallbackRequest(request({ requestId: 'cb-00000001' }), plus);
    await api.submitCallbackRequest(request({ requestId: 'cb-00000002' }), plus);
    await expect(api.submitCallbackRequest(request({ requestId: 'cb-00000003' }), plus)).rejects.toBeInstanceOf(ApiError);
  });

  it('shows requests to helpline/MINPROFF in scope, without the member id', async () => {
    const api = server();
    await api.submitCallbackRequest(request({ region: 'CE' }), plus);
    await api.submitCallbackRequest(request({ requestId: 'cb-00000002', region: 'EN' }), plus);
    const helpline = await api.login('HLP-001', '1234');
    const minproff = await api.login('MIN-001', '1234');
    const police = await api.login('POL-001', '1234');
    const all = await api.listCallbackRequests(helpline);
    expect(all).toHaveLength(2);
    expect(all.every((r) => !('member' in r))).toBe(true);
    expect((await api.listCallbackRequests(minproff)).map((r) => r.region)).toEqual(['CE']);
    await expect(api.listCallbackRequests(police)).rejects.toBeInstanceOf(ApiError);
    await expect(api.completeCallbackRequest(minproff, 'cb-00000002')).rejects.toBeInstanceOf(ApiError);
    const done = await api.completeCallbackRequest(helpline, 'cb-00000002');
    expect(done).toMatchObject({ status: 'DONE', handledBy: 'HLP-001' });
    expect(done).not.toHaveProperty('member');
  });
});
