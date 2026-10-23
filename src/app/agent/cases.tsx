import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Body, Card, colors, Pill, Row, Screen } from '../../components/ui';
import { locationLabel } from '../../domain/geography';
import { INCIDENT_TYPES, labelOf } from '../../domain/typology';
import type { CaseRecord, SyncState } from '../../domain/types';
import { useFocusReload } from '../../lib/useFocusReload';
import { useApp } from '../../state/AppContext';

const SYNC_COLOR: Record<SyncState, string> = {
  draft: colors.muted,
  queued: colors.info,
  synced: colors.success,
  error: colors.danger,
};

export default function Cases() {
  const { t, lang, session, repo, dataVersion } = useApp();
  const [cases, setCases] = useState<CaseRecord[]>([]);

  const load = useCallback(() => {
    if (!session) return;
    // Shared devices: an agent only ever lists the records they created.
    repo.listCases().then((all) => setCases(all.filter((c) => c.createdBy === session.agentId)));
  }, [repo, session]);
  useFocusReload(load, dataVersion);

  if (!session) return null;

  return (
    <Screen>
      {cases.length === 0 ? <Body muted>{t('cases.empty')}</Body> : null}
      {cases.map((c) => (
        <Card key={c.localId} onPress={() => router.push(`/agent/case?id=${c.localId}`)} label={c.caseNumber ?? c.localId}>
          <Row>
            <Pill text={t(`sync.${c.syncState}`)} color={SYNC_COLOR[c.syncState]} />
            {c.caseNumber ? <Text testID="case-number" style={{ fontWeight: '800', color: colors.primaryDark }}>{c.caseNumber}</Text> : null}
          </Row>
          <Text style={{ fontSize: 16, fontWeight: '700', marginTop: 6 }}>{labelOf(INCIDENT_TYPES, c.incidentType, lang)}</Text>
          <Text style={{ color: colors.muted }}>{`${c.incidentDate ?? '—'} · ${locationLabel(c.location, lang)}`}</Text>
          {c.lastSyncError ? <Text style={{ color: colors.danger }}>{c.lastSyncError}</Text> : null}
        </Card>
      ))}
    </Screen>
  );
}
