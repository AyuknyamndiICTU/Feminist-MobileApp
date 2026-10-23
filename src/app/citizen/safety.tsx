import { Banner, Body, Button, H2, Screen } from '../../components/ui';
import { callNumber } from '../../lib/device';
import { useApp } from '../../state/AppContext';

const TIPS = ['safety.tip1', 'safety.tip2', 'safety.tip3', 'safety.tip4', 'safety.tip5', 'safety.tip6'] as const;

export default function Safety() {
  const { t } = useApp();
  return (
    <Screen>
      <H2>{t('safety.warnTitle')}</H2>
      <Banner kind="danger">{t('safety.warnBody')}</Banner>
      <Button variant="danger" title={t('common.call', { number: '1166' })} onPress={() => callNumber('1166')} />

      <H2>{t('safety.cycleTitle')}</H2>
      <Body>{t('safety.cycleBody')}</Body>

      <H2>{t('safety.planTitle')}</H2>
      {TIPS.map((k, i) => <Body key={k}>{i + 1}. {t(k)}</Body>)}
    </Screen>
  );
}
