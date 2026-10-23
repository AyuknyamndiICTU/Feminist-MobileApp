import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { Banner, Body, Button, Card, colors, Pill, Row, Screen, Title, Toggle } from '../../components/ui';
import { can } from '../../domain/permissions';
import { labelOf, ROLES } from '../../domain/typology';
import { useFocusReload } from '../../lib/useFocusReload';
import { useApp } from '../../state/AppContext';

function Menu({ title, href, testID }: { title: string; href: string; testID?: string }) {
  return (
    <Card onPress={() => router.push(href as never)} label={title}>
      <Text testID={testID} style={{ fontSize: 17, fontWeight: '700', color: colors.primaryDark }}>{title} ›</Text>
    </Card>
  );
}

export default function AgentHome() {
  const { t, lang, session, setSession, repo, sync, online, simulateOffline, setSimulateOffline, dataVersion, bumpData } = useApp();
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'success' | 'warn'; text: string }>();

  const load = useCallback(() => {
    if (!session) return;
    repo.listCases().then((all) =>
      setPending(all.filter((c) => c.createdBy === session.agentId && (c.syncState === 'queued' || c.syncState === 'error')).length),
    );
  }, [repo, session]);
  useFocusReload(load, dataVersion);

  if (!session) return null;

  const syncNow = async () => {
    const r = await sync.syncCases(session);
    setMsg(
      r.offline
        ? { kind: 'warn', text: t('agent.syncOffline') }
        : { kind: 'success', text: t('agent.syncResult', { pushed: r.pushed, failed: r.failed }) },
    );
    bumpData();
  };

  return (
    <Screen>
      <Title>{session.displayName}</Title>
      <Body muted>{`${labelOf(ROLES, session.role, lang)} · ${session.facility}`}</Body>
      <Row>
        <Pill text={online ? t('agent.online') : t('agent.offline')} color={online ? colors.success : colors.warn} />
        {pending > 0 ? <Pill text={t('agent.pending', { count: pending })} color={colors.info} /> : null}
      </Row>
      <Toggle label={t('agent.simulateOffline')} value={simulateOffline} onChange={setSimulateOffline} />
      <Button variant="secondary" title={t('agent.sync')} onPress={syncNow} testID="agent-sync" />
      {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}

      {can(session.role, 'case.create') ? <Menu title={t('agent.newCase')} href="/agent/case" testID="agent-new-case" /> : null}
      <Menu title={t('agent.cases')} href="/agent/cases" testID="agent-cases" />
      {can(session.role, 'report.verify') ? <Menu title={t('agent.verify')} href="/agent/verify" testID="agent-verify" /> : null}
      <Menu title={t('agent.lookup')} href="/agent/lookup" testID="agent-lookup" />
      <Menu title={t('agent.indicators')} href="/agent/indicators" testID="agent-indicators" />

      <Button
        variant="ghost"
        title={t('agent.signOut')}
        onPress={() => setSession(null)}
      />
    </Screen>
  );
}
