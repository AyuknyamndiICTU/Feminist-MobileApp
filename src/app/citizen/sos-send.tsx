/** In-app SOS: a short visible countdown (cancellable), then the same alert as the hands-free trigger. */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Banner, Body, Button, colors, Screen } from '../../components/ui';
import { CONFIG } from '../../config';
import type { SosSettings } from '../../domain/sos';
import { callNumber } from '../../lib/device';
import { sendSosNow, type SosSendResult } from '../../services/sos';
import { newId, useApp } from '../../state/AppContext';

type Phase = 'counting' | 'sending' | 'done' | 'cancelled' | 'error';

const DONE_KEY: Record<SosSendResult, 'sosSend.native' | 'sosSend.fallback' | 'sosSend.hotline'> = {
  native: 'sosSend.native',
  fallback: 'sosSend.fallback',
  hotline: 'sosSend.hotline',
};

export default function SosSend() {
  const { t, lang, repo } = useApp();
  const [settings, setSettings] = useState<SosSettings | null>(null);
  const [left, setLeft] = useState(Math.round(CONFIG.sos.graceMs / 1000));
  const [phase, setPhase] = useState<Phase>('counting');
  const [result, setResult] = useState<SosSendResult>();
  const hotline = CONFIG.sos.hotline;

  useEffect(() => {
    repo.getSosSettings().then(setSettings).catch(() => setPhase('error'));
  }, [repo]);

  useEffect(() => {
    if (phase !== 'counting' || !settings) return;
    const timer = setTimeout(() => {
      if (left > 1) {
        setLeft(left - 1);
        return;
      }
      setPhase('sending');
      sendSosNow(settings, lang, repo, newId)
        .then((r) => {
          setResult(r);
          setPhase('done');
        })
        .catch(() => setPhase('error'));
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, left, settings, lang, repo]);

  const noContacts = settings !== null && settings.contacts.length === 0;

  return (
    <Screen>
      {phase === 'counting' ? (
        <>
          <Text
            accessibilityLiveRegion="assertive"
            style={{ fontSize: 96, fontWeight: '800', color: colors.danger, textAlign: 'center', marginVertical: 16 }}
          >
            {left}
          </Text>
          <Body>{t('sosSend.countdown', { seconds: left })}</Body>
          <Body muted>{noContacts ? t('sosSend.noContacts', { hotline }) : t('sosSend.what', { hotline })}</Body>
          <Button variant="danger" title={t('sosSend.cancel')} onPress={() => setPhase('cancelled')} testID="sos-cancel" />
        </>
      ) : null}
      {phase === 'sending' ? <Body>{t('common.loading')}</Body> : null}
      {phase === 'done' && result ? <Banner kind="success">{t(DONE_KEY[result], { hotline })}</Banner> : null}
      {phase === 'cancelled' ? <Banner kind="info">{t('sosSend.cancelled')}</Banner> : null}
      {phase === 'error' ? (
        <>
          <Banner kind="danger">{t('sosSend.error', { hotline })}</Banner>
          <Button variant="danger" title={t('common.call', { number: hotline })} onPress={() => callNumber(hotline)} />
        </>
      ) : null}
      {noContacts && phase !== 'counting' ? (
        <Button variant="secondary" title={t('sosSend.setup')} onPress={() => router.replace('/citizen/sos')} />
      ) : null}
    </Screen>
  );
}
