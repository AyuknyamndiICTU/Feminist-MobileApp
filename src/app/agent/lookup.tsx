/** Layer 2: one national case number followed by every institution, from first report to judgment. */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Banner, Body, Button, Card, Choice, colors, Field, H2, Screen } from '../../components/ui';
import { locationLabel } from '../../domain/geography';
import { allowedStatuses } from '../../domain/permissions';
import { INCIDENT_TYPES, labelOf, PROCEDURE_STATUSES, ROLES } from '../../domain/typology';
import type { ProcedureStatus, RegisterRecord } from '../../domain/types';
import { ApiError } from '../../services/api';
import { useApp } from '../../state/AppContext';

export default function Lookup() {
  const { t, lang, session, api, online } = useApp();
  const [num, setNum] = useState('');
  const [rec, setRec] = useState<RegisterRecord | null>(null);
  const [status, setStatus] = useState<ProcedureStatus>();
  const [msg, setMsg] = useState<{ kind: 'success' | 'warn' | 'danger'; text: string }>();

  if (!session) return null;
  const options = allowedStatuses(session.role, PROCEDURE_STATUSES.map((s) => s.code)).filter((s) => s !== 'UNKNOWN');

  const search = async () => {
    setMsg(undefined);
    setRec(null);
    try {
      setRec(await api.lookupCase(session, num));
    } catch (e) {
      setMsg(e instanceof ApiError ? { kind: 'warn', text: t('lookup.notFound') } : { kind: 'warn', text: t('ind.needOnline') });
    }
  };

  const add = async () => {
    if (!rec?.caseNumber || !status) return;
    try {
      setRec(await api.appendProcedureEvent(session, rec.caseNumber, status));
      setStatus(undefined);
      setMsg({ kind: 'success', text: t('lookup.added') });
    } catch {
      setMsg({ kind: 'danger', text: t('common.error') });
    }
  };

  return (
    <Screen>
      <Body muted>{t('lookup.intro')}</Body>
      <Field label={t('lookup.number')} value={num} onChangeText={setNum} autoCapitalize="characters" testID="lookup-number" />
      <Button title={t('lookup.search')} onPress={search} disabled={!online || !num.trim()} testID="lookup-search" />
      {!online ? <Banner kind="warn">{t('ind.needOnline')}</Banner> : null}
      {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}

      {rec ? (
        <Card>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primaryDark }}>{rec.caseNumber}</Text>
          <Text style={{ fontWeight: '700' }}>{labelOf(INCIDENT_TYPES, rec.incidentType, lang)}</Text>
          <Text style={{ color: colors.muted }}>{`${rec.incidentDate ?? '—'} · ${locationLabel(rec.location, lang)}`}</Text>
          <Text style={{ color: colors.muted }}>{`${labelOf(ROLES, rec.institution, lang)} · ${rec.facility}`}</Text>
          <H2>{t('form.history')}</H2>
          <View testID="lookup-history">
            {rec.history.map((h) => (
              <Text key={`${h.at}${h.status}${h.byAgent}`} style={{ marginBottom: 4 }}>
                {`${new Date(h.at).toLocaleDateString(lang)} · ${labelOf(PROCEDURE_STATUSES, h.status, lang)} · ${labelOf(ROLES, h.institution, lang)} (${h.byAgent})`}
              </Text>
            ))}
          </View>
          <H2>{t('lookup.addStatus')}</H2>
          <Choice<ProcedureStatus>
            options={options.map((s) => ({ value: s, label: labelOf(PROCEDURE_STATUSES, s, lang) }))}
            value={status}
            onChange={setStatus}
          />
          <Button title={t('lookup.add')} onPress={add} disabled={!status || !online} testID="lookup-add" />
        </Card>
      ) : null}
    </Screen>
  );
}
