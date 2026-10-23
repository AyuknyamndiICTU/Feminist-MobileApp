/**
 * Common nomenclature (semantic interoperability, Layer 1/2).
 * Incident types combine the GBVIMS six core types with the UN statistical framework on
 * gender-related killings. MUST be reconciled with the official BUCREP typology before pilot.
 */
import type {
  AgeBand,
  Bilingual,
  IncidentType,
  ProcedureStatus,
  Referral,
  Relationship,
  RiskItem,
  Role,
} from './types';

export interface CodeEntry<T extends string> {
  code: T;
  short: string;
  label: Bilingual;
  /** Plain-language wording shown to citizens. */
  citizenLabel?: Bilingual;
}

export const INCIDENT_TYPES: CodeEntry<IncidentType>[] = [
  { code: 'FEMICIDE', short: 'FK', label: { en: 'Femicide (gender-related killing)', fr: 'Féminicide (meurtre lié au genre)' }, citizenLabel: { en: 'A woman or girl was killed', fr: 'Une femme ou une fille a été tuée' } },
  { code: 'ATTEMPTED_FEMICIDE', short: 'AF', label: { en: 'Attempted femicide', fr: 'Tentative de féminicide' }, citizenLabel: { en: 'Someone tried to kill her', fr: "Quelqu'un a tenté de la tuer" } },
  { code: 'RAPE', short: 'RA', label: { en: 'Rape', fr: 'Viol' }, citizenLabel: { en: 'Forced sex (rape)', fr: 'Rapport sexuel forcé (viol)' } },
  { code: 'SEXUAL_ASSAULT', short: 'SA', label: { en: 'Sexual assault', fr: 'Agression sexuelle' }, citizenLabel: { en: 'Unwanted sexual touching', fr: 'Attouchements sexuels non désirés' } },
  { code: 'PHYSICAL_ASSAULT', short: 'PA', label: { en: 'Physical assault', fr: 'Agression physique' }, citizenLabel: { en: 'Hit, beaten or hurt', fr: 'Frappée, battue ou blessée' } },
  { code: 'FORCED_MARRIAGE', short: 'FM', label: { en: 'Forced / child marriage', fr: 'Mariage forcé / précoce' }, citizenLabel: { en: 'Forced or child marriage', fr: 'Mariage forcé ou précoce' } },
  { code: 'DENIAL_OF_RESOURCES', short: 'DR', label: { en: 'Denial of resources, opportunities or services', fr: 'Déni de ressources, d’opportunités ou de services' }, citizenLabel: { en: 'Money, food, school or work taken away', fr: 'Privée d’argent, de nourriture, d’école ou de travail' } },
  { code: 'PSYCHOLOGICAL_ABUSE', short: 'PS', label: { en: 'Psychological / emotional abuse', fr: 'Violence psychologique / émotionnelle' }, citizenLabel: { en: 'Threatened, insulted or controlled', fr: 'Menacée, insultée ou contrôlée' } },
  { code: 'HARMFUL_PRACTICE', short: 'HP', label: { en: 'Harmful practice (FGM, widowhood rites, breast ironing…)', fr: 'Pratique néfaste (MGF, rites de veuvage, repassage des seins…)' }, citizenLabel: { en: 'Harmful tradition (cutting, widowhood rites…)', fr: 'Tradition néfaste (excision, rites de veuvage…)' } },
  { code: 'UNKNOWN', short: 'UN', label: { en: 'Unknown / not specified', fr: 'Inconnu / non précisé' }, citizenLabel: { en: 'Other / not sure', fr: 'Autre / je ne sais pas' } },
];

export const RELATIONSHIPS: CodeEntry<Relationship>[] = [
  { code: 'CURRENT_PARTNER', short: 'CP', label: { en: 'Current husband / partner', fr: 'Mari / partenaire actuel' } },
  { code: 'FORMER_PARTNER', short: 'FP', label: { en: 'Former husband / partner', fr: 'Ex-mari / ex-partenaire' } },
  { code: 'FAMILY_MEMBER', short: 'FA', label: { en: 'Family member', fr: 'Membre de la famille' } },
  { code: 'IN_LAW', short: 'IL', label: { en: 'In-law', fr: 'Belle-famille' } },
  { code: 'ACQUAINTANCE', short: 'AQ', label: { en: 'Acquaintance / neighbour', fr: 'Connaissance / voisin' } },
  { code: 'AUTHORITY_FIGURE', short: 'AU', label: { en: 'Person in authority (teacher, employer, leader)', fr: 'Personne en autorité (enseignant, employeur, chef)' } },
  { code: 'STRANGER', short: 'ST', label: { en: 'Stranger', fr: 'Inconnu' } },
  { code: 'UNKNOWN', short: 'UN', label: { en: 'Unknown', fr: 'Inconnu / non précisé' } },
];

