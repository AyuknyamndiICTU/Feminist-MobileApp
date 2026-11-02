import { Image } from 'react-native';

const LOGO = require('../../assets/brand/safeher-logo.png');
const MARK = require('../../assets/brand/safeher-mark.png');

/**
 * SafeHer logo, shown only inside the hidden part of the app. The launcher icon and name stay the
 * calculator disguise, so the brand never appears on the home screen.
 */
export function Logo({ width = 160 }: { width?: number }) {
  return <Image source={LOGO} style={{ width, height: (width * 320) / 1200 }} resizeMode="contain" accessibilityLabel="SafeHer" />;
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return <Image source={MARK} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="SafeHer" />;
}
