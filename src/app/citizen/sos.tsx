import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import type { TestEvent } from '../../../modules/sos-trigger';
import { LocationPicker } from '../../components/LocationPicker';
import { ContactsEditor } from '../../components/sos/ContactsEditor';
import { VoiceSetup } from '../../components/sos/VoiceSetup';
import { Banner, Body, Button, Card, colors, Field, H2, Screen, Toggle } from '../../components/ui';
import { CONFIG } from '../../config';
import {
  fillSosTemplate,
  NON_BLOCKING_SOS_ERRORS,
  safeCallbackNumber,
  sosSmsTemplate,
  validateSosSettings,
  VOICE_PHRASE_LABEL,
  type SosSettings,
  type SosSettingsError,
} from '../../domain/sos';
import type { TKey } from '../../i18n';
import {
  applySosSettings,
  checkPermissions,
  handsFreeSupported,
  requestPermissions,
  requiredPermissions,
  sosNative,
  type PermissionState,
  type SosPermission,
} from '../../services/sos';
import { newId, useApp } from '../../state/AppContext';

const ERR: Record<SosSettingsError, TKey> = {
  contacts: 'sos.err.contacts',
  trigger: 'sos.err.trigger',
  voiceprint: 'sos.err.voiceprint',
  callbackNumber: 'sos.err.callbackNumber',
  tooManyContacts: 'sos.err.max',
};
const PREVIEW_GEO = { lat: 3.86667, lng: 11.51667, accuracy: 15 };

const blockingErrors = (s: SosSettings, max: number) =>
  validateSosSettings(s, max).filter((e) => !NON_BLOCKING_SOS_ERRORS.includes(e));

type Msg = { kind: 'success' | 'warn' | 'danger' | 'info'; text: string };

