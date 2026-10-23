import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { LocationPicker } from '../../components/LocationPicker';
import { Banner, Body, Button, Choice, Field, Screen, Toggle } from '../../components/ui';
import { CONFIG } from '../../config';
import { encodeReportSms } from '../../domain/smsCodec';
import { INCIDENT_TYPES, RELATIONSHIPS } from '../../domain/typology';
import type { CitizenReport, ContactPreference, IncidentType, Relationship, SafeTime } from '../../domain/types';
import { validateCitizenReport } from '../../domain/validation';
import type { TKey } from '../../i18n';
import { callNumber, composeSms } from '../../lib/device';
import { newId, useApp } from '../../state/AppContext';

type Draft = Omit<CitizenReport, 'localId' | 'createdAt' | 'channel' | 'outbox' | 'incidentType'> & {
  incidentType?: IncidentType;
};

const EMPTY: Draft = {
  forWhom: 'self',
  immediateDanger: false,
  relationship: 'UNKNOWN',
  location: {},
  contactPreference: 'none',
  consentToShare: false,
};

export default function Report() {
  const { t, lang, repo, sync, online, bumpData } = useApp();
  const { channel } = useLocalSearchParams<{ channel?: string }>();
  const [d, setD] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<{ kind: 'success' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const err = (k: string) => (errors.includes(k) ? t(`report.err.${k}` as TKey) : undefined);

  const submit = async (via: 'app' | 'sms') => {
    const v = validateCitizenReport(d);
    setErrors(v.errors);
    if (!v.ok || !d.incidentType) return;
    setBusy(true);
    try {
      const report: CitizenReport = {
        ...d,
        incidentType: d.incidentType,
        details: d.details?.trim() || undefined,
        localId: newId(),
        createdAt: new Date().toISOString(),
        channel: via,
        outbox: via === 'sms' ? 'sms_prepared' : 'queued',
      };
      if (via === 'sms') {
        // Only the coded summary leaves the phone by SMS; the local copy keeps no contact data.
        composeSms(CONFIG.smsGateway.number, encodeReportSms(report));
        await repo.upsertReport({ ...report, safeContact: undefined, details: undefined });
        setDone({ kind: 'success', text: t('mine.sms') });
      } else {
        await repo.upsertReport(report);
        if (online) await sync.flushCitizenReports();
        const saved = (await repo.listReports()).find((r) => r.localId === report.localId);
        setDone(
          saved?.trackingCode
            ? { kind: 'success', text: t('report.sent', { code: saved.trackingCode }) }
            : { kind: 'warn', text: t('report.queued') },
        );
      }
      bumpData();
      setD(EMPTY);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Banner kind={done.kind}>{done.text}</Banner>
        <Button title={t('common.back')} onPress={() => setDone(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Banner kind="info">{t('report.anonNote')}</Banner>

      <Choice
        label={t('report.forWhom')}
        options={[{ value: 'self', label: t('report.self') }, { value: 'other', label: t('report.other') }]}
        value={d.forWhom}
        onChange={(v) => set({ forWhom: v as Draft['forWhom'] })}
      />
      <Choice<IncidentType>
        label={t('report.what')}
        required
        options={INCIDENT_TYPES.map((x) => ({ value: x.code, label: (x.citizenLabel ?? x.label)[lang] }))}
        value={d.incidentType}
        onChange={(v) => set({ incidentType: v })}
        error={err('incidentType')}
      />
      <Toggle label={t('report.danger')} value={d.immediateDanger} onChange={(v) => set({ immediateDanger: v })} />
      {d.immediateDanger ? (
        <>
          <Banner kind="danger">{t('report.dangerCall')}</Banner>
          <Button variant="danger" title={t('common.call', { number: '117' })} onPress={() => callNumber('117')} />
          <Button variant="danger" title={t('common.call', { number: '113' })} onPress={() => callNumber('113')} />
        </>
      ) : null}

      <Choice<Relationship>
        label={t('report.who')}
        options={RELATIONSHIPS.map((x) => ({ value: x.code, label: x.label[lang] }))}
        value={d.relationship}
        onChange={(v) => set({ relationship: v })}
      />

      <Body>{t('report.where')}</Body>
      <LocationPicker
        value={d.location}
        onChange={(location) => set({ location })}
        lang={lang}
        t={t}
        required
        errors={{ region: err('region'), department: err('department') }}
      />

      <Choice<ContactPreference>
        label={t('report.contact')}
        options={(['none', 'call', 'sms'] as const).map((v) => ({ value: v, label: t(`report.contact.${v}`) }))}
        value={d.contactPreference}
        onChange={(v) => set({ contactPreference: v, ...(v === 'none' ? { safeContact: undefined, safeTime: undefined } : {}) })}
      />
      {d.contactPreference !== 'none' ? (
        <>
          <Field
            label={t('report.phone')}
            value={d.safeContact ?? ''}
            onChangeText={(v) => set({ safeContact: v })}
            keyboardType="phone-pad"
            error={err('safeContact')}
            required
          />
          <Choice<SafeTime>
            label={t('report.time')}
            options={(['morning', 'afternoon', 'evening', 'any'] as const).map((v) => ({ value: v, label: t(`report.time.${v}`) }))}
            value={d.safeTime ?? 'any'}
            onChange={(v) => set({ safeTime: v })}
          />
        </>
      ) : null}

      {channel !== 'sms' ? (
        <Field
          label={t('report.details')}
          placeholder={t('report.detailsHint')}
          value={d.details ?? ''}
          onChangeText={(v) => set({ details: v })}
          multiline
          maxLength={500}
          error={err('details')}
        />
      ) : null}

      <Toggle label={t('report.consent')} value={d.consentToShare} onChange={(v) => set({ consentToShare: v })} />
      {err('consent') ? <Banner kind="danger">{err('consent')}</Banner> : null}
      <Body muted>{t('report.consentNote')}</Body>

      {channel === 'sms' ? (
        <Button title={t('help.smsButton')} onPress={() => submit('sms')} disabled={busy} testID="report-sms" />
      ) : (
        <>
          <Button title={t('report.submit')} onPress={() => submit('app')} disabled={busy} testID="report-submit" />
          <Button variant="ghost" title={t('report.sms')} onPress={() => submit('sms')} disabled={busy} />
        </>
      )}
      {!online ? <Banner kind="warn">{t('common.offline')}</Banner> : null}
    </Screen>
  );
}
