export type Lang = 'en' | 'fr';
export type Bilingual = { en: string; fr: string };

export type IncidentType =
  | 'FEMICIDE'
  | 'ATTEMPTED_FEMICIDE'
  | 'RAPE'
  | 'SEXUAL_ASSAULT'
  | 'PHYSICAL_ASSAULT'
  | 'FORCED_MARRIAGE'
  | 'DENIAL_OF_RESOURCES'
  | 'PSYCHOLOGICAL_ABUSE'
  | 'HARMFUL_PRACTICE'
  | 'UNKNOWN';

export type Relationship =
  | 'CURRENT_PARTNER'
  | 'FORMER_PARTNER'
  | 'FAMILY_MEMBER'
  | 'IN_LAW'
  | 'ACQUAINTANCE'
  | 'AUTHORITY_FIGURE'
  | 'STRANGER'
  | 'UNKNOWN';

export type ProcedureStatus =
  | 'REPORTED'
  | 'REFERRED_SERVICES'
  | 'UNDER_INVESTIGATION'
  | 'REFERRED_PROSECUTOR'
  | 'PROSECUTION_OPEN'
  | 'TRIAL'
  | 'JUDGMENT_CONVICTION'
  | 'JUDGMENT_ACQUITTAL'
  | 'CLOSED_NO_ACTION'
  | 'WITHDRAWN'
  | 'UNKNOWN';

export type AgeBand = 'U12' | 'A12_17' | 'A18_24' | 'A25_34' | 'A35_49' | 'A50P' | 'UNKNOWN';
export type Referral = 'MEDICAL' | 'PSYCHOSOCIAL' | 'LEGAL' | 'SHELTER' | 'POLICE' | 'ECONOMIC';
export type RiskItem =
  | 'threatsToKill'
  | 'strangulation'
  | 'weaponAccess'
  | 'escalation'
  | 'recentSeparation'
  | 'pregnancy'
  | 'coerciveControl';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type Role = 'police' | 'gendarmerie' | 'justice' | 'minproff' | 'health' | 'helpline';
export type SyncState = 'draft' | 'queued' | 'synced' | 'error';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';

/** Commune/arrondissement-level location only: exact addresses are never captured (anonymity requirement). */
export interface Location {
  region?: string;
  department?: string;
  arrondissement?: string;
}

export interface ProcedureEvent {
  at: string;
  status: ProcedureStatus;
  byAgent: string;
  institution: Role;
}

/** Layer 1 standardized minimal dataset, identical at every entry point. */
export interface CaseRecord {
  localId: string;
  caseNumber?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  institution: Role;
  facility: string;
  sourceReportId?: string;
  incidentDate?: string;
  incidentType?: IncidentType;
  relationship?: Relationship;
  location: Location;
  procedureStatus?: ProcedureStatus;
  victimAgeBand?: AgeBand;
  repeatIncident?: YesNoUnknown;
  risk: Partial<Record<RiskItem, boolean>>;
  referrals: Referral[];
  consentToName: boolean;
  identity?: { victimName?: string; contactPhone?: string };
  notes?: string;
  history: ProcedureEvent[];
  syncState: SyncState;
  lastSyncError?: string;
}

export type ContactPreference = 'none' | 'call' | 'sms';
export type SafeTime = 'morning' | 'afternoon' | 'evening' | 'any';

/** Layer 4 citizen report: unverified until an institution confirms it. */
export interface CitizenReport {
  localId: string;
  createdAt: string;
  forWhom: 'self' | 'other';
  incidentType: IncidentType;
  immediateDanger: boolean;
  relationship: Relationship;
  location: Location;
  contactPreference: ContactPreference;
  safeContact?: string;
  safeTime?: SafeTime;
  consentToShare: boolean;
  details?: string;
  channel: 'app' | 'sms';
  outbox: 'queued' | 'sent' | 'sms_prepared';
  trackingCode?: string;
}

export type ReportServerStatus = 'RECEIVED' | 'UNDER_VERIFICATION' | 'VERIFIED' | 'NOT_CONFIRMED';

export interface ServerCitizenReport extends Omit<CitizenReport, 'outbox'> {
  trackingCode: string;
  receivedAt: string;
  status: ReportServerStatus;
  firstResponseAt?: string;
  handledBy?: string;
  linkedCaseNumber?: string;
}

export interface AgentSession {
  token: string;
  agentId: string;
  displayName: string;
  role: Role;
  facility: string;
  region: string;
  signedInAt: string;
}

/** Anonymized record pushed to the BUCREP statistical register (no PII, no free text). */
export interface RegisterRecord {
  caseNumber?: string;
  localId: string;
  institution: Role;
  facility: string;
  incidentDate?: string;
  incidentType?: IncidentType;
  relationship?: Relationship;
  location: Location;
  procedureStatus?: ProcedureStatus;
  victimAgeBand?: AgeBand;
  repeatIncident?: YesNoUnknown;
  riskLevel: RiskLevel;
  referrals: Referral[];
  sourceReportId?: string;
  history: ProcedureEvent[];
  updatedAt: string;
}
