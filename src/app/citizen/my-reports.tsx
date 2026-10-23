import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Banner, Body, Button, Card, colors, Field, H2, Pill, Screen } from '../../components/ui';
import { labelOf, INCIDENT_TYPES } from '../../domain/typology';
import type { CitizenReport } from '../../domain/types';
import type { TKey } from '../../i18n';
import { useFocusReload } from '../../lib/useFocusReload';
import type { ReportStatus } from '../../services/api';
import { useApp } from '../../state/AppContext';

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: colors.info,
  UNDER_VERIFICATION: colors.warn,
  VERIFIED: colors.success,
  NOT_CONFIRMED: colors.muted,
};

export default function MyReports() {
  const { t, lang, repo, api, online, dataVersion } = useApp();
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ReportStatus | null>>({});
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<{ code: string; status: ReportStatus | null } | null>(null);

  const refresh = useCallback(async () => {
    const list = await repo.listReports();
    setReports(list);
    if (!online) return;
    const next: Record<string, ReportStatus | null> = {};
    for (const r of list) if (r.trackingCode) next[r.trackingCode] = await api.getReportStatus(r.trackingCode).catch(() => null);
    setStatuses(next);
  }, [repo, api, online]);

  useFocusReload(refresh, dataVersion);

  const check = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setLookup({ code: c, status: await api.getReportStatus(c).catch(() => null) });
  };

  const statusText = (s?: ReportStatus | null) => (s ? t(`status.${s.status}` as TKey) : '');

  return (
    <Screen>
      {!online ? <Banner kind="warn">{t('common.offline')}</Banner> : null}
      {reports.length === 0 ? <Body muted>{t('mine.empty')}</Body> : null}
      {reports.map((r) => {
        const st = r.trackingCode ? statuses[r.trackingCode] : undefined;
        return (
          <Card key={r.localId}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{labelOf(INCIDENT_TYPES, r.incidentType, lang)}</Text>
            <Text style={{ color: colors.muted, marginBottom: 6 }}>{new Date(r.createdAt).toLocaleString(lang)}</Text>
            {r.trackingCode ? (
              <Text testID="tracking-code" style={{ fontSize: 16 }}>{t('mine.code')}: <Text style={{ fontWeight: '800' }}>{r.trackingCode}</Text></Text>
            ) : (
              <Pill text={r.outbox === 'sms_prepared' ? t('mine.sms') : t('mine.queued')} color={colors.warn} />
            )}
            {st ? <Pill text={statusText(st)} color={STATUS_COLOR[st.status]} /> : null}
            {st?.linkedCaseNumber ? <Body>{t('mine.linked', { number: st.linkedCaseNumber })}</Body> : null}
          </Card>
        );
      })}
      {reports.length > 0 ? <Button variant="secondary" title={t('mine.refresh')} onPress={refresh} /> : null}

      <H2>{t('mine.lookup')}</H2>
      <Field label={t('mine.code')} value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="ABCD-EFGH" />
      <Button title={t('mine.check')} onPress={check} disabled={!online} />
      {lookup ? (
        lookup.status ? (
          <Banner kind="success">{`${lookup.code}: ${statusText(lookup.status)}`}</Banner>
        ) : (
          <Banner kind="warn">{t('mine.notFound')}</Banner>
        )
      ) : null}
    </Screen>
  );
}
