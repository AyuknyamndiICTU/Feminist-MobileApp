/**
 * Disguise screen (Layer 4): a fully working calculator. Typing the secret code and pressing "="
 * opens the hidden app. A wrong code simply behaves like a normal calculation.
 */
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONFIG } from '../config';
import { evaluate, formatResult } from '../lib/calc';
import { verifySecretCode } from '../services/secretCode';
import { useApp } from '../state/AppContext';

const KEYS = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];
const OPS = new Set(['÷', '×', '−', '+']);

export default function Calculator() {
  const { unlocked, unlock } = useApp();
  const insets = useSafeAreaInsets();
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('0');

  // Navigate only once the unlocked state is committed, so the protected route is already open.
  useEffect(() => {
    if (unlocked) router.replace('/citizen');
  }, [unlocked]);

  const press = async (k: string) => {
    if (k === 'C') { setExpr(''); setResult('0'); return; }
    if (k === '⌫') { setExpr((e) => e.slice(0, -1)); return; }
    if (k === '%') {
      const v = evaluate(expr);
      if (v !== null) { const r = formatResult(v / 100); setExpr(r); setResult(r); }
      return;
    }
    if (k === '=') {
      const candidate = expr;
      const v = evaluate(candidate);
      setResult(v === null ? 'Error' : formatResult(v));
      setExpr(v === null ? '' : formatResult(v));
      const looksLikeCode =
        /^\d+$/.test(candidate) &&
        candidate.length >= CONFIG.minSecretCodeLength &&
        candidate.length <= CONFIG.maxSecretCodeLength;
      if (looksLikeCode && (await verifySecretCode(candidate))) {
        setExpr('');
        setResult('0');
        unlock();
      }
      return;
    }
    setExpr((e) => {
      const last = e[e.length - 1];
      if (OPS.has(k) && last && OPS.has(last)) return e.slice(0, -1) + k;
      if (e.length >= 24) return e;
      return e + k;
    });
  };

  return (
    <View style={[s.root, { paddingTop: 12 + insets.top, paddingBottom: 12 + insets.bottom }]}>
      <StatusBar style="light" />
      <View style={s.display}>
        <Text style={s.expr} numberOfLines={1} adjustsFontSizeToFit>{expr || ' '}</Text>
        <Text style={s.result} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{result}</Text>
      </View>
      <View style={s.pad}>
        {KEYS.map((row, i) => (
          <View key={i} style={s.row}>
            {row.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityLabel={k}
                testID={`calc-${k}`}
                onPress={() => press(k)}
                style={({ pressed }) => [
                  s.key,
                  k === '0' && s.zero,
                  OPS.has(k) || k === '=' ? s.op : ['C', '⌫', '%'].includes(k) ? s.fn : null,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[s.keyText, ['C', '⌫', '%'].includes(k) && { color: '#111' }]}>{k}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end', paddingHorizontal: 12 },
  display: { paddingHorizontal: 12, paddingBottom: 16, alignItems: 'flex-end' },
  expr: { color: '#9a9a9a', fontSize: 28 },
  result: { color: '#fff', fontSize: 64, fontWeight: '300' },
  pad: { gap: 12, maxWidth: 460, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  key: { flex: 1, aspectRatio: 1, borderRadius: 999, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  zero: { flex: 2.1, aspectRatio: undefined, borderRadius: 999 },
  op: { backgroundColor: '#FF9F0A' },
  fn: { backgroundColor: '#A5A5A5' },
  keyText: { color: '#fff', fontSize: 30 },
});
