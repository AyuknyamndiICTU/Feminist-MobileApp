import { Stack } from 'expo-router';

import { ExitButton } from '../../components/ExitButton';
import { RenewalDialog } from '../../components/Premium';
import { colors } from '../../components/ui';
import { useScreenPrivacy } from '../../lib/device';
import { useApp } from '../../state/AppContext';

export default function CitizenLayout() {
  const { t } = useApp();
  useScreenPrivacy('citizen');

  return (
    <>
      <Stack
        screenOptions={{
          headerRight: () => <ExitButton />,
          headerTintColor: colors.primary,
          headerBackTitle: t('common.back'),
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '' }} />
        <Stack.Screen name="help" options={{ title: t('help.title') }} />
        <Stack.Screen name="report" options={{ title: t('report.title') }} />
        <Stack.Screen name="my-reports" options={{ title: t('mine.title') }} />
        <Stack.Screen name="safety" options={{ title: t('safety.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title') }} />
        <Stack.Screen name="sos" options={{ title: t('sos.title') }} />
        <Stack.Screen name="sos-send" options={{ title: t('sos.sendTitle') }} />
        <Stack.Screen name="premium" options={{ title: t('premium.title') }} />
        <Stack.Screen name="pay" options={{ title: t('pay.title') }} />
        <Stack.Screen name="vault" options={{ title: t('vault.title') }} />
        <Stack.Screen name="safe-walk" options={{ title: t('walk.title') }} />
        <Stack.Screen name="fake-call" options={{ title: t('fake.title') }} />
        <Stack.Screen name="counselling" options={{ title: t('coun.title') }} />
      </Stack>
      <RenewalDialog />
    </>
  );
}
