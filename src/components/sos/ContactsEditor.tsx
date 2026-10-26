import { useState } from 'react';
import { Text, View } from 'react-native';

import { validateContact, normalizePhone, type ContactError, type EmergencyContact } from '../../domain/sos';
import type { Translator } from '../../i18n';
import { Body, Button, Card, colors, Field } from '../ui';

interface Props {
  contacts: EmergencyContact[];
  onChange: (contacts: EmergencyContact[]) => void;
  max: number;
  newId: () => string;
  t: Translator;
}

const ERROR_KEY: Record<ContactError, 'sos.err.name' | 'sos.err.phone' | 'sos.err.duplicate'> = {
  name: 'sos.err.name',
  phone: 'sos.err.phone',
  duplicate: 'sos.err.duplicate',
};

/** Ordered list: the order is the order of the call chain. */
export function ContactsEditor({ contacts, onChange, max, newId, t }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<ContactError[]>([]);

  const add = () => {
    const errs = validateContact({ name, phone }, contacts);
    setErrors(errs);
    if (errs.length > 0) return;
    onChange([...contacts, { id: newId(), name: name.trim(), phone: normalizePhone(phone) }]);
    setName('');
    setPhone('');
  };

  const moveUp = (i: number) => {
    const next = contacts.slice();
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };

  const fieldError = (field: 'name' | 'phone') => {
    const e = errors.find((x) => (field === 'name' ? x === 'name' : x !== 'name'));
    return e ? t(ERROR_KEY[e]) : undefined;
  };

  return (
    <View>
      {contacts.length === 0 ? <Body muted>{t('sos.noContacts')}</Body> : null}
      {contacts.map((c, i) => (
        <Card key={c.id}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.primaryDark }}>{`${i + 1}. ${c.name}`}</Text>
          <Text style={{ color: colors.muted, fontSize: 15, marginBottom: 4 }}>{c.phone}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {i > 0 ? (
              <View style={{ flex: 1 }}>
                <Button variant="secondary" title={`↑ ${t('sos.moveUp')}`} onPress={() => moveUp(i)} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Button variant="ghost" title={t('sos.remove')} onPress={() => onChange(contacts.filter((x) => x.id !== c.id))} />
            </View>
          </View>
        </Card>
      ))}
      {contacts.length < max ? (
        <Card>
          <Field label={t('sos.contactName')} value={name} onChangeText={setName} maxLength={40} error={fieldError('name')} testID="sos-contact-name" />
          <Field
            label={t('sos.contactPhone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={20}
            error={fieldError('phone')}
            testID="sos-contact-phone"
          />
          <Button variant="secondary" title={t('sos.addContact')} onPress={add} testID="sos-contact-add" />
        </Card>
      ) : (
        <Body muted>{t('sos.err.max', { max })}</Body>
      )}
    </View>
  );
}
