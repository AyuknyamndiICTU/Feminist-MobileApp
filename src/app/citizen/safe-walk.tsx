import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';

import { PremiumGate } from '../../components/Premium';
import { Banner, Body, Button, Choice, colors, Screen, Toggle } from '../../components/ui';
import type { TKey } from '../../i18n';
import { useFocusReload } from '../../lib/useFocusReload';
import { sosNative } from '../../services/sos';
import { useApp } from '../../state/AppContext';

const DURATIONS = [15, 30, 60, 120] as const;
const MIN = 60_000;

function SafeWalk() {
  const { t, lang, repo, dataVersion } = useApp();
  const [ready, setReady] = useState<boolean | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [notify, setNotify] = useState(true);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [inexact, setInexact] = useState(false);
  const [msg, setMsg] = useState<string>();

  const load = useCallback(() => {
    if (!sosNative) return setReady(false);
    setNow(Date.now());
    setDeadline(sosNative.getCheckIn());
    repo.getSosSettings().then((s) => setReady(s.armed && s.contacts.length > 0)).catch(() => setReady(false));
  }, [repo]);
  useFocusReload(load, dataVersion);

  useEffect(() => {
    if (deadline <= 0) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (sosNative && sosNative.getCheckIn() === 0) setDeadline(0);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!sosNative) return <Screen><Banner kind="info">{t('walk.androidOnly')}</Banner></Screen>;

  const clock = (ms: number) => new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  const begin = async () => {
    const at = Date.now() + minutes * MIN;
    const sms = notify ? t('walk.smsText', { time: clock(at) }) : null;
    const r = await sosNative!.scheduleCheckIn(at, sms);
    setInexact(!r.exact);
    setNow(Date.now());
    setDeadline(at);
    setMsg(undefined);
  };

  // Without exact alarms Android may start the SOS minutes late, so ask before the walk, not after.
  const start = () => {
    if (sosNative!.canScheduleExactAlarms()) return void begin();
    Alert.alert(t('walk.exactTitle'), t('walk.exactAlarm'), [
      { text: t('walk.startAnyway'), style: 'cancel', onPress: () => void begin() },
      { text: t('walk.openSettings'), onPress: () => void sosNative!.openExactAlarmSettings() },
    ]);
  };

  const extend = async () => {
    const at = Math.max(deadline, Date.now()) + 15 * MIN;
    const r = await sosNative!.scheduleCheckIn(at, null);
    setInexact(!r.exact);
    setNow(Date.now());
    setDeadline(at);
  };

  const arrived = async () => {
    await sosNative!.cancelCheckIn();
    setDeadline(0);
    setMsg(t('walk.done'));
  };

  const active = deadline > 0;
  const left = Math.max(0, Math.round((deadline - now) / 1000));
  const countdown = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return (
    <Screen>
      <Body muted>{t('walk.intro')}</Body>
      {msg ? <Banner kind="success">{msg}</Banner> : null}
      {ready === false && !active ? (
        <>
          <Banner kind="warn">{t('walk.needSos')}</Banner>
          <Button variant="secondary" title={t('hub.handsFree')} onPress={() => router.push('/citizen/sos')} />
        </>
      ) : null}

      {active ? (
        <>
          <Banner kind="warn">{t('walk.active', { time: clock(deadline) })}</Banner>
          <Text style={{ fontSize: 56, fontWeight: '800', textAlign: 'center', color: colors.primaryDark, marginVertical: 12 }}>{countdown}</Text>
          <Button title={t('walk.arrived')} onPress={arrived} testID="walk-arrived" />
          <Button variant="secondary" title={t('walk.extend')} onPress={extend} />
        </>
      ) : ready ? (
        <>
          <Choice<string>
            label={t('walk.duration')}
            options={DURATIONS.map((d) => ({ value: String(d), label: t(`walk.d.${d}` as TKey) }))}
            value={String(minutes)}
            onChange={(v) => setMinutes(Number(v))}
          />
          <Toggle label={t('walk.notify')} value={notify} onChange={setNotify} />
          <Button title={t('walk.start')} onPress={start} testID="walk-start" />
        </>
      ) : null}

      {inexact || (active && !sosNative.canScheduleExactAlarms()) ? (
        <>
          <Banner kind="info">{t('walk.exactAlarm')}</Banner>
          <Button variant="ghost" title={t('walk.openSettings')} onPress={() => void sosNative!.openExactAlarmSettings()} />
        </>
      ) : null}
    </Screen>
  );
}

export default function SafeWalkScreen() {
  return (
    <PremiumGate feature="checkin">
      <SafeWalk />
    </PremiumGate>
  );
}
