import { findRegion, REGIONS } from '../domain/geography';
import type { Lang, Location } from '../domain/types';
import type { Translator } from '../i18n';
import { Banner, Choice } from './ui';

interface Props {
  value: Location;
  onChange: (loc: Location) => void;
  lang: Lang;
  t: Translator;
  errors?: Partial<Record<'region' | 'department' | 'arrondissement', string>>;
  required?: boolean;
}

/** Region > Department > Arrondissement cascade. Never asks for an address or GPS position. */
export function LocationPicker({ value, onChange, lang, t, errors = {}, required }: Props) {
  const region = findRegion(value.region);
  const dept = region?.departments.find((d) => d.code === value.department);

  return (
    <>
      <Choice
        label={t('report.region')}
        required={required}
        options={REGIONS.map((r) => ({ value: r.code, label: r.name[lang] }))}
        value={value.region}
        onChange={(code) => onChange({ region: code })}
        error={errors.region}
      />
      {region ? (
        <Choice
          label={t('report.department')}
          required={required}
          options={region.departments.map((d) => ({ value: d.code, label: d.name }))}
          value={value.department}
          onChange={(code) => onChange({ region: value.region, department: code })}
          error={errors.department}
        />
      ) : null}
      {dept?.arrondissements?.length ? (
        <Choice
          label={t('report.arrondissement')}
          required={required}
          options={dept.arrondissements.map((a) => ({ value: a.code, label: a.name }))}
          value={value.arrondissement}
          onChange={(code) => onChange({ ...value, arrondissement: code })}
          error={errors.arrondissement}
        />
      ) : dept ? (
        <Banner kind="info">{t('report.arrNotListed')}</Banner>
      ) : null}
    </>
  );
}
