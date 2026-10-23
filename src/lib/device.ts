import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';

/** Blocks screenshots/recordings and hides content in the recent-apps switcher (no-op on web). */
export function useScreenPrivacy(key: string): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenCapture.preventScreenCaptureAsync(key).catch(() => undefined);
    return () => {
      ScreenCapture.allowScreenCaptureAsync(key).catch(() => undefined);
    };
  }, [key]);
}

export function callNumber(number: string): void {
  Linking.openURL(`tel:${number}`).catch(() => undefined);
}

export function composeSms(number: string, body: string): void {
  const sep = Platform.OS === 'ios' ? '&' : '?';
  Linking.openURL(`sms:${number}${sep}body=${encodeURIComponent(body)}`).catch(() => undefined);
}
