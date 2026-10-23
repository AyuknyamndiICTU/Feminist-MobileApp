/** Layer 1: standardized minimal dataset, identical at every entry point, usable fully offline. */
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { LocationPicker } from '../../components/LocationPicker';
import { Banner, Body, Button, Choice, colors, Field, H2, MultiChoice, Screen, Toggle } from '../../components/ui';
import { allowedStatuses, can } from '../../domain/permissions';
import { assessRisk } from '../../domain/risk';
import {
  AGE_BANDS, INCIDENT_TYPES, labelOf, PROCEDURE_STATUSES, REFERRALS, RELATIONSHIPS, RISK_ITEMS, ROLES,
} from '../../domain/typology';
import type {
  AgeBand, CaseRecord, IncidentType, ProcedureStatus, Relationship, Role, YesNoUnknown,
} from '../../domain/types';
import { validateCase } from '../../domain/validation';
import { newId, useApp } from '../../state/AppContext';

type Params = { id?: string; fromReport?: string; it?: string; rel?: string; rg?: string; dp?: string; ar?: string };

function blankCase(agentId: string, role: Role, facility: string, region: string, p: Params): CaseRecord {
  const now = new Date().toISOString();
  return {
    localId: newId(),
    createdAt: now,
    updatedAt: now,
    createdBy: agentId,
    institution: role,
    facility,
    sourceReportId: p.fromReport,
    incidentType: p.it as IncidentType | undefined,
    relationship: p.rel as Relationship | undefined,
    location: p.rg ? { region: p.rg, department: p.dp, arrondissement: p.ar } : { region },
    procedureStatus: 'REPORTED',
    risk: {},
    referrals: [],
    consentToName: false,
    history: [],
    syncState: 'draft',
  };
}

