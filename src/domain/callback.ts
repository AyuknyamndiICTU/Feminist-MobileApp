/**
 * SafeHer Plus call-back requests: a counsellor or legal adviser calls the member back at a safe
 * time. Only helpline and MINPROFF staff see them, scoped to the member's region (helpline: all).
 */
import { isPlausiblePhone } from './validation';
import type { SafeTime } from './types';

export type CallbackKind = 'counselling' | 'legal';

export interface CallbackRequest {
  requestId: string;
  createdAt: string;
  kind: CallbackKind;
  phone: string;
  safeTime: SafeTime;
  region?: string;
  note?: string;
}

export interface ServerCallbackRequest extends CallbackRequest {
  receivedAt: string;
  status: 'NEW' | 'DONE';
  handledBy?: string;
  /** Subscriber (device) id from the entitlement; used for the quota, never shown to agents. */
  member?: string;
}

const KINDS: CallbackKind[] = ['counselling', 'legal'];
const TIMES: SafeTime[] = ['morning', 'afternoon', 'evening', 'any'];

export function isValidCallbackRequest(r: unknown): r is CallbackRequest {
  if (typeof r !== 'object' || r === null) return false;
  const x = r as Record<string, unknown>;
  if (typeof x.requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(x.requestId)) return false;
  if (typeof x.createdAt !== 'string' || Number.isNaN(Date.parse(x.createdAt))) return false;
  if (!KINDS.includes(x.kind as CallbackKind) || !TIMES.includes(x.safeTime as SafeTime)) return false;
  if (typeof x.phone !== 'string' || !isPlausiblePhone(x.phone)) return false;
  if (x.region !== undefined && (typeof x.region !== 'string' || !/^[A-Z]{2}$/.test(x.region))) return false;
  if (x.note !== undefined && (typeof x.note !== 'string' || x.note.length > 300)) return false;
  return true;
}
