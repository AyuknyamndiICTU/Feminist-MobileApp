import { Pressable, Text } from 'react-native';

import { useApp } from '../state/AppContext';
import { colors } from './ui';

/** Always-visible quick exit: returns to the calculator and locks the app. */
export function ExitButton() {
  const { t, lock } = useApp();
  return (
    <Pressable
      testID="quick-exit"
      accessibilityRole="button"
      accessibilityLabel={t('common.exit')}
      onPress={lock}
      hitSlop={12}
      style={{ backgroundColor: colors.danger, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8 }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>✕ {t('common.exit')}</Text>
    </Pressable>
  );
}
