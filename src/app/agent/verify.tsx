/** Layer 4 → Layer 1 bridge: a citizen report only enters the register after institutional verification. */
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Banner, Body, Button, Card, colors, Screen } from '../../components/ui';
import { locationLabel } from '../../domain/geography';
import { can } from '../../domain/permissions';
import { INCIDENT_TYPES, labelOf, RELATIONSHIPS } from '../../domain/typology';
import type { ServerCitizenReport } from '../../domain/types';
import { callNumber } from '../../lib/device';
import { useFocusReload } from '../../lib/useFocusReload';
import { useApp } from '../../state/AppContext';

export default function Verify() {
  const { t, lang, session, api, online, dataVersion } = useApp();
  const [items, setItems] = useState<ServerCitizenReport[] | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!session || !online) return;
    try {
      setItems(await api.listReportsForVerification(session));
      setError(undefined);
    } catch {
      setError(t('common.error'));
    }
  }, [api, session, online, t]);

  useFocusReload(load, dataVersion);

  if (!session) return null;
  if (!can(session.role, 'report.verify')) return null;

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch { setError(t('common.error')); }
  };

  const openCase = (r: ServerCitizenReport) => {
    const q = new URLSearchParams({
      fromReport: r.trackingCode,
      it: r.incidentType,
      rel: r.relationship,
      rg: r.location.region ?? '',
      dp: r.location.department ?? '',
      ...(r.location.arrondissement ? { ar: r.location.arrondissement } : {}),
    });
    router.push(`/agent/case?${q.toString()}`);
  };

  return (
    <Screen>
      <Body muted>{t('verify.note')}</Body>
      {!online ? <Banner kind="warn">{t('ind.needOnline')}</Banner> : null}
      {error ? <Banner kind="danger">{error}</Banner> : null}
      {items?.length === 0 ? <Body muted>{t('verify.empty')}</Body> : null}
      {items?.map((r) => (
        <Card key={r.trackingCode}>
          {r.immediateDanger ? <Banner kind="danger">{t('verify.danger')}</Banner> : null}
          <Text style={{ fontWeight: '800', fontSize: 16 }}>{`${r.trackingCode} · ${labelOf(INCIDENT_TYPES, r.incidentType, lang)}`}</Text>
          <Text style={{ color: colors.muted }}>{t('verify.received', { date: new Date(r.receivedAt).toLocaleString(lang) })}</Text>
          <Text>{`${labelOf(RELATIONSHIPS, r.relationship, lang)} · ${locationLabel(r.location, lang)}`}</Text>
          {r.contactPreference !== 'none' ? (
            <Text>{t('verify.contact', { pref: t(`report.contact.${r.contactPreference}`), time: t(`report.time.${r.safeTime ?? 'any'}`) })}</Text>
          ) : null}
          {r.details ? <Text style={{ fontStyle: 'italic', marginTop: 4 }}>“{r.details}”</Text> : null}
          {r.status === 'RECEIVED' ? (
            <Button variant="secondary" title={t('verify.ack')} onPress={() => act(() => api.acknowledgeReport(session, r.trackingCode))} testID="verify-ack" />
          ) : null}
          {r.safeContact && r.contactPreference === 'call' ? (
            <Button variant="secondary" title={`${t('verify.callBack')} ${r.safeContact}`} onPress={() => callNumber(r.safeContact!)} />
          ) : null}
          <Button title={t('verify.createCase')} onPress={() => openCase(r)} testID="verify-open-case" />
          <Button variant="ghost" title={t('verify.reject')} onPress={() => act(() => api.closeReport(session, r.trackingCode, 'NOT_CONFIRMED'))} />
        </Card>
      ))}
    </Screen>
  );
}
