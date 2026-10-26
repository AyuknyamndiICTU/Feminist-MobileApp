export type SosNativeEvent =
  | { type: 'armed'; voice: boolean; volume: boolean }
  | { type: 'disarmed' }
  | { type: 'triggered'; source: string; graceMs: number }
  | { type: 'cancelled' }
  | { type: 'dispatched'; source: string; smsSent: number; calls: number }
  | { type: 'finished' }
  | { type: 'test'; source: 'volume' | 'voice' | 'cancel' }
  | { type: 'testMode'; enabled: boolean; durationMs: number }
  | { type: 'voice'; score: number; accepted: boolean }
  | { type: 'download'; name: string; progress: number }
  | { type: 'error'; detail: string };

export type SosTriggerEvents = {
  onSosEvent: (event: SosNativeEvent) => void;
};

export interface VoiceSample {
  text: string;
  vector: number[];
  frames: number;
}