export const PROCEDURE_STATUSES: CodeEntry<ProcedureStatus>[] = [
  { code: 'REPORTED', short: 'RP', label: { en: 'Reported / complaint registered', fr: 'Signalé / plainte enregistrée' } },
  { code: 'REFERRED_SERVICES', short: 'RS', label: { en: 'Referred to support services', fr: 'Orienté vers les services de prise en charge' } },
  { code: 'UNDER_INVESTIGATION', short: 'UI', label: { en: 'Under investigation', fr: 'Enquête en cours' } },
  { code: 'REFERRED_PROSECUTOR', short: 'RQ', label: { en: 'Referred to the prosecutor', fr: 'Transmis au Procureur' } },
  { code: 'PROSECUTION_OPEN', short: 'PO', label: { en: 'Prosecution opened', fr: 'Poursuites engagées' } },
  { code: 'TRIAL', short: 'TR', label: { en: 'Trial in progress', fr: 'Procès en cours' } },
  { code: 'JUDGMENT_CONVICTION', short: 'JC', label: { en: 'Judgment: conviction', fr: 'Jugement : condamnation' } },
  { code: 'JUDGMENT_ACQUITTAL', short: 'JA', label: { en: 'Judgment: acquittal', fr: 'Jugement : acquittement' } },
  { code: 'CLOSED_NO_ACTION', short: 'CN', label: { en: 'Closed without further action', fr: 'Classé sans suite' } },
  { code: 'WITHDRAWN', short: 'WD', label: { en: 'Complaint withdrawn', fr: 'Plainte retirée' } },
  { code: 'UNKNOWN', short: 'UN', label: { en: 'Unknown', fr: 'Inconnu' } },
];

export const AGE_BANDS: CodeEntry<AgeBand>[] = [
  { code: 'U12', short: 'U12', label: { en: 'Under 12', fr: 'Moins de 12 ans' } },
  { code: 'A12_17', short: '12', label: { en: '12–17', fr: '12–17 ans' } },
  { code: 'A18_24', short: '18', label: { en: '18–24', fr: '18–24 ans' } },
  { code: 'A25_34', short: '25', label: { en: '25–34', fr: '25–34 ans' } },
  { code: 'A35_49', short: '35', label: { en: '35–49', fr: '35–49 ans' } },
  { code: 'A50P', short: '50', label: { en: '50 and over', fr: '50 ans et plus' } },
  { code: 'UNKNOWN', short: 'UN', label: { en: 'Unknown', fr: 'Inconnu' } },
];

export const REFERRALS: CodeEntry<Referral>[] = [
  { code: 'MEDICAL', short: 'ME', label: { en: 'Medical care', fr: 'Soins médicaux' } },
  { code: 'PSYCHOSOCIAL', short: 'PS', label: { en: 'Psychosocial support', fr: 'Soutien psychosocial' } },
  { code: 'LEGAL', short: 'LE', label: { en: 'Legal aid', fr: 'Aide juridique' } },
  { code: 'SHELTER', short: 'SH', label: { en: 'Emergency shelter', fr: 'Hébergement d’urgence' } },
  { code: 'POLICE', short: 'PO', label: { en: 'Police / gendarmerie', fr: 'Police / gendarmerie' } },
  { code: 'ECONOMIC', short: 'EC', label: { en: 'Economic empowerment', fr: 'Autonomisation économique' } },
];

/** Placeholder screening items: replace with a validated lethality-risk instrument approved by MINPROFF. */
export const RISK_ITEMS: CodeEntry<RiskItem>[] = [
  { code: 'threatsToKill', short: 'TK', label: { en: 'Has the alleged perpetrator threatened to kill her?', fr: 'L’auteur présumé a-t-il menacé de la tuer ?' } },
  { code: 'strangulation', short: 'SG', label: { en: 'Has he ever choked or strangled her?', fr: 'L’a-t-il déjà étranglée ou étouffée ?' } },
  { code: 'weaponAccess', short: 'WA', label: { en: 'Does he have access to a weapon (gun, machete…)?', fr: 'A-t-il accès à une arme (fusil, machette…) ?' } },
  { code: 'escalation', short: 'ES', label: { en: 'Has the violence become more frequent or severe?', fr: 'Les violences sont-elles plus fréquentes ou plus graves ?' } },
  { code: 'recentSeparation', short: 'RS', label: { en: 'Has she recently left or tried to leave him?', fr: 'L’a-t-elle récemment quitté ou tenté de le quitter ?' } },
  { code: 'pregnancy', short: 'PR', label: { en: 'Is she currently pregnant?', fr: 'Est-elle actuellement enceinte ?' } },
  { code: 'coerciveControl', short: 'CC', label: { en: 'Does he constantly control her movements or contacts?', fr: 'Contrôle-t-il constamment ses déplacements ou contacts ?' } },
];

export const ROLES: CodeEntry<Role>[] = [
  { code: 'police', short: 'POL', label: { en: 'National Police', fr: 'Sûreté nationale' } },
  { code: 'gendarmerie', short: 'GEN', label: { en: 'Gendarmerie', fr: 'Gendarmerie' } },
  { code: 'justice', short: 'JUS', label: { en: 'Justice (court / prosecutor)', fr: 'Justice (tribunal / parquet)' } },
  { code: 'minproff', short: 'MIN', label: { en: 'MINPROFF centre', fr: 'Centre MINPROFF' } },
  { code: 'health', short: 'HEA', label: { en: 'Health facility', fr: 'Formation sanitaire' } },
  { code: 'helpline', short: 'HLP', label: { en: 'Helpline (1166)', fr: 'Ligne d’écoute (1166)' } },
];

export function labelOf<T extends string>(list: CodeEntry<T>[], code: T | undefined, lang: 'en' | 'fr'): string {
  if (!code) return '—';
  const entry = list.find((e) => e.code === code);
  return entry ? entry.label[lang] : code;
}

export function byShort<T extends string>(list: CodeEntry<T>[], short: string): T | undefined {
  return list.find((e) => e.short === short)?.code;
}

export function shortOf<T extends string>(list: CodeEntry<T>[], code: T): string {
  return list.find((e) => e.code === code)?.short ?? 'UN';
}
