import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const colors = {
  primary: '#5B2A86',
  primaryDark: '#3E1C5C',
  danger: '#B3261E',
  success: '#1E6B3A',
  warn: '#8A5A00',
  info: '#1F4E79',
  bg: '#F7F5FA',
  card: '#FFFFFF',
  text: '#1C1B1F',
  muted: '#545057',
  border: '#D5D0DB',
  chip: '#EFE9F5',
};

/**
 * Scrollable page. Android 16 draws apps edge-to-edge, so content is padded by the system bar
 * insets; `safeTop` is for screens without a navigation header.
 */
export function Screen({ children, safeTop }: { children: ReactNode; safeTop?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={[
        s.screenContent,
        { paddingBottom: 48 + insets.bottom },
        safeTop ? { paddingTop: 16 + insets.top } : null,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={s.title}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={s.h2}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[s.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function Card({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  if (!onPress) return <View style={s.card}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title, onPress, variant = 'primary', disabled, testID,
}: { title: string; onPress: () => void; variant?: Variant; disabled?: boolean; testID?: string }) {
  const bg = { primary: colors.primary, secondary: colors.card, danger: colors.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'ghost' ? colors.primary : '#FFFFFF';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.primary : bg },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 },
      ]}
    >
      <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

const BANNER = {
  info: { bg: '#E3EEF8', fg: colors.info },
  warn: { bg: '#FFF4D6', fg: colors.warn },
  danger: { bg: '#FCE4E2', fg: colors.danger },
  success: { bg: '#E2F3E7', fg: colors.success },
};

export function Banner({ kind = 'info', children }: { kind?: keyof typeof BANNER; children: ReactNode }) {
  return (
    <View accessibilityRole={kind === 'danger' ? 'alert' : undefined} style={[s.banner, { backgroundColor: BANNER[kind].bg }]}>
      <Text style={[s.bannerText, { color: BANNER[kind].fg }]}>{children}</Text>
    </View>
  );
}

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <Text style={s.label}>
      {children}
      {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <Text accessibilityLiveRegion="polite" style={s.error}>{children}</Text>;
}

export function Field({
  label, required, error, ...input
}: TextInputProps & { label: string; required?: boolean; error?: string }) {
  return (
    <View style={s.field}>
      <Label required={required}>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[s.input, error ? { borderColor: colors.danger } : null, input.multiline ? { minHeight: 90, textAlignVertical: 'top' } : null]}
        {...input}
      />
      <FieldError>{error}</FieldError>
    </View>
  );
}

export interface Option<T extends string> { value: T; label: string }

export function Choice<T extends string>({
  label, options, value, onChange, required, error,
}: { label?: string; options: Option<T>[]; value?: T; onChange: (v: T) => void; required?: boolean; error?: string }) {
  return (
    <View style={s.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <Label required={required}>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              aria-checked={selected}
              onPress={() => onChange(o.value)}
              style={[s.chip, selected && s.chipOn]}
            >
              <Text style={[s.chipText, selected && s.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <FieldError>{error}</FieldError>
    </View>
  );
}

export function MultiChoice<T extends string>({
  label, options, values, onChange,
}: { label?: string; options: Option<T>[]; values: T[]; onChange: (v: T[]) => void }) {
  return (
    <View style={s.field}>
      {label ? <Label>{label}</Label> : null}
      <View style={s.chips}>
        {options.map((o) => {
          const selected = values.includes(o.value);
          return (
            <Pressable
              key={o.value}
              accessibilityRole="checkbox"
              aria-checked={selected}
              onPress={() => onChange(selected ? values.filter((v) => v !== o.value) : [...values, o.value])}
              style={[s.chip, selected && s.chipOn]}
            >
              <Text style={[s.chipText, selected && s.chipTextOn]}>{selected ? '✓ ' : ''}{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={s.toggle}
    >
      <Text style={[s.body, { flex: 1, marginBottom: 0 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <Text style={[s.pillText, { color }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
  h2: { fontSize: 18, fontWeight: '700', color: colors.primaryDark, marginTop: 16, marginBottom: 8 },
  body: { fontSize: 16, lineHeight: 23, color: colors.text, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  button: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginVertical: 6 },
  buttonText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  banner: { borderRadius: 10, padding: 12, marginVertical: 8 },
  bannerText: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 6 },
  error: { color: colors.danger, fontSize: 14, marginTop: 4 },
  field: { marginBottom: 14 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 48, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, color: colors.text },
  chipTextOn: { color: '#FFFFFF', fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, minHeight: 48, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  pill: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  pillText: { fontSize: 13, fontWeight: '700' },
});
