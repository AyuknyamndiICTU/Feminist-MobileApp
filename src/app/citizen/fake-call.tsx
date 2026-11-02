import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StatusBar, Text, Vibration, View } from 'react-native';

import { PremiumGate } from '../../components/Premium';
import { Banner, Body, Button, Choice, Field, Screen } from '../../components/ui';
import type { TKey } from '../../i18n';
import { useApp } from '../../state/AppContext';

const DELAYS = [0, 10, 30, 60, 300] as const;
type Phase = 'idle' | 'waiting' | 'ringing' | 'talking';

function FakeCall() {
  const { t, repo } = useApp();
  const [name, setName] = useState('Maman');
  const [delay, setDelay] = useState(10);
  const [phase, setPhase] = useState<Phase>('idle');
  const [left, setLeft] = useState(0);
  const [talked, setTalked] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    repo.getPremiumPrefs().then((p) => { setName(p.fakeCallerName); setDelay(p.fakeCallDelaySec); }).catch(() => undefined);
  }, [repo]);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => { clear(); Vibration.cancel(); }, []);

  const ring = () => {
    clear();
    setPhase('ringing');
    Vibration.vibrate([0, 1000, 800], true);
  };

  const start = async () => {
    const caller = name.trim().slice(0, 30) || 'Maman';
    const prefs = await repo.getPremiumPrefs();
    await repo.savePremiumPrefs({ ...prefs, fakeCallerName: caller, fakeCallDelaySec: delay });
    if (delay === 0) return ring();
    setLeft(delay);
    setPhase('waiting');
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          ring();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const accept = () => {
    Vibration.cancel();
    setTalked(0);
    setPhase('talking');
    timer.current = setInterval(() => setTalked((s) => s + 1), 1000);
  };

  const end = () => {
    Vibration.cancel();
    clear();
    setPhase('idle');
  };

  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Screen>
      <Body muted>{t('fake.intro')}</Body>
      <Field label={t('fake.caller')} value={name} onChangeText={setName} maxLength={30} testID="fake-name" />
      <Choice<string>
        label={t('fake.delay')}
        options={DELAYS.map((d) => ({ value: String(d), label: t(`fake.d.${d}` as TKey) }))}
        value={String(delay)}
        onChange={(v) => setDelay(Number(v))}
      />
      {phase === 'waiting' ? (
        <>
          <Banner kind="info">{t('fake.scheduled', { time: mmss(left) })}</Banner>
          <Button variant="secondary" title={t('fake.cancel')} onPress={end} />
        </>
      ) : (
        <Button title={t('fake.start')} onPress={start} testID="fake-start" />
      )}

      <Modal visible={phase === 'ringing' || phase === 'talking'} animationType="slide" onRequestClose={end} statusBarTranslucent>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, backgroundColor: '#101418', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 80 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#9AA4AE', fontSize: 16 }}>{phase === 'ringing' ? t('fake.incoming') : mmss(talked)}</Text>
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: '#2B3440', alignItems: 'center', justifyContent: 'center', marginVertical: 24 }}>
              <Text style={{ color: '#fff', fontSize: 44, fontWeight: '600' }}>{(name.trim()[0] ?? 'M').toUpperCase()}</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 32, fontWeight: '500' }}>{name.trim() || 'Maman'}</Text>
            <Text style={{ color: '#9AA4AE', fontSize: 16, marginTop: 6 }}>{t('fake.mobile')}</Text>
          </View>
          {phase === 'ringing' ? (
            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-around' }}>
              <RoundButton color="#E5484D" label={t('fake.decline')} icon="✕" onPress={end} />
              <RoundButton color="#30A46C" label={t('fake.accept')} icon="✆" onPress={accept} />
            </View>
          ) : (
            <RoundButton color="#E5484D" label={t('fake.end')} icon="✕" onPress={end} />
          )}
        </View>
      </Modal>
    </Screen>
  );
}

function RoundButton({ color, label, icon, onPress }: { color: string; label: string; icon: string; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, backgroundColor: color, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: '#fff', fontSize: 30 }}>{icon}</Text>
      </Pressable>
      <Text style={{ color: '#fff', marginTop: 8, fontSize: 15 }}>{label}</Text>
    </View>
  );
}

export default function FakeCallScreen() {
  return (
    <PremiumGate feature="fakeCall">
      <FakeCall />
    </PremiumGate>
  );
}
