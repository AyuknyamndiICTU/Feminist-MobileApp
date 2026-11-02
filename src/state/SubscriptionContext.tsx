import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { PremiumFeature, SubscriptionView } from '../domain/subscription';
import { hasFeature } from '../domain/subscription';
import type { Lang } from '../domain/types';
import { scheduleRenewalReminders } from '../services/reminders';
import type { LocalRepository, SubscriptionCache } from '../services/repository';
import {
  applyServerState,
  fetchState,
  fetchTestMode,
  getPayment,
  redeemCode,
  viewFromCache,
  type ServerSubscriptionState,
} from '../services/subscription';
import { useApp } from './AppContext';

interface SubscriptionCtx {
  view: SubscriptionView;
  cache: SubscriptionCache | null;
  /** Payments are simulated (no real money) while the server runs in test mode. */
  testMode: boolean;
  loading: boolean;
  has(feature: PremiumFeature): boolean;
  /** Pulls the latest state from the server (silently ignores being offline). */
  refresh(): Promise<void>;
  /** Saves a state returned by a successful payment or code, then schedules reminders. */
  apply(state: ServerSubscriptionState): Promise<SubscriptionView>;
  redeem(code: string): Promise<SubscriptionView>;
  updateCache(patch: Partial<SubscriptionCache>): Promise<void>;
}

const NONE: SubscriptionView = { status: 'none', expiringSoon: false };
const Ctx = createContext<SubscriptionCtx | null>(null);

interface Loaded {
  cache: SubscriptionCache;
  view: SubscriptionView;
  testMode?: boolean;
}

async function readLocal(repo: LocalRepository): Promise<Loaded> {
  const c = await repo.getSubscriptionCache();
  // The clock watermark only moves forward, so setting the phone clock back cannot extend a plan.
  if (Date.now() > c.maxSeenTime) {
    c.maxSeenTime = Date.now();
    await repo.saveSubscriptionCache(c);
  }
  return { cache: c, view: await viewFromCache(c) };
}

/** Latest state from the server, or null when offline/unreachable (the verified local copy stays). */
async function pullServer(repo: LocalRepository, lang: Lang): Promise<Loaded | null> {
  try {
    // A payment approved while the app was locked (she left it to approve) is picked up here.
    const pending = (await repo.getSubscriptionCache()).pendingPaymentId;
    if (pending) {
      const p = await getPayment(pending).catch(() => null);
      if (p && p.status !== 'pending') {
        const c = await repo.getSubscriptionCache();
        await repo.saveSubscriptionCache({ ...c, pendingPaymentId: undefined });
      }
    }
    const [state, testMode] = await Promise.all([fetchState(), fetchTestMode().catch(() => false)]);
    const cache = await applyServerState(repo, state);
    const view = await viewFromCache(cache);
    await scheduleRenewalReminders(view.status === 'active' ? view.expiresAt : undefined, lang, false);
    return { cache, view, testMode };
  } catch {
    return null;
  }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { repo, lang, online, unlocked } = useApp();
  const [cache, setCache] = useState<SubscriptionCache | null>(null);
  const [view, setView] = useState<SubscriptionView>(NONE);
  const [testMode, setTestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const langRef = useRef(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const commit = useCallback((r: Loaded) => {
    setCache(r.cache);
    setView(r.view);
    if (r.testMode !== undefined) setTestMode(r.testMode);
  }, []);

  const apply = useCallback(async (state: ServerSubscriptionState) => {
    const c = await applyServerState(repo, state);
    const v = await viewFromCache(c);
    commit({ cache: c, view: v });
    await scheduleRenewalReminders(v.status === 'active' ? v.expiresAt : undefined, langRef.current, true);
    return v;
  }, [repo, commit]);

  const refresh = useCallback(async () => {
    const r = await pullServer(repo, langRef.current);
    if (r) commit(r);
    setLoading(false);
  }, [repo, commit]);

  useEffect(() => {
    let live = true;
    readLocal(repo)
      .then((r) => { if (live) commit(r); })
      .catch(() => undefined)
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [repo, commit]);

  useEffect(() => {
    if (!online || !unlocked) return;
    let live = true;
    void pullServer(repo, langRef.current).then((r) => {
      if (live && r) commit(r);
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [online, unlocked, repo, commit]);

  // Re-evaluate every minute so a plan that ends while the app is open is locked on time.
  useEffect(() => {
    const id = setInterval(() => {
      if (cache) void viewFromCache(cache).then(setView);
    }, 60_000);
    return () => clearInterval(id);
  }, [cache]);

  const value = useMemo<SubscriptionCtx>(() => ({
    view,
    cache,
    testMode,
    loading,
    has: (f) => hasFeature(view, f),
    refresh,
    apply,
    async redeem(code) {
      return apply(await redeemCode(code));
    },
    async updateCache(patch) {
      const c = { ...(await repo.getSubscriptionCache()), ...patch };
      await repo.saveSubscriptionCache(c);
      setCache(c);
    },
  }), [view, cache, testMode, loading, refresh, apply, repo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSubscription(): SubscriptionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSubscription must be used inside SubscriptionProvider');
  return ctx;
}
