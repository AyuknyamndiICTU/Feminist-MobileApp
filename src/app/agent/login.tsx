import { useState } from 'react';

import { Banner, Button, Field, Screen } from '../../components/ui';
import { ApiError, NetworkError } from '../../services/api';
import { useApp } from '../../state/AppContext';

export default function AgentLogin() {
  const { t, api, setSession, online } = useApp();
  const [agentId, setAgentId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setSession(await api.login(agentId, pin));
      setPin('');
    } catch (e) {
      if (e instanceof NetworkError) setError(t('agent.needOnline'));
      else if (e instanceof ApiError) setError(t('agent.invalid'));
      else setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {!online ? <Banner kind="warn">{t('agent.needOnline')}</Banner> : null}
      <Field label={t('agent.id')} value={agentId} onChangeText={setAgentId} autoCapitalize="characters" autoCorrect={false} testID="agent-id" />
      <Field label={t('agent.pin')} value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" testID="agent-pin" error={error} />
      <Button title={t('agent.signIn')} onPress={signIn} disabled={busy || !agentId || !pin} testID="agent-signin" />
      <Banner kind="info">{t('agent.demo')}</Banner>
    </Screen>
  );
}
