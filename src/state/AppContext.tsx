import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { CONFIG } from '../config';
import type { AgentSession, Lang } from '../domain/types';
import { makeT, type Translator } from '../i18n';
import { createDeviceCipher, destroyDeviceKey } from '../services/crypto';
import { EncryptedStore } from '../services/encryptedStore';
import { MockNisServer } from '../services/mockServer';
import { LocalRepository } from '../services/repository';
import { clearSecretCode, hasSecretCode } from '../services/secretCode';
import { connectivity, isOnline } from '../services/connectivity';
import { applySosSettings, collectNativeAlerts, sosNative } from '../services/sos';
import { deviceStore } from '../services/storage';
import { SyncEngine } from '../services/sync';

interface Services {
  repo: LocalRepository;
  api: MockNisServer;
  sync: SyncEngine;
}

interface AppCtx extends Services {
  lang: Lang;
  setLang(lang: Lang): Promise<void>;
  t: Translator;
  online: boolean;
  simulateOffline: boolean;
  setSimulateOffline(v: boolean): Promise<void>;
  unlocked: boolean;
  unlock(): void;
  lock(): void;
  session: AgentSession | null;
  setSession(s: AgentSession | null): void;
  hasCode: boolean;
  /** Called once the secret code is stored: enables the calculator and opens the app. */
  completeSetup(): void;
  wipeDevice(): Promise<void>;
  /** Incremented after background sync so screens can reload. */
  dataVersion: number;
  bumpData(): void;
}

const Ctx = createContext<AppCtx | null>(null);

async function buildServices(): Promise<Services> {
  const deviceCipher = await createDeviceCipher();
  // The mock "national server" lives on-device only for the demo; its key is separate so that a
  // citizen's crypto-erase removes device data without pretending to delete server records.
  const serverCipher = await createDeviceCipher('nis_mock_server_key');
  const repo = new LocalRepository(new EncryptedStore(deviceStore, deviceCipher, 'nis:'));
  const api = new MockNisServer({
    store: new EncryptedStore(deviceStore, serverCipher, 'srv:'),
    isOnline,
    randomBytes: (n) => Crypto.getRandomBytes(n),
    latencyMs: 250,
  });
  return { repo, api, sync: new SyncEngine(repo, api) };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<Services | null>(null);
  const [lang, setLangState] = useState<Lang>('fr');
  const [netConnected, setNetConnected] = useState(true);
  const [simulateOffline, setSimOffline] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [hasCode, setHasCode] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const online = netConnected && !simulateOffline;
  const sessionRef = useRef(session);
  useEffect(() => { connectivity.online = online; }, [online]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await buildServices();
      const settings = await s.repo.getSettings();
      const code = await hasSecretCode();
      if (cancelled) return;
      setLangState(settings.lang);
      setSimOffline(settings.simulateOffline);
      setHasCode(code);
      setServices(s);
      // The app is in the foreground here, so Android allows the microphone again after a reboot.
      if (code && sosNative) {
        const sos = await s.repo.getSosSettings();
        if (sos.armed) await applySosSettings(sos, settings.lang).catch(() => undefined);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => NetInfo.addEventListener((s) => setNetConnected(s.isConnected !== false)), []);

  const lock = useCallback(() => {
    setUnlocked(false);
    setSession(null);
  }, []);

  // Citizens are locked the moment the app leaves the foreground; agents get a short grace period.
  const backgroundAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
        if (!sessionRef.current) lock();
      } else if (state === 'active' && backgroundAt.current !== null) {
        const away = Date.now() - backgroundAt.current;
        backgroundAt.current = null;
        if (sessionRef.current && away > CONFIG.agentBackgroundGraceMs) lock();
      }
    });
    return () => sub.remove();
  }, [lock]);

  useEffect(() => {
    if (!services || !online) return;
    (async () => {
      await collectNativeAlerts(services.repo);
      const a = await services.sync.flushSosAlerts();
      const r = await services.sync.flushCitizenReports();
      const c = session ? await services.sync.syncCases(session) : { pushed: 0 };
      if (a.pushed + r.pushed + c.pushed > 0) setDataVersion((v) => v + 1);
    })().catch(() => undefined);
  }, [services, online, session]);

  // An SOS sent by the background service reaches the national platform as soon as the app can.
  useEffect(() => {
    if (!services || !sosNative) return;
    const sub = sosNative.addListener('onSosEvent', (e) => {
      if (e.type !== 'dispatched') return;
      (async () => {
        await collectNativeAlerts(services.repo);
        if ((await services.sync.flushSosAlerts()).pushed > 0) setDataVersion((v) => v + 1);
      })().catch(() => undefined);
    });
    return () => sub.remove();
  }, [services]);

  const value = useMemo<AppCtx | null>(() => {
    if (!services) return null;
    return {
      ...services,
      lang,
      t: makeT(lang),
      async setLang(l) {
        setLangState(l);
        await services.repo.saveSettings({ ...(await services.repo.getSettings()), lang: l });
        // The SOS text is written in the app language.
        const sos = await services.repo.getSosSettings();
        if (sos.armed) await applySosSettings(sos, l).catch(() => undefined);
      },
      online,
      simulateOffline,
      async setSimulateOffline(v) {
        setSimOffline(v);
        await services.repo.saveSettings({ ...(await services.repo.getSettings()), simulateOffline: v });
      },
      unlocked,
      unlock: () => setUnlocked(true),
      lock,
      session,
      setSession,
      hasCode,
      completeSetup() {
        setHasCode(true);
        setUnlocked(true);
      },
      async wipeDevice() {
        await sosNative?.clear().catch(() => undefined);
        await services.repo.wipe();
        await clearSecretCode();
        await destroyDeviceKey();
        setServices(await buildServices());
        setHasCode(false);
        setUnlocked(false);
        setSession(null);
      },
      dataVersion,
      bumpData: () => setDataVersion((v) => v + 1),
    };
  }, [services, lang, online, simulateOffline, unlocked, lock, session, hasCode, dataVersion]);

  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function newId(): string {
  return Crypto.randomUUID();
}
