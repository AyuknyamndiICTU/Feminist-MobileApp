import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Banner, Body, Button, Card, colors, Field, H2, Screen } from '../../components/ui';
import { CONFIG } from '../../config';
import {
  detectProvider,
  formatXaf,
  maskMsisdn,
  normalizeCmMsisdn,
  PLANS,
  type PlanId,
  type Provider,
} from '../../domain/subscription';
import type { TKey } from '../../i18n';
import { payErrorText } from '../../lib/payErrors';
import {
  getPayment,
  newIdempotencyKey,
  startPayment,
  SubscriptionApiError,
  type FailureReason,
  type PaymentCreated,
} from '../../services/subscription';
import { useApp } from '../../state/AppContext';
import { useSubscription } from '../../state/SubscriptionContext';

type Phase = 'form' | 'sending' | 'pending' | 'success' | 'failed';

const WALLET: Record<Provider, { label: TKey; bg: string; fg: string }> = {
  mtn: { label: 'pay.mtn', bg: '#FFCC00', fg: '#1C1B1F' },
  orange: { label: 'pay.orange', bg: '#FF7900', fg: '#FFFFFF' },
};

export default function Pay() {
  const { t, lang } = useApp();
  const { cache, testMode, apply, updateCache } = useSubscription();
  const params = useLocalSearchParams<{ plan?: string; quick?: string }>();
  const planId: PlanId = params.plan && params.plan in PLANS ? (params.plan as PlanId) : 'yearly';
  const plan = PLANS[planId];
  const quick = params.quick === '1' && cache?.lastMsisdn ? cache : null;

  const [msisdn, setMsisdn] = useState(quick?.lastMsisdn?.slice(3) ?? '');
  const [provider, setProvider] = useState<Provider | null>(quick?.lastProvider ?? null);
  const [touchedProvider, setTouchedProvider] = useState(!!quick);
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<PaymentCreated>();
  const [failure, setFailure] = useState<FailureReason>();
  const [expiresAt, setExpiresAt] = useState<number>();
  const [now, setNow] = useState(0);
  const idemKey = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (phase !== 'pending') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const onNumber = (v: string) => {
    setMsisdn(v);
    setError(undefined);
    if (!touchedProvider) setProvider(detectProvider(v));
  };

  const poll = async (paymentId: string) => {
    while (alive.current) {
      await new Promise((r) => setTimeout(r, CONFIG.subscription.pollIntervalMs));
      if (!alive.current) return;
      try {
        const s = await getPayment(paymentId);
        if (s.status === 'pending') continue;
        await updateCache({ pendingPaymentId: undefined });
        if (s.status === 'succeeded' && s.subscription) {
          const v = await apply(s.subscription);
          setExpiresAt(v.expiresAt);
          setPhase('success');
        } else {
          setFailure(s.failureReason ?? 'timeout');
          setPhase('failed');
        }
        return;
      } catch {
        // Temporary network problem: keep waiting; the server keeps the payment.
      }
    }
  };

  const pay = async () => {
    const normalized = normalizeCmMsisdn(msisdn);
    if (!normalized) return setError(t('pay.invalid'));
    if (!provider) return setError(t('pay.chooseWallet'));
    idemKey.current ??= newIdempotencyKey();
    setPhase('sending');
    setError(undefined);
    try {
      const c = await startPayment(planId, provider, normalized, idemKey.current);
      await updateCache({ pendingPaymentId: c.paymentId, lastProvider: provider, lastMsisdn: normalized, lastPlanId: planId });
      setCreated(c);
      setNow(Date.now());
      setPhase('pending');
      void poll(c.paymentId);
    } catch (e) {
      setError(payErrorText(e instanceof SubscriptionApiError ? e.code : 'generic', t));
      setPhase('form');
    }
  };

  const retry = () => {
    idemKey.current = null;
    setCreated(undefined);
    setFailure(undefined);
    setPhase('form');
  };

  const amount = formatXaf(plan.priceXaf, lang);
  const wallet = (p: Provider) => t(WALLET[p].label);

  if (phase === 'pending' || phase === 'sending') {
    const left = created ? Math.max(0, Math.round((Date.parse(created.expiresAt) - now) / 1000)) : 0;
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    return (
      <Screen>
        <H2>{t('pay.approve')}</H2>
        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        {created ? (
          <>
            <Body>{t('pay.approveBody', { wallet: wallet(created.provider), amount, number: created.maskedMsisdn })}</Body>
            <Banner kind="info">{t('pay.noPrompt', { ussd: created.approvalUssd })}</Banner>
            <Body muted>{t('pay.waiting', { time })}</Body>
          </>
        ) : null}
        <Body muted>{t('pay.pinNote')}</Body>
        {testMode ? <Banner kind="warn">{t('premium.testMode')}</Banner> : null}
      </Screen>
    );
  }

  if (phase === 'success') {
    return (
      <Screen>
        <Text style={{ fontSize: 56, textAlign: 'center', marginTop: 24 }}>✓</Text>
        <Banner kind="success">{t('pay.success', { date: expiresAt ? new Date(expiresAt).toLocaleDateString(lang) : '' })}</Banner>
        <Button title={t('pay.done')} onPress={() => router.back()} testID="pay-done" />
      </Screen>
    );
  }

  if (phase === 'failed') {
    const reason = failure ?? 'provider_error';
    return (
      <Screen>
        <Banner kind="danger">{t(`pay.failed.${reason}` as TKey, { wallet: created ? wallet(created.provider) : '' })}</Banner>
        <Button title={t('pay.retry')} onPress={retry} testID="pay-retry" />
        <Button variant="ghost" title={t('pay.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primaryDark }}>{t('pay.plan', { plan: plan.name[lang], amount })}</Text>
      </Card>
      {testMode ? <Banner kind="warn">{t('premium.testMode')}</Banner> : null}

      <H2>{t('pay.with')}</H2>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        {(['mtn', 'orange'] as Provider[]).map((p) => {
          const on = provider === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              aria-checked={on}
              onPress={() => { setProvider(p); setTouchedProvider(true); setError(undefined); }}
              testID={`pay-${p}`}
              style={{
                flex: 1,
                minHeight: 64,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? WALLET[p].bg : colors.card,
                borderWidth: 2,
                borderColor: on ? WALLET[p].bg : colors.border,
              }}
            >
              <Text style={{ fontWeight: '800', fontSize: 16, color: on ? WALLET[p].fg : colors.text }}>{wallet(p)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label={t('pay.number')}
        value={msisdn}
        onChangeText={onNumber}
        keyboardType="phone-pad"
        maxLength={17}
        placeholder="6 77 12 34 56"
        error={error}
        testID="pay-number"
      />
      <Body muted>{normalizeCmMsisdn(msisdn) ? maskMsisdn(msisdn) : t('pay.numberHint')}</Body>
      <Body muted>{t('pay.pinNote')}</Body>
      <Body muted>{t('premium.billing')}</Body>
      <Button title={t('pay.submit', { amount })} onPress={pay} testID="pay-submit" />
      <Button variant="ghost" title={t('pay.cancel')} onPress={() => router.back()} />
    </Screen>
  );
}