export default function SosSetup() {
  const { t, lang, repo } = useApp();
  const [s, setS] = useState<SosSettings | null>(null);
  const [perms, setPerms] = useState<PermissionState>({});
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<Msg>();
  const [testing, setTesting] = useState(false);
  const [testLeftMs, setTestLeftMs] = useState(0);
  const [testLog, setTestLog] = useState<string[]>([]);
  const current = useRef<SosSettings | null>(null);
  const max = CONFIG.sos.maxContacts;
  const seconds = CONFIG.sos.graceMs / 1000;

  const refresh = useCallback(async (cur: SosSettings) => {
    setPerms(await checkPermissions(requiredPermissions(cur)));
    setRunning(sosNative?.isRunning() ?? false);
  }, []);

  useEffect(() => {
    repo.getSosSettings().then((cur) => {
      current.current = cur;
      setS(cur);
      return refresh(cur);
    }).catch(() => undefined);
  }, [repo, refresh]);

  useEffect(() => {
    if (!sosNative) return;
    const line = (e: TestEvent) => {
      const time = new Date(e.at).toLocaleTimeString(lang);
      if (e.type === 'voice') {
        return `${time} · ${t('sos.test.voiceScore', { score: e.score.toFixed(2), threshold: CONFIG.sos.voice.threshold.toFixed(2) })}`;
      }
      return `${time} · ${t(e.source === 'cancel' ? 'sos.test.cancel' : e.source === 'voice' ? 'sos.test.voice' : 'sos.test.volume')}`;
    };
    // Locking the screen locks the app, so the results of a test run are read back from the service.
    const restore = () => {
      const st = sosNative!.getTestStatus();
      setTesting(st.active);
      setTestLeftMs(st.remainingMs);
      setTestLog(st.events.slice().reverse().map(line));
    };
    restore();
    const sub = sosNative.addListener('onSosEvent', (e) => {
      if (e.type === 'armed') setRunning(true);
      else if (e.type === 'disarmed') setRunning(false);
      else if (e.type === 'testMode' || e.type === 'test' || e.type === 'voice') restore();
    });
    return () => sub.remove();
  }, [t, lang]);

  useEffect(() => {
    if (!testing) return;
    const timer = setTimeout(() => {
      setTesting(false);
      setTestLog((l) => [t('sos.test.ended'), ...l]);
    }, testLeftMs);
    return () => clearTimeout(timer);
  }, [testing, testLeftMs, t]);

  /**
   * Every change is saved at once; an armed service is reconfigured, or disarmed if it can no longer
   * work. A missing voiceprint or a bad optional call-back number does not disarm: the voice trigger
   * waits for enrolment and the number is left out of alerts.
   */
  const persist = useCallback(async (next: SosSettings) => {
    let saved = next;
    if (next.armed && blockingErrors(next, max).length > 0) {
      saved = { ...next, armed: false };
      setMsg({ kind: 'warn', text: t('sos.disarmedInvalid') });
    }
    current.current = saved;
    setS(saved);
    await repo.saveSosSettings(saved);
    // Always sync the native copy: it also serves the in-app SOS button, and disarms when turned off.
    await applySosSettings(saved, lang).catch(() => undefined);
    await refresh(saved);
  }, [repo, lang, max, refresh, t]);

  const edit = (patch: Partial<SosSettings>) => {
    if (!current.current) return;
    const next = { ...current.current, ...patch };
    current.current = next;
    setS(next);
  };
  const save = (patch: Partial<SosSettings>) => current.current && persist({ ...current.current, ...patch });

  const pauseOrResume = useCallback(async (busy: boolean) => {
    if (!sosNative) return;
    if (busy) await sosNative.disarm().catch(() => undefined);
    else await applySosSettings(await repo.getSosSettings(), lang).catch(() => undefined);
  }, [repo, lang]);

  if (!s) return null;

  const turnOn = async () => {
    const cur = current.current ?? s;
    const errs = blockingErrors(cur, max);
    if (errs.length > 0) return setMsg({ kind: 'danger', text: errs.map((e) => t(ERR[e], { max })).join(' ') });
    const granted = await requestPermissions(requiredPermissions(cur));
    await refresh(cur);
    if (!granted.sms || !granted.call) return setMsg({ kind: 'danger', text: t('sos.err.permissions') });
    await persist({ ...cur, armed: true });
    setMsg({ kind: 'success', text: t('sos.statusOn') });
    setTimeout(() => {
      if (sosNative && !sosNative.isRunning()) setMsg({ kind: 'danger', text: t('sos.err.start') });
    }, 2000);
  };

  const startTest = async () => {
    if (!running) return setMsg({ kind: 'warn', text: t('sos.testNeedsOn') });
    setTestLog([]);
    await sosNative?.setTestMode(true);
  };

  const required = requiredPermissions(s);
  const missing = required.filter((p) => !perms[p]);
  const phrase = VOICE_PHRASE_LABEL[lang];
  const preview = fillSosTemplate(sosSmsTemplate(lang, s.senderName), lang, s.shareLocation ? PREVIEW_GEO : undefined, '21:04');

  return (
    <Screen>
      <Body>{t('sos.how', { phrase, seconds, hotline: CONFIG.sos.hotline })}</Body>
      {handsFreeSupported ? (
        <Banner kind={s.armed && running ? 'success' : 'warn'}>{t(s.armed && running ? 'sos.statusOn' : 'sos.statusOff')}</Banner>
      ) : (
        <Banner kind="info">{t('sos.unsupported')}</Banner>
      )}
      {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}

      <H2>{t('sos.contacts')}</H2>
      <Body muted>{t('sos.contactsHint', { max })}</Body>
      <ContactsEditor contacts={s.contacts} onChange={(contacts) => save({ contacts })} max={max} newId={newId} t={t} />
      <Field
        label={t('sos.senderName')}
        value={s.senderName}
        onChangeText={(senderName) => edit({ senderName })}
        onEndEditing={() => save({})}
        maxLength={40}
      />
      <Field
        label={t('sos.callback')}
        value={s.callbackNumber}
        onChangeText={(callbackNumber) => edit({ callbackNumber })}
        onEndEditing={() => save({})}
        keyboardType="phone-pad"
        maxLength={20}
        error={s.callbackNumber && !safeCallbackNumber(s.callbackNumber) ? t('sos.err.callbackNumber') : undefined}
      />

      <H2>{t('sos.area')}</H2>
      <Body muted>{t('sos.areaHint')}</Body>
      <LocationPicker value={s.homeArea} onChange={(homeArea) => save({ homeArea })} lang={lang} t={t} />

      {handsFreeSupported ? (
        <>
          <H2>{t('sos.triggers')}</H2>
          <Toggle label={t('sos.volume')} value={s.volumeTrigger} onChange={(volumeTrigger) => save({ volumeTrigger })} />
          <Toggle label={t('sos.voice', { phrase })} value={s.voiceTrigger} onChange={(voiceTrigger) => save({ voiceTrigger })} />
          {s.voiceTrigger ? (
            <Card>
              <VoiceSetup
                key={lang}
                lang={lang}
                voiceprint={s.voiceprint}
                onEnrolled={(voiceprint) => save({ voiceprint })}
                onRemove={() => save({ voiceprint: undefined, voiceTrigger: false })}
                onBusy={pauseOrResume}
                t={t}
              />
            </Card>
          ) : null}
          <Toggle label={t('sos.location')} value={s.shareLocation} onChange={(shareLocation) => save({ shareLocation })} />
          <Body muted>{t('sos.locationHint')}</Body>
        </>
      ) : null}

      <H2>{t('sos.preview')}</H2>
      <Card>
        <Text style={{ fontSize: 15, color: colors.text }}>{preview}</Text>
      </Card>

      <H2>{t('sos.who')}</H2>
      {s.contacts.map((c, i) => <Body key={c.id}>{t('sos.whoContact', { n: i + 1, name: c.name })}</Body>)}
      <Body>{t('sos.whoHotline', { n: s.contacts.length + 1, hotline: CONFIG.sos.hotline })}</Body>
      <Body>{t('sos.whoInstitutions')}</Body>
      {CONFIG.sos.gateway.isPlaceholder ? <Banner kind="warn">{t('sos.gatewayPending')}</Banner> : null}
      <Banner kind="info">{t('sos.emergencyNumbers')}</Banner>

      {handsFreeSupported ? (
        <>
          <H2>{t('sos.permissions')}</H2>
          {required.map((p: SosPermission) => (
            <Body key={p}>{`${perms[p] ? '✓' : '✗'} ${t(`sos.perm.${p}`)}`}</Body>
          ))}
          {missing.length > 0 ? (
            <Button variant="secondary" title={t('sos.allow')} onPress={() => requestPermissions(required).then(() => refresh(s))} />
          ) : null}

          {s.armed ? (
            <Button variant="secondary" title={t('sos.turnOff')} onPress={() => save({ armed: false })} testID="sos-turn-off" />
          ) : (
            <Button title={t('sos.turnOn')} onPress={turnOn} testID="sos-turn-on" />
          )}

          <H2>{t('sos.test')}</H2>
          <Body muted>{t('sos.testHint', { minutes: CONFIG.sos.testModeMs / 60000 })}</Body>
          {testing ? (
            <Button variant="secondary" title={t('sos.testStop')} onPress={() => sosNative?.setTestMode(false)} />
          ) : (
            <Button variant="secondary" title={t('sos.testStart')} onPress={startTest} testID="sos-test" />
          )}
          {testLog.map((line, i) => <Body key={`${i}-${line}`}>{line}</Body>)}
        </>
      ) : null}

      <H2>{t('sos.privacyTitle')}</H2>
      <Body muted>{`• ${t('sos.privacy1')}`}</Body>
      {handsFreeSupported ? <Body muted>{`• ${t('sos.privacy2')}`}</Body> : null}
      <Body muted>{`• ${t('sos.privacy3', { seconds })}`}</Body>
      <Body muted>{`• ${t('sos.privacy4')}`}</Body>
      {handsFreeSupported ? <Body muted>{`• ${t('sos.privacy5')}`}</Body> : null}
    </Screen>
  );
}
