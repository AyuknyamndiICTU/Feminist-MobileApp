/** SafeHer Plus → helpline/MINPROFF: confidential call-back requests at the member's safe time. */
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Banner, Body, Button, Card, colors, Pill, Screen } from '../../components/ui';
import type { ServerCallbackRequest } from '../../domain/callback';
import { locationLabel } from '../../domain/geography';
import { can } from '../../domain/permissions';
import { callNumber } from '../../lib/device';
import { useFocusReload } from '../../lib/useFocusReload';
import { useApp } from '../../state/AppContext';

export default function AgentCallbacks() {
  const { t, lang, session, api, online, dataVersion } = useApp();
  const [items, setItems] = useState<ServerCallbackRequest[] | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!session || !online) return;
    try {
      setItems(await api.listCallbackRequests(session));
      setError(undefined);
    } catch {
      setError(t('common.error'));
    }
  }, [api, session, online, t]);

  useFocusReload(load, dataVersion);

  if (!session || !can(session.role, 'callback.respond')) return null;

  const done = async (id: string) => {
    try {
      await api.completeCallbackRequest(session, id);
      await load();
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <Screen>
      <Body muted>{t('cb.note')}</Body>
      {!online ? <Banner kind="warn">{t('ind.needOnline')}</Banner> : null}
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {items?.length === 0 ? <Body muted>{t('cb.empty')}</Body> : null}
      {items?.map((r) => (
        <Card key={r.requestId}>
          {r.status === 'NEW' ? (
            <Pill text={t(`cb.kind.${r.kind}`)} color={colors.primary} />
          ) : (
            <Text style={{ color: colors.success, fontWeight: '700' }}>{t('cb.doneBy', { agent: r.handledBy ?? '' })}</Text>
          )}
          <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 4 }}>{t('cb.when', { time: t(`report.time.${r.safeTime}`) })}</Text>
          <Text style={{ color: colors.muted }}>{new Date(r.receivedAt).toLocaleString(lang)}</Text>
          {r.region ? <Text>{locationLabel({ region: r.region }, lang)}</Text> : null}
          {r.note ? <Text style={{ fontStyle: 'italic', marginTop: 4 }}>“{r.note}”</Text> : null}
          <Button variant="secondary" title={t('cb.call', { number: r.phone })} onPress={() => callNumber(r.phone)} />
          {r.status === 'NEW' ? <Button variant="ghost" title={t('cb.done')} onPress={() => done(r.requestId)} testID="cb-done" /> : null}
        </Card>
      ))}
    </Screen>
  );
}
