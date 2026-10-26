import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Banner, Body, Button, Card, colors, H2, Screen } from '../../components/ui';
import { CONFIG } from '../../config';
import { callNumber } from '../../lib/device';
import { useApp } from '../../state/AppContext';

export default function Help() {
  const { t, lang } = useApp();
  return (
    <Screen>
      <Button variant="danger" title={t('help.sos')} onPress={() => router.push('/citizen/sos-send')} testID="help-sos" />
      <H2>{t('help.hotlines')}</H2>
      {CONFIG.hotlines.map((h) => (
        <Card key={h.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primaryDark }}>{h.number}</Text>
              <Text style={{ fontSize: 15, color: colors.muted }}>{h.label[lang]}</Text>
            </View>
            <Button title={t('common.call', { number: h.number })} onPress={() => callNumber(h.number)} />
          </View>
        </Card>
      ))}

      <H2>{t('help.smsTitle')}</H2>
      <Body>{t('help.smsBody')}</Body>
      <Button variant="secondary" title={t('help.smsButton')} onPress={() => router.push('/citizen/report?channel=sms')} testID="help-sms" />

      <H2>{t('help.ussdTitle')}</H2>
      <Body>{t('help.ussdBody', { code: CONFIG.ussdCode.code })}</Body>
      {CONFIG.ussdCode.isPlaceholder ? <Banner kind="warn">{t('help.placeholder')}</Banner> : null}

      <H2>{t('help.services')}</H2>
      {(['help.svc.police', 'help.svc.minproff', 'help.svc.health', 'help.svc.ngo'] as const).map((k) => (
        <Body key={k}>• {t(k)}</Body>
      ))}
    </Screen>
  );
}
