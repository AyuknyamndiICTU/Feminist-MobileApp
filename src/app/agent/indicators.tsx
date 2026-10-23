/** Layer 5 (mobile slice): Chapter 25 monitoring indicators. The full decision-maker dashboard is web-based. */
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Banner, Body, Card, colors, Screen } from '../../components/ui';
import { computeIndicators, type Indicators } from '../../domain/indicators';
import { INCIDENT_TYPES, labelOf } from '../../domain/typology';
import type { IncidentType } from '../../domain/types';
import { useFocusReload } from '../../lib/useFocusReload';
import { useApp } from '../../state/AppContext';

const pct = (v: number | null) => (v === null ? null : `${Math.round(v * 100)} %`);

function Metric({ title, value, ratio }: { title: string; value: string; ratio?: number | null }) {
  return (
    <Card>
      <Text style={{ color: colors.muted, fontWeight: '600' }}>{title}</Text>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.primaryDark, marginVertical: 4 }}>{value}</Text>
      {ratio !== undefined && ratio !== null ? (
        <View style={{ height: 8, backgroundColor: colors.chip, borderRadius: 4 }}>
          <View style={{ height: 8, width: `${Math.min(100, Math.round(ratio * 100))}%`, backgroundColor: colors.primary, borderRadius: 4 }} />
        </View>
      ) : null}
    </Card>
  );
}

export default function IndicatorsScreen() {
  const { t, lang, session, repo, api, online, dataVersion } = useApp();
  const [ind, setInd] = useState<Indicators | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    (async () => {
      const local = (await repo.listCases()).filter((c) => c.createdBy === session.agentId);
      const register = online ? await api.fetchRegister(session).catch(() => []) : [];
      const reports = online ? await api.fetchAllReports(session).catch(() => []) : [];
      setInd(computeIndicators(local, register, reports));
    })();
  }, [repo, api, session, online]);
  useFocusReload(load, dataVersion);

  if (!session) return null;
  if (!ind) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const na = t('ind.na');
  const types = Object.entries(ind.byIncidentType);
  const max = Math.max(1, ...types.map(([, v]) => (typeof v === 'number' ? v : 4)));

  return (
    <Screen>
      <Body muted>{t('ind.intro')}</Body>
      {!online ? <Banner kind="warn">{t('ind.needOnline')}</Banner> : null}
      <Metric title={t('ind.l1')} value={pct(ind.completenessRate) ?? na} ratio={ind.completenessRate} />
      <Metric title={t('ind.l2')} value={pct(ind.linkedRate) ?? na} ratio={ind.linkedRate} />
      <Metric title={t('ind.l3')} value={`${ind.coveredUnits} / ${ind.totalUnits}`} ratio={ind.coverageRate} />
      <Metric
        title={t('ind.l4')}
        value={t('ind.l4value', {
          count: ind.citizenReports,
          pending: ind.pendingVerification,
          hours: ind.meanHoursToFirstResponse === null ? na : t('ind.hours', { h: ind.meanHoursToFirstResponse.toFixed(1) }),
        })}
      />
      <Card>
        <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 8 }}>{t('ind.l5')}</Text>
        {types.length === 0 ? <Body muted>{na}</Body> : null}
        {types.map(([code, v]) => (
          <View key={code} style={{ marginBottom: 8 }}>
            <Text>{`${labelOf(INCIDENT_TYPES, code as IncidentType, lang)}: ${v}`}</Text>
            <View style={{ height: 8, backgroundColor: colors.chip, borderRadius: 4 }}>
              <View style={{ height: 8, width: `${Math.round(((typeof v === 'number' ? v : 4) / max) * 100)}%`, backgroundColor: typeof v === 'number' ? colors.primary : colors.border, borderRadius: 4 }} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
