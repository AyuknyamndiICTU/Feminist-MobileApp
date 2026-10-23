import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Banner, Body, Button, Card, colors, H2, Screen, Title } from '../../components/ui';
import { callNumber } from '../../lib/device';
import { useApp } from '../../state/AppContext';

function MenuCard({ title, hint, href, testID }: { title: string; hint?: string; href: string; testID?: string }) {
  return (
    <Card onPress={() => router.push(href as never)} label={title}>
      <Text testID={testID} style={{ fontSize: 18, fontWeight: '700', color: colors.primaryDark }}>{title} ›</Text>
      {hint ? <Text style={{ color: colors.muted, marginTop: 4, fontSize: 15 }}>{hint}</Text> : null}
    </Card>
  );
}

export default function CitizenHub() {
  const { t, online } = useApp();
  return (
    <Screen>
      <Title>{t('hub.title')}</Title>
      <Body muted>{t('hub.subtitle')}</Body>
      {!online ? <Banner kind="warn">{t('common.offline')}</Banner> : null}

      <View style={{ backgroundColor: '#FCE4E2', borderRadius: 12, padding: 16, marginVertical: 12 }}>
        <H2>{t('hub.dangerTitle')}</H2>
        <Button variant="danger" title={t('common.call', { number: '1166' })} onPress={() => callNumber('1166')} />
        <Button variant="secondary" title={t('hub.getHelp')} onPress={() => router.push('/citizen/help')} testID="hub-help" />
      </View>

      <MenuCard title={t('hub.report')} hint={t('hub.reportHint')} href="/citizen/report" testID="hub-report" />
      <MenuCard title={t('hub.myReports')} href="/citizen/my-reports" testID="hub-mine" />
      <MenuCard title={t('hub.safety')} href="/citizen/safety" />
      <MenuCard title={t('hub.settings')} href="/citizen/settings" testID="hub-settings" />
      <MenuCard title={t('hub.agent')} hint={t('hub.agentHint')} href="/agent" testID="hub-agent" />

      <Banner kind="info">{t('hub.exitTip')}</Banner>
    </Screen>
  );
}
