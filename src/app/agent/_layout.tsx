import { Stack } from 'expo-router';

import { ExitButton } from '../../components/ExitButton';
import { colors } from '../../components/ui';
import { useScreenPrivacy } from '../../lib/device';
import { useApp } from '../../state/AppContext';

export default function AgentLayout() {
  const { t, session } = useApp();
  useScreenPrivacy('agent');

  return (
    <Stack
      screenOptions={{
        headerRight: () => <ExitButton />,
        headerTintColor: colors.primary,
        headerBackTitle: t('common.back'),
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="index" options={{ title: t('agent.home') }} />
        <Stack.Screen name="case" options={{ title: t('form.titleNew') }} />
        <Stack.Screen name="cases" options={{ title: t('cases.title') }} />
        <Stack.Screen name="verify" options={{ title: t('verify.title') }} />
        <Stack.Screen name="lookup" options={{ title: t('lookup.title') }} />
        <Stack.Screen name="indicators" options={{ title: t('ind.title') }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ title: t('agent.loginTitle') }} />
      </Stack.Protected>
    </Stack>
  );
}
