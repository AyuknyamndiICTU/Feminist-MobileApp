import { router } from 'expo-router';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { Logo } from '../../components/Logo';
import { Banner, Body, Button, Card, colors, Field, H2, Pill, Screen } from '../../components/ui';
import {
  formatXaf,
  maskMsisdn,
  normalizeActivationCode,
  PLAN_IDS,
  PLANS,
  type PlanId,
  type PremiumFeature,
} from '../../domain/subscription';
import type { TKey } from '../../i18n';
import { payErrorText } from '../../lib/payErrors';
import { SubscriptionApiError } from '../../services/subscription';
import { useApp } from '../../state/AppContext';
import { useSubscription } from '../../state/SubscriptionContext';

const TOOLS: { feature: PremiumFeature; href: string; title: TKey; hint: TKey; plus?: boolean }[] = [
  { feature: 'vault', href: '/citizen/vault', title: 'premium.f.vault', hint: 'premium.f.vaultHint' },
  { feature: 'checkin', href: '/citizen/safe-walk', title: 'premium.f.checkin', hint: 'premium.f.checkinHint' },
  { feature: 'fakeCall', href: '/citizen/fake-call', title: 'premium.f.fakeCall', hint: 'premium.f.fakeCallHint' },
  { feature: 'counselling', href: '/citizen/counselling', title: 'premium.f.counselling', hint: 'premium.f.counsellingHint', plus: true },
];

const PLAN_FEATURES: Record<PlanId, TKey[]> = {
  monthly: ['premium.f.vault', 'premium.f.checkin', 'premium.f.fakeCall'],
  yearly: ['premium.f.vault', 'premium.f.checkin', 'premium.f.fakeCall'],
  plus: ['premium.f.vault', 'premium.f.checkin', 'premium.f.fakeCall', 'premium.f.counselling', 'premium.family'],
};

export default function Premium() {
  const { t, lang, online } = useApp();
  const { view, cache, testMode, has, redeem } = useSubscription();
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<{ kind: 'success' | 'danger'; text: string }>();
  const [busy, setBusy] = useState(false);

  const date = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(lang) : '');

  const activate = async () => {
    const normalized = normalizeActivationCode(code);
    if (!normalized) return setCodeMsg({ kind: 'danger', text: t('premium.codeFormat') });
    setBusy(true);
    try {
      const v = await redeem(normalized);
      setCode('');
      setCodeMsg({ kind: 'success', text: t('premium.codeOk', { date: date(v.expiresAt) }) });
    } catch (e) {
      const c = e instanceof SubscriptionApiError ? e.code : 'generic';
      setCodeMsg({ kind: 'danger', text: c === 'code_invalid' ? t('premium.codeInvalid') : payErrorText(c, t) });
    } finally {
      setBusy(false);
    }
  };

  const quick = cache?.lastPlanId && cache.lastProvider && cache.lastMsisdn ? cache : null;

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginBottom: 8 }}>
        <Logo width={190} />
      </View>
      <Body muted>{t('premium.free')}</Body>

      {view.status === 'active' ? (
        <Banner kind={view.expiringSoon ? 'warn' : 'success'}>
          {view.expiringSoon
            ? view.endsWithinDay
              ? t('premium.endsToday', { time: new Date(view.expiresAt!).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) })
              : t('premium.expiringSoon', { days: view.daysLeft ?? 0 })
            : t('premium.statusActive', { plan: PLANS[view.planId!].name[lang], date: date(view.expiresAt) })}
        </Banner>
      ) : view.status === 'expired' ? (
        <Banner kind="danger">{t('premium.statusExpired', { date: date(view.expiresAt) })}</Banner>
      ) : view.status === 'untrusted' ? (
        <Banner kind="warn">{t('premium.statusUntrusted')}</Banner>
      ) : (
        <Banner kind="info">{t('premium.statusNone')}</Banner>
      )}
      {testMode ? <Banner kind="warn">{t('premium.testMode')}</Banner> : null}

      {cache?.familyCode ? (
        <Card>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.primaryDark }}>{t('premium.family')}</Text>
          <Text selectable style={{ fontSize: 22, fontWeight: '800', letterSpacing: 2, marginVertical: 8, color: colors.text }}>{cache.familyCode}</Text>
          <Body muted>{t('premium.familyHint')}</Body>
          <Button
            variant="secondary"
            title={t('premium.shareCode')}
            onPress={() => Share.share({ message: t('premium.familyShareText', { code: cache.familyCode! }) }).catch(() => undefined)}
          />
        </Card>
      ) : null}

      <H2>{t('premium.tools')}</H2>
      {TOOLS.map((tool) => (
        <Card key={tool.feature} onPress={() => router.push(tool.href as never)} label={t(tool.title)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primaryDark, flex: 1 }}>{t(tool.title)} ›</Text>
            {!has(tool.feature) ? <Pill text={`🔒 ${t(tool.plus ? 'premium.lockedPlus' : 'premium.locked')}`} color={colors.primary} /> : null}
          </View>
          <Text style={{ color: colors.muted, marginTop: 4, fontSize: 15 }}>{t(tool.hint)}</Text>
        </Card>
      ))}

      {quick ? (
        <Button
          title={t('premium.quickRenew', { plan: PLANS[quick.lastPlanId!].name[lang], number: maskMsisdn(quick.lastMsisdn!) })}
          onPress={() => router.push(`/citizen/pay?plan=${quick.lastPlanId}&quick=1`)}
          disabled={!online}
          testID="premium-quick-renew"
        />
      ) : null}

      <H2>{t('premium.choose')}</H2>
      {!online ? <Banner kind="warn">{t('premium.offline')}</Banner> : null}
      {PLAN_IDS.map((id) => {
        const p = PLANS[id];
        const highlight = id === 'plus';
        return (
          <View
            key={id}
            style={{
              backgroundColor: highlight ? colors.primaryDark : colors.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              borderWidth: highlight ? 0 : 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: highlight ? '#fff' : colors.primaryDark }}>{p.name[lang]}</Text>
              {p.badge ? <Pill text={p.badge[lang]} color={highlight ? '#2DD4BF' : colors.success} /> : null}
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800', marginTop: 6, color: highlight ? '#fff' : colors.text }}>
              {formatXaf(p.priceXaf, lang)}
              <Text style={{ fontSize: 15, fontWeight: '600', color: highlight ? '#E8C4B0' : colors.muted }}> {t(`premium.perPeriod.${p.periodDays}` as TKey)}</Text>
            </Text>
            {PLAN_FEATURES[id].map((k) => (
              <Text key={k} style={{ fontSize: 15, marginTop: 4, color: highlight ? '#F2DCCF' : colors.text }}>✓ {t(k)}</Text>
            ))}
            <Button
              variant={highlight ? 'secondary' : 'primary'}
              title={t('premium.select', { plan: p.name[lang] })}
              onPress={() => router.push(`/citizen/pay?plan=${id}`)}
              disabled={!online}
              testID={`premium-choose-${id}`}
            />
          </View>
        );
      })}
      <Body muted>{t('premium.billing')}</Body>

      <H2>{t('premium.haveCode')}</H2>
      <Field
        label={t('premium.codeLabel')}
        value={code}
        onChangeText={(v) => { setCode(v.toUpperCase()); setCodeMsg(undefined); }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={24}
        testID="premium-code"
      />
      <Button variant="secondary" title={t('premium.codeApply')} onPress={activate} disabled={busy || !online || code.length < 16} testID="premium-code-apply" />
      {codeMsg ? <Banner kind={codeMsg.kind}>{codeMsg.text}</Banner> : null}
    </Screen>
  );
}
