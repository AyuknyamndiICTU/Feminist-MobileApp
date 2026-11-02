import { useCallback, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';

import { PremiumGate } from '../../components/Premium';
import { Banner, Body, Button, Card, Choice, colors, Field, H2, Screen } from '../../components/ui';
import { isValidIsoDate } from '../../domain/validation';
import type { TKey } from '../../i18n';
import { useFocusReload } from '../../lib/useFocusReload';
import type { VaultCategory, VaultEntry } from '../../services/repository';
import { newId, useApp } from '../../state/AppContext';

const CATEGORIES: VaultCategory[] = ['physical', 'verbal', 'threat', 'economic', 'sexual', 'other'];
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): Omit<VaultEntry, 'id' | 'createdAt'> => ({ incidentDate: today(), category: 'physical', description: '', place: '', witnesses: '' });

function Vault() {
  const { t, lang, repo, dataVersion } = useApp();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [draft, setDraft] = useState(blank());
  const [errors, setErrors] = useState<{ date?: string; description?: string }>({});
  const [form, setForm] = useState(false);

  const load = useCallback(() => {
    repo.listVault().then(setEntries).catch(() => undefined);
  }, [repo]);
  useFocusReload(load, dataVersion);

  const open = (entry?: VaultEntry) => {
    setEditing(entry ?? null);
    setDraft(entry ? { ...entry } : blank());
    setErrors({});
    setForm(true);
  };

  const save = async () => {
    const e: typeof errors = {};
    if (!isValidIsoDate(draft.incidentDate)) e.date = t('vault.err.date');
    if (draft.description.trim().length < 10) e.description = t('vault.err.description');
    setErrors(e);
    if (e.date || e.description) return;
    await repo.upsertVaultEntry({
      id: editing?.id ?? newId(),
      createdAt: editing?.createdAt ?? new Date().toISOString(),
      incidentDate: draft.incidentDate,
      category: draft.category,
      description: draft.description.trim().slice(0, 4000),
      place: draft.place?.trim().slice(0, 200) || undefined,
      witnesses: draft.witnesses?.trim().slice(0, 200) || undefined,
    });
    setForm(false);
    load();
  };

  const remove = (entry: VaultEntry) => {
    Alert.alert(t('vault.delete'), t('vault.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('vault.delete'), style: 'destructive', onPress: () => void repo.deleteVaultEntry(entry.id).then(load) },
    ]);
  };

  const exportAll = () => {
    const sorted = [...entries].sort((a, b) => a.incidentDate.localeCompare(b.incidentDate));
    const lines = [t('vault.exportHeader', { date: new Date().toLocaleString(lang) }), ''];
    for (const e of sorted) {
      lines.push(`${e.incidentDate} · ${t(`vault.cat.${e.category}` as TKey)}`, e.description);
      if (e.place) lines.push(`${t('vault.place')}: ${e.place}`);
      if (e.witnesses) lines.push(`${t('vault.witnesses')}: ${e.witnesses}`);
      lines.push('');
    }
    Alert.alert(t('vault.export'), t('vault.exportWarn'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('vault.export'), onPress: () => void Share.share({ message: lines.join('\n') }).catch(() => undefined) },
    ]);
  };

  if (form) {
    return (
      <Screen>
        <Field
          label={t('vault.date')}
          value={draft.incidentDate}
          onChangeText={(v) => setDraft({ ...draft, incidentDate: v.trim() })}
          maxLength={10}
          error={errors.date}
          testID="vault-date"
        />
        <Choice<VaultCategory>
          label={t('vault.category')}
          options={CATEGORIES.map((c) => ({ value: c, label: t(`vault.cat.${c}` as TKey) }))}
          value={draft.category}
          onChange={(category) => setDraft({ ...draft, category })}
        />
        <Field
          label={t('vault.description')}
          value={draft.description}
          onChangeText={(description) => setDraft({ ...draft, description })}
          multiline
          maxLength={4000}
          error={errors.description}
          testID="vault-description"
        />
        <Field label={t('vault.place')} value={draft.place ?? ''} onChangeText={(place) => setDraft({ ...draft, place })} maxLength={200} />
        <Field label={t('vault.witnesses')} value={draft.witnesses ?? ''} onChangeText={(witnesses) => setDraft({ ...draft, witnesses })} maxLength={200} />
        <Button title={t('vault.save')} onPress={save} testID="vault-save" />
        <Button variant="ghost" title={t('common.cancel')} onPress={() => setForm(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Body muted>{t('vault.intro')}</Body>
      <Button title={t('vault.new')} onPress={() => open()} testID="vault-new" />
      {entries.length === 0 ? <Body muted>{t('vault.empty')}</Body> : null}
      {entries.map((e) => (
        <Card key={e.id}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: colors.primaryDark }}>
            {`${e.incidentDate} · ${t(`vault.cat.${e.category}` as TKey)}`}
          </Text>
          <Text style={{ fontSize: 15, marginTop: 4, color: colors.text }} numberOfLines={4}>{e.description}</Text>
          {e.place ? <Text style={{ color: colors.muted, marginTop: 4 }}>{e.place}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button variant="secondary" title={t('vault.edit')} onPress={() => open(e)} /></View>
            <View style={{ flex: 1 }}><Button variant="ghost" title={t('vault.delete')} onPress={() => remove(e)} /></View>
          </View>
        </Card>
      ))}
      {entries.length > 0 ? (
        <>
          <H2>{t('vault.export')}</H2>
          <Banner kind="warn">{t('vault.exportWarn')}</Banner>
          <Button variant="secondary" title={t('vault.export')} onPress={exportAll} />
        </>
      ) : null}
    </Screen>
  );
}

export default function VaultScreen() {
  return (
    <PremiumGate feature="vault">
      <Vault />
    </PremiumGate>
  );
}
