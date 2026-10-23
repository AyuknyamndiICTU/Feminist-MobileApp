import { useState } from 'react';

import { Banner, Body, Button, Choice, Field, Screen, Title } from '../components/ui';
import { CONFIG } from '../config';
import type { Lang } from '../domain/types';
import { setSecretCode } from '../services/secretCode';
import { useApp } from '../state/AppContext';

export default function Setup() {
  const { t, lang, setLang, completeSetup } = useApp();
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();

  const start = async () => {
    const valid = new RegExp(`^\\d{${CONFIG.minSecretCodeLength},${CONFIG.maxSecretCodeLength}}$`).test(code);
    if (!valid) return setError(t('setup.tooShort'));
    if (code !== confirm) return setError(t('setup.mismatch'));
    await setSecretCode(code);
    completeSetup();
  };

  return (
    <Screen safeTop>
      <Title>{t('setup.title')}</Title>
      <Choice<Lang>
        label={t('setup.language')}
        options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]}
        value={lang}
        onChange={setLang}
      />
      <Body>{t('setup.intro')}</Body>
      <Field
        label={t('setup.code')}
        value={code}
        onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setError(undefined); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={CONFIG.maxSecretCodeLength}
        testID="setup-code"
      />
      <Field
        label={t('setup.confirm')}
        value={confirm}
        onChangeText={(v) => { setConfirm(v.replace(/\D/g, '')); setError(undefined); }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={CONFIG.maxSecretCodeLength}
        error={error}
        testID="setup-confirm"
      />
      <Banner kind="info">{t('setup.howToOpen')}</Banner>
      <Button title={t('setup.start')} onPress={start} testID="setup-start" />
    </Screen>
  );
}
