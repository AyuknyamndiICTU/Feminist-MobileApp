/**
 * Client for the SafeHer subscription API (website/src/app/api/v1). The device is an anonymous
 * account whose random token lives in the hardware-backed keystore. Every entitlement received is
 * checked against the server's Ed25519 public key before it unlocks anything.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import * as Crypto from 'expo-crypto';

import { CONFIG } from '../config';
import {
  decodeEntitlement,
  evaluateSubscription,
  hexToBytes,
  type EntitlementClaims,
  type PlanId,
  type Provider,
  type SubscriptionView,
  type Tier,
} from '../domain/subscription';
import { keyVault } from './crypto';
import type { LocalRepository, SubscriptionCache } from './repository';

const DEVICE_KEY = 'safeher_device_v1';
const API = CONFIG.subscription.apiUrl.replace(/\/+$/, '');

if (!/^https:\/\//.test(API) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  throw new Error('subscription.apiUrl must use HTTPS (plain http is only allowed for localhost)');
}

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'expired';
export type FailureReason = 'declined' | 'insufficient_funds' | 'timeout' | 'provider_error' | 'not_a_customer';

export interface ServerSubscriptionState {
  active: boolean;
  planId?: PlanId;
  tier?: Tier;
  expiresAt?: string;
  serverTime: string;
  entitlement?: string;
  familyCode?: string;
}

export interface PaymentCreated {
  paymentId: string;
  status: PaymentStatus;
  provider: Provider;
  amountXaf: number;
  maskedMsisdn: string;
  approvalUssd: string;
  expiresAt: string;
  testMode: boolean;
}

export interface PaymentState {
  paymentId: string;
  status: PaymentStatus;
  failureReason?: FailureReason;
  subscription?: ServerSubscriptionState;
}

export class SubscriptionApiError extends Error {
  constructor(public readonly code: string, public readonly status = 0) {
    super(code);
    this.name = 'SubscriptionApiError';
  }
}

const PUBLIC_KEY = hexToBytes(CONFIG.subscription.entitlementPublicKey);
/** Simulated-payment plans only count against a local development server, never the HTTPS API. */
const ACCEPT_TEST_PLANS = API.startsWith('http://');

export function verifyEntitlement(token: string | undefined): EntitlementClaims | null {
  if (!token) return null;
  return decodeEntitlement(token, (sig, msg) => ed25519.verify(sig, msg, PUBLIC_KEY), ACCEPT_TEST_PLANS);
}

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.subscription.requestTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, signal: ctrl.signal, headers: { Accept: 'application/json', ...init.headers } });
  } catch {
    throw new SubscriptionApiError('network');
  } finally {
    clearTimeout(timer);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string } }) | null;
  if (!res.ok) throw new SubscriptionApiError(body?.error?.code ?? 'internal', res.status);
  return body as T;
}

interface DeviceCredentials {
  deviceId: string;
  deviceToken: string;
}

async function loadDevice(): Promise<DeviceCredentials | null> {
  const raw = await keyVault.get(DEVICE_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as DeviceCredentials;
    return d.deviceId && d.deviceToken ? d : null;
  } catch {
    return null;
  }
}

export async function currentDeviceId(): Promise<string | undefined> {
  return (await loadDevice())?.deviceId;
}

async function ensureDevice(): Promise<DeviceCredentials> {
  const existing = await loadDevice();
  if (existing) return existing;
  const created = await http<DeviceCredentials>('/api/v1/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  await keyVault.set(DEVICE_KEY, JSON.stringify(created));
  return created;
}

/** Authenticated call; if the server no longer knows this device, register a new one once. */
async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const d = await ensureDevice();
    try {
      return await http<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${d.deviceToken}` } });
    } catch (e) {
      if (attempt === 0 && e instanceof SubscriptionApiError && e.status === 401) {
        await keyVault.remove(DEVICE_KEY);
        continue;
      }
      throw e;
    }
  }
}

export function fetchState(): Promise<ServerSubscriptionState> {
  return authed<ServerSubscriptionState>('/api/v1/subscription');
}

export function startPayment(planId: PlanId, provider: Provider, msisdn: string, idempotencyKey: string): Promise<PaymentCreated> {
  return authed<PaymentCreated>('/api/v1/subscription/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ planId, provider, msisdn }),
  });
}

export function getPayment(paymentId: string): Promise<PaymentState> {
  return authed<PaymentState>(`/api/v1/subscription/payments/${encodeURIComponent(paymentId)}`);
}

export function redeemCode(code: string): Promise<ServerSubscriptionState> {
  return authed<ServerSubscriptionState>('/api/v1/subscription/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

export function fetchTestMode(): Promise<boolean> {
  return http<{ testMode: boolean }>('/api/v1/plans').then((p) => p.testMode);
}

/**
 * Saves a server state after verifying its signature. An invalid or foreign entitlement is dropped
 * (never trusted), and the clock watermark only moves forward.
 */
export async function applyServerState(repo: LocalRepository, state: ServerSubscriptionState): Promise<SubscriptionCache> {
  const cache = await repo.getSubscriptionCache();
  const deviceId = await currentDeviceId();
  const claims = verifyEntitlement(state.entitlement);
  const valid = claims && claims.sub === deviceId ? state.entitlement : undefined;
  const serverTime = Date.parse(state.serverTime);
  const next: SubscriptionCache = {
    ...cache,
    entitlement: valid ?? (state.active ? cache.entitlement : undefined),
    familyCode: state.familyCode,
    maxSeenTime: Math.max(cache.maxSeenTime, Number.isFinite(serverTime) ? serverTime : 0, Date.now()),
  };
  await repo.saveSubscriptionCache(next);
  return next;
}

export async function viewFromCache(cache: SubscriptionCache, now = Date.now()): Promise<SubscriptionView> {
  return evaluateSubscription(
    verifyEntitlement(cache.entitlement),
    await currentDeviceId(),
    now,
    cache.maxSeenTime,
    CONFIG.subscription.clockRollbackToleranceMs,
    CONFIG.subscription.remindDaysBefore[0],
  );
}

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
