/**
 * SafeHer Premium rules (pure, no device APIs). The plan table mirrors website/src/lib/plans.ts
 * (a test fails if they drift). Emergency features are never gated: only these extras are.
 */
import type { Bilingual } from './types';

export type PlanId = 'monthly' | 'yearly' | 'plus';
export type Tier = 'premium' | 'plus';
export type PremiumFeature = 'vault' | 'checkin' | 'fakeCall' | 'family' | 'counselling' | 'priority';
export type Provider = 'mtn' | 'orange';

export interface PlanInfo {
  id: PlanId;
  tier: Tier;
  priceXaf: number;
  periodDays: number;
  name: Bilingual;
  badge?: Bilingual;
}

export const PLANS: Record<PlanId, PlanInfo> = {
  monthly: { id: 'monthly', tier: 'premium', priceXaf: 1000, periodDays: 30, name: { en: 'Monthly', fr: 'Mensuel' } },
  yearly: {
    id: 'yearly', tier: 'premium', priceXaf: 10000, periodDays: 365, name: { en: 'Yearly', fr: 'Annuel' },
    badge: { en: '2 months free', fr: '2 mois offerts' },
  },
  plus: {
    id: 'plus', tier: 'plus', priceXaf: 15000, periodDays: 365, name: { en: 'SafeHer Plus', fr: 'SafeHer Plus' },
    badge: { en: 'Promo · best value', fr: 'Promo · meilleure offre' },
  },
};

export const PLAN_IDS: PlanId[] = ['monthly', 'yearly', 'plus'];

export const TIER_FEATURES: Record<Tier, PremiumFeature[]> = {
  premium: ['vault', 'checkin', 'fakeCall'],
  plus: ['vault', 'checkin', 'fakeCall', 'family', 'counselling', 'priority'],
};

/* ---------- Signed entitlement ("v1.<payload>.<signature>", base64url) ---------- */

export interface EntitlementClaims {
  v: 1;
  iss: 'safeher';
  sub: string;
  plan: PlanId;
  /** Premium access until (seconds). */
  pu: number;
  /** Plus access until (seconds, 0 if none). */
  xu: number;
  iat: number;
  /** 1 = granted by a simulated (test-mode) payment. */
  tm?: 1;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlToBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const asciiBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/**
 * Returns the claims only if the server's signature is valid; the verifier is injected (Ed25519).
 * Test-mode plans (tm=1) are refused unless acceptTest is set (development builds only).
 */
export function decodeEntitlement(
  token: string,
  verify: (signature: Uint8Array, message: Uint8Array) => boolean,
  acceptTest = false,
): EntitlementClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const sig = base64UrlToBytes(parts[2]);
  const payload = base64UrlToBytes(parts[1]);
  if (!sig || sig.length !== 64 || !payload) return null;
  let ok = false;
  try {
    ok = verify(sig, asciiBytes(`v1.${parts[1]}`));
  } catch {
    ok = false;
  }
  if (!ok) return null;
  try {
    const c = JSON.parse(String.fromCharCode(...payload)) as Partial<EntitlementClaims>;
    if (c.v !== 1 || c.iss !== 'safeher' || typeof c.sub !== 'string' || !c.plan || !(c.plan in PLANS)) return null;
    if (typeof c.pu !== 'number' || typeof c.xu !== 'number' || typeof c.iat !== 'number') return null;
    if (c.tm !== undefined && (c.tm !== 1 || !acceptTest)) return null;
    return c as EntitlementClaims;
  } catch {
    return null;
  }
}

/* ---------- Status ---------- */

export type SubscriptionStatus = 'none' | 'active' | 'expired' | 'untrusted';

export interface SubscriptionView {
  status: SubscriptionStatus;
  planId?: PlanId;
  tier?: Tier;
  expiresAt?: number;
  daysLeft?: number;
  /** Less than 24 hours left: say "today at HH:MM" rather than "1 day". */
  endsWithinDay?: boolean;
  /** Within the reminder window (3 days by default). */
  expiringSoon: boolean;
}

const DAY = 86_400_000;

/**
 * Offline evaluation of the saved entitlement. If the phone clock is set back past the latest time
 * already seen (to stretch a plan), the entitlement is not trusted until the next online check.
 */
export function evaluateSubscription(
  claims: EntitlementClaims | null,
  deviceId: string | undefined,
  now: number,
  maxSeenTime: number,
  rollbackToleranceMs: number,
  soonDays = 3,
): SubscriptionView {
  if (!claims || !deviceId || claims.sub !== deviceId) return { status: 'none', expiringSoon: false };
  const expiresAt = claims.pu * 1000;
  const base = { planId: claims.plan, expiresAt };
  if (now + rollbackToleranceMs < maxSeenTime) return { ...base, status: 'untrusted', expiringSoon: false };
  if (expiresAt <= now) return { ...base, status: 'expired', expiringSoon: false };
  const tier: Tier = claims.xu * 1000 > now ? 'plus' : 'premium';
  const daysLeft = Math.ceil((expiresAt - now) / DAY);
  return { ...base, status: 'active', tier, daysLeft, endsWithinDay: expiresAt - now < DAY, expiringSoon: expiresAt - now <= soonDays * DAY };
}

export function hasFeature(view: SubscriptionView, feature: PremiumFeature): boolean {
  return view.status === 'active' && !!view.tier && TIER_FEATURES[view.tier].includes(feature);
}

/** Reminder times still in the future, e.g. 3 days and 1 day before the end, plus the end itself. */
export function reminderSchedule(expiresAt: number, now: number, daysBefore: readonly number[]): { at: number; daysLeft: number }[] {
  return [...daysBefore.map((d) => ({ at: expiresAt - d * DAY, daysLeft: d })), { at: expiresAt, daysLeft: 0 }]
    .filter((r) => r.at > now)
    .sort((a, b) => a.at - b.at);
}

/* ---------- Mobile money numbers (mirror of website/src/lib/phone.ts) ---------- */

export function normalizeCmMsisdn(input: string): string | null {
  let d = input.replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('237')) d = d.slice(3);
  if (!/^6\d{8}$/.test(d)) return null;
  return `237${d}`;
}

/** A hint only: the user always confirms which wallet she pays with. */
export function detectProvider(msisdn: string): Provider | null {
  const n = normalizeCmMsisdn(msisdn);
  if (!n) return null;
  const p2 = Number(n.slice(3, 5));
  const p3 = Number(n.slice(3, 6));
  if (p2 === 67 || (p3 >= 650 && p3 <= 654) || (p3 >= 680 && p3 <= 684)) return 'mtn';
  if (p2 === 69 || (p3 >= 655 && p3 <= 659) || (p3 >= 686 && p3 <= 689)) return 'orange';
  return null;
}

export function maskMsisdn(msisdn: string): string {
  const n = normalizeCmMsisdn(msisdn) ?? msisdn;
  return `${n.slice(0, 3)} ${n.slice(3, 4)}•• •• •• ${n.slice(-2)}`;
}

export function formatXaf(amount: number, lang: 'en' | 'fr'): string {
  const s = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'fr' ? '\u202f' : ',');
  return `${s} FCFA`;
}

/** Activation codes: 16 Crockford base32 characters, typed with or without dashes. */
export function normalizeActivationCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(c)) return null;
  return c.match(/.{4}/g)!.join('-');
}

/** SafeHer Plus counselling/legal call-backs left this calendar month. */
export function counsellingLeft(requestDates: string[], now: Date, perMonth: number): number {
  const used = requestDates.filter((d) => {
    const x = new Date(d);
    return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth();
  }).length;
  return Math.max(0, perMonth - used);
}
