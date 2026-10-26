import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CONFIG } from '../../config';
import {
  assessEnrollment,
  averageVoiceprint,
  matchesPhrase,
  VOICE_PHRASE_LABEL,
  VOICE_PHRASES,
  type Voiceprint,
} from '../../domain/sos';
import type { Lang } from '../../domain/types';
import type { Translator } from '../../i18n';
import {
  downloadVoiceModels,
  recordVoiceSample,
  requestPermissions,
  sosNative,
  voiceModelsReady,
} from '../../services/sos';
import { Banner, Body, Button } from '../ui';

interface Props {
  lang: Lang;
  voiceprint?: Voiceprint;
  onEnrolled: (vp: Voiceprint) => void;
  onRemove: () => void;
  /** Pause (true) or resume (false) the background listener so enrolment cannot fire a real SOS. */
  onBusy: (busy: boolean) => Promise<void>;
  t: Translator;
}

type Msg = { kind: 'info' | 'warn' | 'danger'; text: string };

/** Enrolment for one language; the parent remounts it (key) when the app language changes. */
export function VoiceSetup({ lang, voiceprint, onEnrolled, onRemove, onBusy, t }: Props) {
  const [ready, setReady] = useState(() => voiceModelsReady(lang));
  const [progress, setProgress] = useState<number | null>(null);
  const [samples, setSamples] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [redo, setRedo] = useState(false);
  const [msg, setMsg] = useState<Msg>();
  const paused = useRef(false);
  const busyRef = useRef(onBusy);
  useEffect(() => {
    busyRef.current = onBusy;
  }, [onBusy]);

  const v = CONFIG.sos.voice;
  const count = v.enrollmentSamples;
  const phrase = VOICE_PHRASE_LABEL[lang];

  useEffect(() => {
    const sub = sosNative?.addListener('onSosEvent', (e) => {
      if (e.type === 'download') setProgress(e.progress);
    });
    return () => {
      sub?.remove();
      sosNative?.stopRecording();
      sosNative?.endEnrollment().catch(() => undefined);
      if (paused.current) busyRef.current(false);
    };
  }, []);

  if (!sosNative) return null;

  const download = async () => {
    setMsg(undefined);
    setProgress(0);
    try {
      await downloadVoiceModels(lang);
      setReady(true);
    } catch {
      setMsg({ kind: 'danger', text: t('voice.downloadError') });
    } finally {
      setProgress(null);
    }
  };

  const record = async () => {
    const perm = await requestPermissions(['mic']);
    if (!perm.mic) return setMsg({ kind: 'danger', text: t('voice.micDenied') });
    // The background listener is paused only while recording, so it cannot hear the phrase and
    // send a real SOS; the SOS is back on as soon as each recording ends.
    paused.current = true;
    await onBusy(true);
    setRecording(true);
    setMsg({ kind: 'info', text: t('voice.listening') });
    let enrolled = false;
    try {
      const s = await recordVoiceSample(lang);
      if (!s.text) return setMsg({ kind: 'warn', text: t('voice.nothing') });
      if (!matchesPhrase(s.text, VOICE_PHRASES[lang])) return setMsg({ kind: 'warn', text: t('voice.heard', { text: s.text, phrase }) });
      if (s.vector.length === 0 || s.frames < v.minFrames) return setMsg({ kind: 'warn', text: t('voice.short') });
      const next = [...samples, s.vector];
      if (next.length < count) {
        setSamples(next);
        return setMsg(undefined);
      }
      setSamples([]);
      if (!assessEnrollment(next, count, v.threshold).ok) return setMsg({ kind: 'danger', text: t('voice.inconsistent') });
      setMsg(undefined);
      setRedo(false);
      // The parent saves the voiceprint and re-arms the service with it.
      enrolled = true;
      paused.current = false;
      onEnrolled({ lang, vector: averageVoiceprint(next), samples: next.length, enrolledAt: new Date().toISOString() });
    } catch {
      setMsg({ kind: 'danger', text: t('common.error') });
    } finally {
      setRecording(false);
      if (!enrolled && paused.current) {
        paused.current = false;
        await onBusy(false);
      }
    }
  };

  if (voiceprint && !redo) {
    return (
      <View>
        <Banner kind="success">{t('voice.enrolled', { count: voiceprint.samples })}</Banner>
        <Body muted>{t('voice.langNote', { lang: voiceprint.lang === 'fr' ? 'Français' : 'English' })}</Body>
        <Button variant="secondary" title={t('voice.redo')} onPress={() => setRedo(true)} />
        <Button variant="ghost" title={t('voice.remove')} onPress={onRemove} />
      </View>
    );
  }

  if (!ready) {
    const mb = CONFIG.sos.voiceModels[lang].sizeMb + CONFIG.sos.voiceModels.speaker.sizeMb;
    return (
      <View>
        <Body>{t('voice.download', { mb })}</Body>
        {progress !== null ? <Body muted>{t('voice.downloading', { pct: progress })}</Body> : null}
        <Button variant="secondary" title={t('voice.downloadButton')} onPress={download} disabled={progress !== null} testID="voice-download" />
        {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}
      </View>
    );
  }

  return (
    <View>
      <Body>{t('voice.intro', { phrase, count })}</Body>
      <Button
        variant="secondary"
        title={t('voice.record', { n: samples.length + 1, count })}
        onPress={record}
        disabled={recording}
        testID="voice-record"
      />
      {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}
      <Body muted>{t('voice.biometric')}</Body>
    </View>
  );
}
