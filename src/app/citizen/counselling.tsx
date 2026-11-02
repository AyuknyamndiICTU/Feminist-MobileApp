import { useEffect, useState } from 'react';

import { PremiumGate } from '../../components/Premium';
import { Banner, Body, Button, Choice, Field, Screen } from '../../components/ui';
import { CONFIG } from '../../config';
import type { CallbackKind } from '../../domain/callback';
import { counsellingLeft } from '../../domain/subscription';
import type { SafeTime } from '../../domain/types';
import { isPlausiblePhone } from '../../domain/validation';
import { ApiError } from '../../services/api';
import { newId, useApp } from '../../state/AppContext';
import { useSubscription } from '../../state/SubscriptionContext';

const TIMES: SafeTime[] = ['morning', 'afternoon', 'evening', 'any'];

function Counselling() {
  const { t, repo, api, online } = useApp();
  const { cache } = useSubscription();
  const [kind, setKind] = useState<CallbackKind>('counselling');
  const [phone, setPhone] = useState('');
  const [time, setTime] = useState<SafeTime>('any');
  const [note, setNote] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger' | 'warn'; text: string }>();
  const [phoneError, setPhoneError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([repo.getPremiumPrefs(), repo.getSosSettings()]).then(([prefs, sos]) => {
      setLeft(counsellingLeft(prefs.counsellingRequests, new Date(), CONFIG.subscription.counsellingPerMonth));
      setPhone((p) => p || sos.callbackNumber);
    });
  }, [repo]);

  const submit = async () => {
    if (!isPlausiblePhone(phone.replace(/\s/g, ''))) return setPhoneError(t('report.err.safeContact'));
    setPhoneError(undefined);
    setBusy(true);
    try {
      const sos = await repo.getSosSettings();
      await api.submitCallbackRequest(
        {
          requestId: newId(),
          createdAt: new Date().toISOString(),
          kind,
          phone: phone.replace(/\s/g, ''),
          safeTime: time,
          region: sos.homeArea.region,
          note: note.trim().slice(0, 300) || undefined,
        },
        cache?.entitlement ?? '',
      );
      const prefs = await repo.getPremiumPrefs();
      const requests = [...prefs.counsellingRequests, new Date().toISOString()].slice(-24);
      await repo.savePremiumPrefs({ ...prefs, counsellingRequests: requests });
      setLeft(counsellingLeft(requests, new Date(), CONFIG.subscription.counsellingPerMonth));
      setNote('');
      setMsg({ kind: 'success', text: t('coun.sent') });
    } catch (e) {
      const quota = e instanceof ApiError && e.code === 'forbidden';
      setMsg({ kind: 'danger', text: quota ? t('coun.none') : t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  if (left === null) return null;

  return (
    <Screen>
      <Body muted>{t('coun.intro', { left })}</Body>
      {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}
      {left === 0 ? (
        <Banner kind="info">{t('coun.none')}</Banner>
      ) : (
        <>
          <Choice<CallbackKind>
            label={t('coun.type')}
            options={[{ value: 'counselling', label: t('coun.counselling') }, { value: 'legal', label: t('coun.legal') }]}
            value={kind}
            onChange={setKind}
          />
          <Field label={t('coun.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={20} error={phoneError} />
          <Choice<SafeTime>
            label={t('coun.time')}
            options={TIMES.map((v) => ({ value: v, label: t(`report.time.${v}`) }))}
            value={time}
            onChange={setTime}
          />
          <Field label={t('coun.note')} value={note} onChangeText={setNote} multiline maxLength={300} />
          {!online ? <Banner kind="warn">{t('coun.needOnline')}</Banner> : null}
          <Button title={t('coun.submit')} onPress={submit} disabled={busy || !online} testID="coun-submit" />
        </>
      )}
    </Screen>
  );
}

export default function CounsellingScreen() {
  return (
    <PremiumGate feature="counselling">
      <Counselling />
    </PremiumGate>
  );
}
