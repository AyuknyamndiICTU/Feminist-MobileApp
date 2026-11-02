import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Modal, Text, View } from 'react-native';

import type { PremiumFeature } from '../domain/subscription';
import { useApp } from '../state/AppContext';
import { useSubscription } from '../state/SubscriptionContext';
import { LogoMark } from './Logo';
import { Body, Button, colors, Screen } from './ui';

/** Shows the tool if the plan includes it; otherwise explains why and links to the plans. */
export function PremiumGate({ feature, children }: { feature: PremiumFeature; children: ReactNode }) {
  const { t } = useApp();
  const { has } = useSubscription();
  if (has(feature)) return <>{children}</>;
  const plus = feature === 'counselling' || feature === 'family' || feature === 'priority';
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginVertical: 24 }}>
        <LogoMark size={72} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', color: colors.primaryDark, marginBottom: 8 }}>{t('gate.title')}</Text>
      <Body>{t(plus ? 'gate.plusBody' : 'gate.body')}</Body>
      <Button title={t('gate.see')} onPress={() => router.replace('/citizen/premium')} testID="gate-see-plans" />
    </Screen>
  );
}

/**
 * Pop-up shown once per expiry when a plan has ended. Emergency features are unaffected, and the
 * text says so, so an expired plan never discourages calling for help.
 */
export function RenewalDialog() {
  const { t, unlocked } = useApp();
  const { view, cache, updateCache } = useSubscription();
  const visible = unlocked && view.status === 'expired' && !!view.expiresAt && cache?.expiredNoticeFor !== view.expiresAt;

  const close = (renew: boolean) => {
    void updateCache({ expiredNoticeFor: view.expiresAt });
    if (renew) router.push('/citizen/premium');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(28,27,31,0.55)', justifyContent: 'center', padding: 24 }}>
        <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderRadius: 20, padding: 20 }}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <LogoMark size={56} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', textAlign: 'center', color: colors.primaryDark, marginBottom: 8 }}>
            {t('renew.title')}
          </Text>
          <Body>{t('renew.body')}</Body>
          <Button title={t('renew.now')} onPress={() => close(true)} testID="renew-now" />
          <Button variant="ghost" title={t('renew.later')} onPress={() => close(false)} testID="renew-later" />
        </View>
      </View>
    </Modal>
  );
}