export default function CaseForm() {
  const { t, lang, session, repo, sync, online, bumpData } = useApp();
  const params = useLocalSearchParams<Params>();
  const navigation = useNavigation();
  const [c, setC] = useState<CaseRecord | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'warn' | 'danger'; text: string }>();

  useEffect(() => {
    if (!session) return;
    (async () => {
      const existing = params.id ? await repo.getCase(params.id) : undefined;
      setC(existing && existing.createdBy === session.agentId
        ? existing
        : blankCase(session.agentId, session.role, session.facility, session.region, params));
    })();
  }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (c?.caseNumber) navigation.setOptions({ title: t('form.titleEdit', { id: c.caseNumber }) });
  }, [c?.caseNumber, navigation, t]);

  const validation = useMemo(() => (c ? validateCase(c) : null), [c]);
  if (!session) return null;
  if (!c || !validation) return <Screen><Body>{t('common.loading')}</Body></Screen>;

  const set = (patch: Partial<CaseRecord>) => setC({ ...c, ...patch });
  const missing = (f: string) => (showErrors && validation.missing.includes(f as never) ? t('common.required') : undefined);
  const risk = assessRisk(c.risk);
  const canIdentity = can(session.role, 'case.captureIdentity');
  const statusOptions = allowedStatuses(session.role, PROCEDURE_STATUSES.map((s) => s.code));
  const lastStatus = c.history[c.history.length - 1]?.status;

  const withHistory = (rec: CaseRecord): CaseRecord => {
    const now = new Date().toISOString();
    const history = rec.procedureStatus && rec.procedureStatus !== lastStatus
      ? [...rec.history, { at: now, status: rec.procedureStatus, byAgent: session.agentId, institution: session.role }]
      : rec.history;
    return { ...rec, history, updatedAt: now, identity: rec.consentToName && canIdentity ? rec.identity : undefined };
  };

  const saveDraft = async () => {
    const rec = { ...withHistory(c), syncState: 'draft' as const };
    await repo.upsertCase(rec);
    setC(rec);
    setMsg({ kind: 'success', text: t('form.saved') });
    bumpData();
  };

  const submit = async () => {
    setShowErrors(true);
    if (!validation.canSubmit) {
      setMsg({ kind: 'danger', text: t('form.missing', { count: validation.missing.length + validation.invalid.length }) });
      return;
    }
    const rec = { ...withHistory(c), syncState: 'queued' as const };
    await repo.upsertCase(rec);
    if (online) await sync.syncCases(session);
    bumpData();
    router.replace('/agent/cases');
  };

  const yesNo: { value: YesNoUnknown; label: string }[] = [
    { value: 'yes', label: t('common.yes') },
    { value: 'no', label: t('common.no') },
    { value: 'unknown', label: t('common.unknown') },
  ];

  return (
    <Screen>
      {c.sourceReportId ? <Banner kind="info">{t('form.fromReport', { code: c.sourceReportId })}</Banner> : null}
      {c.syncState === 'synced' ? <Banner kind="info">{t('form.readOnly')}</Banner> : null}
      {!online ? <Banner kind="warn">{t('common.offline')}</Banner> : null}
      <Text testID="completeness" style={{ color: colors.muted, marginBottom: 8 }}>
        {t('form.completeness', {
          pct: Math.round(validation.completeness * 100),
          info: Math.round(validation.informativeCompleteness * 100),
        })}
      </Text>

      <H2>{t('form.sec.incident')}</H2>
      <Field
        label={t('form.incidentDate')}
        required
        value={c.incidentDate ?? ''}
        onChangeText={(v) => set({ incidentDate: v.trim() })}
        placeholder="2026-10-01"
        maxLength={10}
        error={missing('incidentDate') ?? (showErrors && validation.invalid.includes('incidentDate') ? t('form.invalidDate') : undefined)}
        testID="case-date"
      />
      <Button variant="ghost" title={new Date().toISOString().slice(0, 10)} onPress={() => set({ incidentDate: new Date().toISOString().slice(0, 10) })} />
      <Choice<IncidentType>
        label={t('form.incidentType')}
        required
        options={INCIDENT_TYPES.map((x) => ({ value: x.code, label: x.label[lang] }))}
        value={c.incidentType}
        onChange={(v) => set({ incidentType: v })}
        error={missing('incidentType')}
      />
      <Choice<Relationship>
        label={t('form.relationship')}
        required
        options={RELATIONSHIPS.map((x) => ({ value: x.code, label: x.label[lang] }))}
        value={c.relationship}
        onChange={(v) => set({ relationship: v })}
        error={missing('relationship')}
      />
      <Choice<YesNoUnknown> label={t('form.repeat')} required options={yesNo} value={c.repeatIncident} onChange={(v) => set({ repeatIncident: v })} error={missing('repeatIncident')} />

      <H2>{t('form.sec.location')}</H2>
      <LocationPicker
        value={c.location}
        onChange={(location) => set({ location })}
        lang={lang}
        t={t}
        required
        errors={{ region: missing('region'), department: missing('department'), arrondissement: missing('arrondissement') }}
      />

      <H2>{t('form.sec.victim')}</H2>
      <Choice<AgeBand>
        label={t('form.ageBand')}
        required
        options={AGE_BANDS.map((x) => ({ value: x.code, label: x.label[lang] }))}
        value={c.victimAgeBand}
        onChange={(v) => set({ victimAgeBand: v })}
        error={missing('victimAgeBand')}
      />

      <H2>{t('form.sec.procedure')}</H2>
      <Choice<ProcedureStatus>
        label={t('form.procedureStatus')}
        required
        options={PROCEDURE_STATUSES.filter((s) => statusOptions.includes(s.code) || s.code === c.procedureStatus).map((x) => ({ value: x.code, label: x.label[lang] }))}
        value={c.procedureStatus}
        onChange={(v) => set({ procedureStatus: v })}
        error={missing('procedureStatus')}
      />
      {c.history.length > 0 ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: '600', marginBottom: 4 }}>{t('form.history')}</Text>
          {c.history.map((h) => (
            <Text key={`${h.at}${h.status}`} style={{ color: colors.muted }}>
              {`${h.at.slice(0, 10)} · ${labelOf(PROCEDURE_STATUSES, h.status, lang)} · ${labelOf(ROLES, h.institution, lang)}`}
            </Text>
          ))}
        </View>
      ) : null}

      <H2>{t('form.sec.risk')}</H2>
      <Body muted>{t('form.riskNote')}</Body>
      {RISK_ITEMS.map((r) => (
        <Toggle key={r.code} label={r.label[lang]} value={!!c.risk[r.code]} onChange={(v) => set({ risk: { ...c.risk, [r.code]: v } })} />
      ))}
      <Banner kind={risk === 'HIGH' ? 'danger' : risk === 'MEDIUM' ? 'warn' : 'success'}>{t(`form.risk.${risk}`)}</Banner>

      <H2>{t('form.sec.referrals')}</H2>
      <MultiChoice options={REFERRALS.map((x) => ({ value: x.code, label: x.label[lang] }))} values={c.referrals} onChange={(referrals) => set({ referrals })} />

      <H2>{t('form.sec.consent')}</H2>
      {canIdentity ? (
        <>
          <Toggle label={t('form.consent')} value={c.consentToName} onChange={(v) => set({ consentToName: v, identity: v ? c.identity : undefined })} />
          <Body muted>{t('form.consentNote')}</Body>
          {c.consentToName ? (
            <>
              <Field label={t('form.victimName')} value={c.identity?.victimName ?? ''} onChangeText={(v) => set({ identity: { ...c.identity, victimName: v } })} />
              <Field
                label={t('form.contactPhone')}
                value={c.identity?.contactPhone ?? ''}
                onChangeText={(v) => set({ identity: { ...c.identity, contactPhone: v } })}
                keyboardType="phone-pad"
                error={showErrors && validation.invalidPhone ? t('form.invalidPhone') : undefined}
              />
            </>
          ) : null}
        </>
      ) : (
        <Body muted>{t('form.noIdentityRole')}</Body>
      )}
      <Field label={t('form.notes')} value={c.notes ?? ''} onChangeText={(v) => set({ notes: v })} multiline />

      {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}
      {c.syncState !== 'synced' ? <Button variant="secondary" title={t('form.saveDraft')} onPress={saveDraft} testID="case-draft" /> : null}
      <Button title={t('form.submit')} onPress={submit} testID="case-submit" />
    </Screen>
  );
}
