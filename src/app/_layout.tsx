import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppProvider, useApp } from '../state/AppContext';

/**
 * Access is declarative: when `unlocked` turns false (Exit button, app backgrounded) the router
 * drops every citizen/agent screen from history and falls back to the calculator.
 */
function RootNavigator() {
  const { hasCode, unlocked } = useApp();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={hasCode}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={unlocked}>
          <Stack.Screen name="citizen" />
          <Stack.Screen name="agent" />
        </Stack.Protected>
      </Stack.Protected>
      <Stack.Protected guard={!hasCode}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProvider>
  );
}
