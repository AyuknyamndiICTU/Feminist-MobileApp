import { useState } from 'react';

import { Banner, Body, Button, Choice, Field, H2, Screen } from '../../components/ui';
import { CONFIG } from '../../config';
import type { Lang } from '../../domain/types';
import { setSecretCode } from '../../services/secretCode';
import { useApp } from '../../state/AppContext';

export default function Settings() {
  const { t, lang, setLang, wipeDevice } = useApp();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string>();
  const [codeError, setCodeError] = useState<string>();
  const [confirmWipe, setConfirmWipe] = useState(false);

  const saveCode = async () => {
    if (!new RegExp(`^\\d{${CONFIG.minSecretCodeLength},${CONFIG.maxSecretCodeLength}}$`).test(code)) {
      return setCodeError(t('setup.tooShort'));
    }
    await setSecretCode(code);
    setCode('');
    setCodeError(undefined);
    setMsg(t('settings.codeSaved'));
  };

  // Clearing the code flips the route guards, which return the user to the setup screen.
  const wipe = () => wipeDevice();

  return (
    <Screen>
      <Choice<Lang>
        label={t('settings.language')}
        options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]}
        value={lang}
        onChange={setLang}
      />

      <H2>{t('settings.changeCode')}</H2>
      <Field
        label={t('settings.newCode')}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={CONFIG.maxSecretCodeLength}
        error={codeError}
      />
      <Button variant="secondary" title={t('common.save')} onPress={saveCode} />
      {msg ? <Banner kind="success">{msg}</Banner> : null}

      <Body muted>{t('settings.privacy')}</Body>

      <H2>{t('settings.wipe')}</H2>
      {confirmWipe ? (
        <>
          <Banner kind="danger">{t('settings.wipeConfirm')}</Banner>
          <Button variant="danger" title={t('common.yes')} onPress={wipe} testID="wipe-confirm" />
          <Button variant="secondary" title={t('common.cancel')} onPress={() => setConfirmWipe(false)} />
        </>
      ) : (
        <Button variant="danger" title={t('settings.wipe')} onPress={() => setConfirmWipe(true)} testID="wipe" />
      )}
    </Screen>
  );
}
