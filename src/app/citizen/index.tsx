import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Logo, LogoMark } from '../../components/Logo';
import { Banner, Body, Button, Card, colors, H2, Screen, Title } from '../../components/ui';
import { callNumber } from '../../lib/device';
import { sosNative } from '../../services/sos';
import { useApp } from '../../state/AppContext';
import { useSubscription } from '../../state/SubscriptionContext';

function MenuCard({ title, hint, href, testID }: { title: string; hint?: string; href: string; testID?: string }) {
  return (
    <Card onPress={() => router.push(href as never)} label={title}>
      <Text testID={testID} style={{ fontSize: 18, fontWeight: '700', color: colors.primaryDark }}>{title} ›</Text>
      {hint ? <Text style={{ color: colors.muted, marginTop: 4, fontSize: 15 }}>{hint}</Text> : null}
    </Card>
  );
}

/** While a hands-free SOS is running, lets the user stop the remaining calls once she is safe. */
function SosInProgress({ t }: { t: ReturnType<typeof useApp>['t'] }) {
  const [active, setActive] = useState(false);
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    if (!sosNative) return;
    let alive = true;
    sosNative.isActive().then((a) => { if (alive) setActive(a); }).catch(() => undefined);
    const sub = sosNative.addListener('onSosEvent', (e) => {
      if (e.type === 'triggered' || e.type === 'dispatched') { setActive(true); setStopped(false); }
      if (e.type === 'finished' || e.type === 'cancelled') setActive(false);
    });
    return () => { alive = false; sub.remove(); };
  }, []);

  if (stopped) return <Banner kind="success">{t('hub.sosStopped')}</Banner>;
  if (!active) return null;
  return (
    <>
      <Banner kind="danger">{t('hub.sosActive')}</Banner>
      <Button
        variant="secondary"
        title={t('hub.sosStop')}
        onPress={() => sosNative?.cancel().then(() => { setActive(false); setStopped(true); }).catch(() => undefined)}
        testID="hub-sos-stop"
      />
    </>
  );
}

/** Premium status at a glance: active, ending soon, ended, or what Premium offers. */
function PremiumCard({ t }: { t: ReturnType<typeof useApp>['t'] }) {
  const { lang } = useApp();
  const { view } = useSubscription();
  const hint =
    view.status === 'active'
      ? view.expiringSoon
        ? view.endsWithinDay
          ? t('hub.premiumEndsToday', { time: new Date(view.expiresAt!).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })
          : t('hub.premiumExpiring', { days: view.daysLeft ?? 0 })
        : t('hub.premiumActive', { date: new Date(view.expiresAt!).toLocaleDateString(lang) })
      : view.status === 'expired'
        ? t('hub.premiumExpired')
        : t('hub.premiumNone');
  return (
    <Card onPress={() => router.push('/citizen/premium')} label={t('hub.premium')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <LogoMark size={36} />
        <View style={{ flex: 1 }}>
          <Text testID="hub-premium" style={{ fontSize: 18, fontWeight: '700', color: colors.primaryDark }}>{t('hub.premium')} ›</Text>
          <Text style={{ color: view.status === 'expired' || view.expiringSoon ? colors.danger : colors.muted, marginTop: 2, fontSize: 15 }}>{hint}</Text>
        </View>
      </View>
    </Card>
  );
}

export default function CitizenHub() {
  const { t, online } = useApp();
  return (
    <Screen>
      <View style={{ alignItems: 'flex-start', marginBottom: 4 }}>
        <Logo width={150} />
      </View>
      <Title>{t('hub.title')}</Title>
      <Body muted>{t('hub.subtitle')}</Body>
      {!online ? <Banner kind="warn">{t('common.offline')}</Banner> : null}
      <SosInProgress t={t} />

      <View style={{ backgroundColor: '#FCE4E2', borderRadius: 12, padding: 16, marginVertical: 12 }}>
        <H2>{t('hub.dangerTitle')}</H2>
        <Button variant="danger" title={t('hub.sos')} onPress={() => router.push('/citizen/sos-send')} testID="hub-sos" />
        <Button variant="danger" title={t('common.call', { number: '1166' })} onPress={() => callNumber('1166')} />
        <Button variant="secondary" title={t('hub.getHelp')} onPress={() => router.push('/citizen/help')} testID="hub-help" />
      </View>

      <MenuCard title={t('hub.handsFree')} hint={t('hub.handsFreeHint')} href="/citizen/sos" testID="hub-sos-setup" />
      <PremiumCard t={t} />
      <MenuCard title={t('hub.report')} hint={t('hub.reportHint')} href="/citizen/report" testID="hub-report" />
      <MenuCard title={t('hub.myReports')} href="/citizen/my-reports" testID="hub-mine" />
      <MenuCard title={t('hub.safety')} href="/citizen/safety" />
      <MenuCard title={t('hub.settings')} href="/citizen/settings" testID="hub-settings" />
      <MenuCard title={t('hub.agent')} hint={t('hub.agentHint')} href="/agent" testID="hub-agent" />

      <Banner kind="info">{t('hub.exitTip')}</Banner>
    </Screen>
  );
}
