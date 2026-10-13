// Quality, outcomes and engagement hub (v1/quality-hub): record pages, reports and module settings
// for OBE, accreditation, feedback, mentoring, grievances, placements, alumni, research, events,
// communication, documents and skills. Shapes match services/api/src/quality-hub.
import type { Tone } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';

export type FactKind = 'text' | 'date' | 'datetime' | 'paise' | 'number' | 'lpa' | 'bool';
export type CellValue = string | number | boolean | null;

export interface QhRecord {
  entity: QhEntity;
  id: string;
  module: QhModule;
  title: string;
  status: string;
  createdAt: string | null;
  facts: { key: string; kind: FactKind; value: CellValue }[];
  body: { key: string; value: string }[];
  steps: { status: string; state: 'done' | 'current' | 'upcoming' | 'rejected' }[];
  related: { key: string; columns: [string, FactKind][]; rows: ({ id: string } & Record<string, CellValue>)[] }[];
  activity: { id: string; action: string; at: string; actor: string; data: unknown }[];
}

export interface QhReport {
  id: string;
  module: QhModule;
  criterion: string | null;
  columns: [string, FactKind][];
  statuses: string[];
  entity: QhEntity | null;
  rows: ({ id: string } & Record<string, CellValue>)[];
}

export interface Series {
  prefix: string;
  next: number;
  pad: number;
  suffix?: string;
}
export interface RuleDef {
  key: string;
  kind: 'number' | 'boolean' | 'choice';
  default: number | boolean | string;
  min?: number;
  max?: number;
  choices?: string[];
}
export interface QhSettings {
  numbering: Record<string, Series>;
  rules: Record<string, number | boolean | string>;
  templates: Record<string, string>;
  defaults: Record<string, number | boolean | string>;
}
export interface QhSettingsView {
  module: QhModule;
  catalogue: { numbering: Record<string, Series>; rules: RuleDef[]; templates: Record<string, string>; defaults: RuleDef[] };
  settings: QhSettings;
  updatedAt: string | null;
  updatedBy: string | null;
  canEdit: boolean;
}

export const QH_MODULES = ['obe', 'accreditation', 'feedback', 'mentoring', 'grievances', 'placements', 'alumni', 'research', 'events', 'communication', 'documents', 'skills'] as const;
export type QhModule = (typeof QH_MODULES)[number];
export const QH_ENTITIES = ['grievance', 'discipline', 'drive', 'proposal', 'project', 'patent', 'survey', 'feedbackReport', 'gapAction', 'event', 'campaign', 'certificate', 'mentoringRequest'] as const;
export type QhEntity = (typeof QH_ENTITIES)[number];
export const isQhModule = (m: string): m is QhModule => (QH_MODULES as readonly string[]).includes(m);
export const isQhEntity = (e: string): e is QhEntity => (QH_ENTITIES as readonly string[]).includes(e);

/** Where each module's own desk lives, for the "Open the desk" link. */
export const MODULE_HOME: Record<QhModule, string> = {
  obe: '/obe',
  accreditation: '/accreditation/iqac',
  feedback: '/surveys',
  mentoring: '/mentoring',
  grievances: '/grievances',
  placements: '/placements',
  alumni: '/alumni',
  research: '/research',
  events: '/campus-life',
  communication: '/communication',
  documents: '/documents',
  skills: '/skills',
};

/** snake_case or camelCase key to the dictionary's camelCase field key. */
export const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export const fieldKey = (k: string) => `qh.f.${camel(k)}` as MessageKey;
export const statusKey = (s: string) => `qh.st.${s}` as MessageKey;

const TONES: Record<string, Tone> = {
  open: 'info', in_progress: 'info', assigned: 'info', under_review: 'info', submitted: 'info', scheduled: 'info', sending: 'info', action_planned: 'info', pending: 'info', requested: 'warning', reported: 'warning', escalated: 'warning', on_hold: 'warning', appealed: 'warning', draft: 'neutral', filed: 'info', published: 'success',
  resolved: 'success', closed: 'neutral', completed: 'success', approved: 'success', granted: 'success', done: 'success', sent: 'success', issued: 'success', action_taken: 'success', accepted: 'success', analysed: 'info', active: 'success',
  rejected: 'danger', cancelled: 'danger', revoked: 'danger', withdrawn: 'neutral', declined: 'danger',
};
export const statusTone = (s: string): Tone => TONES[s] ?? 'neutral';

/**
 * The next moves on a record, by entity and current status. Each one calls the module's own endpoint
 * (see app/(dashboard)/quality/actions.ts), so the module's rules and notifications still apply.
 * `note` asks for a comment first; `danger` styles it as a destructive action.
 */
export interface QhMove {
  key: string;
  note?: 'required' | 'optional';
  danger?: boolean;
}
export const MOVES: Partial<Record<QhEntity, Record<string, QhMove[]>>> = {
  grievance: { open: [{ key: 'start' }, { key: 'resolve', note: 'required' }], assigned: [{ key: 'start' }, { key: 'resolve', note: 'required' }], escalated: [{ key: 'start' }, { key: 'resolve', note: 'required' }], in_progress: [{ key: 'resolve', note: 'required' }], reopened: [{ key: 'resolve', note: 'required' }] },
  discipline: { reported: [{ key: 'review' }], under_review: [{ key: 'close' }], action_taken: [{ key: 'close' }], appealed: [{ key: 'close' }] },
  drive: { draft: [{ key: 'open' }, { key: 'cancel', danger: true }], open: [{ key: 'close' }, { key: 'cancel', danger: true }], closed: [{ key: 'complete' }] },
  proposal: { submitted: [{ key: 'review' }] },
  project: { active: [{ key: 'complete', note: 'optional' }, { key: 'hold' }], on_hold: [{ key: 'resume' }, { key: 'cancel', danger: true }] },
  patent: { filed: [{ key: 'publish' }, { key: 'grant' }, { key: 'reject', danger: true }], published: [{ key: 'grant' }, { key: 'reject', danger: true }] },
  survey: { draft: [{ key: 'publish' }], open: [{ key: 'close' }] },
  feedbackReport: { analysed: [{ key: 'plan', note: 'required' }], action_planned: [{ key: 'actionTaken', note: 'required' }] },
  gapAction: { open: [{ key: 'start' }, { key: 'done' }], in_progress: [{ key: 'done' }] },
  event: { draft: [{ key: 'publish' }, { key: 'cancel', danger: true }], published: [{ key: 'cancel', danger: true }] },
  campaign: { scheduled: [{ key: 'cancel', danger: true }] },
  certificate: { approved: [{ key: 'issue' }], issued: [{ key: 'revoke', note: 'required', danger: true }] },
};

/** Records whose current step is an approve / reject decision (shown in the ApprovalPanel). */
export const DECISIONS: Partial<Record<QhEntity, string[]>> = {
  proposal: ['submitted', 'under_review'],
  certificate: ['requested'],
};

/** Reports in the order they are listed, grouped by module. */
export const REPORT_IDS = [
  'accreditation.summary', 'obe.cqi', 'feedback.atr', 'feedback.surveys', 'mentoring.sessions', 'grievances.register', 'grievances.discipline', 'placements.offers', 'placements.drives',
  'alumni.directory', 'research.publications', 'research.ipr', 'research.projects', 'events.register', 'communication.campaigns', 'documents.certificates', 'skills.evidence',
] as const;
export const reportKey = (id: string) => `qh.r.${id.replace('.', '_')}` as MessageKey;
