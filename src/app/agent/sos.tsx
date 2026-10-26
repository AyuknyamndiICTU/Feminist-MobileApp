/** Layer 4 → responders: hands-free SOS alerts for police, gendarmerie, MINPROFF and the 1166 helpline. */
import { useCallback, useState } from 'react';
import { Linking, Text } from 'react-native';

import { Banner, Body, Button, Card, colors, Pill, Screen } from '../../components/ui';
import { locationLabel } from '../../domain/geography';
import { can } from '../../domain/permissions';
import { mapLink, type ServerSosAlert } from '../../domain/sos';
import { callNumber } from '../../lib/device';
import { useFocusReload } from '../../lib/useFocusReload';
import { useApp } from '../../state/AppContext';

export default function AgentSos() {
  const { t, lang, session, api, online, dataVersion } = useApp();
  const [items, setItems] = useState<ServerSosAlert[] | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!session || !online) return;
    try {
      setItems(await api.listSosAlerts(session));
      setError(undefined);
    } catch {
      setError(t('common.error'));
    }
  }, [api, session, online, t]);

  useFocusReload(load, dataVersion);

  if (!session || !can(session.role, 'sos.respond')) return null;

  const ack = async (alertId: string) => {
    try {
      await api.acknowledgeSosAlert(session, alertId);
      await load();
    } catch {
      setError(t('common.error'));
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleString(lang);

  return (
    <Screen>
      <Body muted>{t('sosAgent.note')}</Body>
      {!online ? <Banner kind="warn">{t('ind.needOnline')}</Banner> : null}
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {items?.length === 0 ? <Body muted>{t('sosAgent.empty')}</Body> : null}
      {items?.map((a) => (
        <Card key={a.alertId}>
          {a.status === 'NEW' ? (
            <Pill text={t('sosAgent.new')} color={colors.danger} />
          ) : (
            <Text style={{ color: colors.success, fontWeight: '700' }}>{t('sosAgent.acked', { agent: a.handledBy ?? '' })}</Text>
          )}
          <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 4 }}>
            {t('sosAgent.triggered', { date: when(a.triggeredAt), received: when(a.receivedAt) })}
          </Text>
          <Text>{t('sosAgent.source', { source: t(`sosAgent.source.${a.source}`) })}</Text>
          <Text>{t('sosAgent.area', { area: locationLabel(a.location, lang) })}</Text>
          <Text style={{ color: colors.muted }}>{t('sosAgent.contacts', { count: a.contactsNotified })}</Text>
          {a.geo ? (
            <Button
              title={t('sosAgent.map', { acc: Math.round(a.geo.accuracy ?? 0) })}
              onPress={() => Linking.openURL(mapLink(a.geo!)).catch(() => undefined)}
            />
          ) : (
            <Text style={{ color: colors.muted }}>{t('sosAgent.noGps')}</Text>
          )}
          {a.callbackNumber ? (
            <Button variant="secondary" title={t('sosAgent.callBack', { number: a.callbackNumber })} onPress={() => callNumber(a.callbackNumber!)} />
          ) : null}
          {a.status === 'NEW' ? <Button variant="secondary" title={t('sosAgent.ack')} onPress={() => ack(a.alertId)} testID="sos-ack" /> : null}
        </Card>
      ))}
    </Screen>
  );
}
