import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { SosTriggerEvents, VoiceSample } from './SosTrigger.types';

declare class SosTriggerModule extends NativeModule<SosTriggerEvents> {
  /** Stores the `NativeSosConfig` JSON (encrypted with a Keystore key) and reloads the service if armed. */
  configure(configJson: string): Promise<void>;
  arm(): Promise<void>;
  disarm(): Promise<void>;
  isRunning(): boolean;
  /** Stops everything and crypto-erases the native copy of the settings and the alert outbox. */
  clear(): Promise<void>;
  trigger(source: 'button', immediate: boolean): Promise<void>;
  cancel(): Promise<boolean>;
  isActive(): Promise<boolean>;
  setTestMode(enabled: boolean): Promise<void>;
  isModelReady(name: string): boolean;
  downloadModel(name: string, url: string, sha256: string | null): Promise<void>;
  recordVoiceSample(model: string, speakerModel: string, timeoutMs: number): Promise<VoiceSample>;
  stopRecording(): void;
  endEnrollment(): Promise<void>;
  /** JSON array of alerts recorded by the service, removed from native storage once taken. */
  takePendingAlerts(): Promise<string>;
}

/** Android only; null on iOS, web and Expo Go, where the app falls back to in-app actions. */
export default requireOptionalNativeModule<SosTriggerModule>('SosTrigger');
