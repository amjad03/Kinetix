import { Award, BookOpen, Briefcase, CalendarClock, CalendarDays, ClipboardCheck, FileText, GraduationCap, HandCoins, IdCard, Landmark, ListChecks, LogOut, Palmtree, Receipt, Repeat, ScrollText, Shuffle, Tags, Timer, UserCheck, UserPlus, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import type { Row } from '@/lib/records';

/** How a list cell shows its value. */
export interface ColSpec {
  key: string;
  label: MessageKey;
  /** The API's sort key. */
  sort?: string;
  kind?: 'text' | 'date' | 'datetime' | 'money' | 'num' | 'yesno' | 'month' | 'option' | 'status';
  /** For option/status: the field whose `rk.o.<entity>.<field>.<value>` words to use (default: the key). */
  option?: string;
  tones?: Record<string, Tone>;
  /** A second line under the value (another row key). */
  sub?: string;
  hidden?: boolean;
  hideBelow?: 'sm' | 'md' | 'lg';
  wrap?: boolean;
  /** yes/no as a tick. */
  tick?: boolean;
}

export interface ParamField {
  name: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'month' | 'time' | 'select';
  required?: boolean;
  options?: { value: string; label: MessageKey }[];
  /** Options the page passes in (`choices` prop), e.g. designations. */
  choices?: string;
  help?: MessageKey;
  initial?: string;
}

/** A module action that needs answers before it runs. */
export interface ParamAction {
  key: string;
  fields: ParamField[];
  help?: MessageKey;
  tone?: 'danger';
  /** Offered on a row only when this holds. */
  when?: (r: Row) => boolean;
  /** Offered for a selection too (default true). */
  bulk?: boolean;
  /** Exactly one of these fields must be given. */
  oneOf?: string[];
}

/** A module action run straight from a row's menu (approve, reject). */
export interface QuickAction {
  key: string;
  when: (r: Row) => boolean;
  tone?: 'danger';
}

export interface ListConfig {
  label: MessageKey;
  empty: { icon?: LucideIcon; title: MessageKey; body?: MessageKey };
  cols: ColSpec[];
  rowHref?: (r: Row) => string | undefined;
  quick?: QuickAction[];
  params?: ParamAction[];
  links?: (r: Row) => { label: MessageKey; href: string }[];
  /** A file a row can take (a scan, a resume, a medical certificate). */
  upload?: { label: MessageKey; kind: 'staff-doc' | 'resume' | 'leave-doc' | 'training-cert'; when?: (r: Row) => boolean };
}

const DECISION_TONES: Record<string, Tone> = { pending: 'warning', recommended: 'info', approved: 'success', rejected: 'danger', cancelled: 'neutral' };
const waiting = (r: Row) => r.status === 'pending' || r.status === 'recommended';
const note: ParamField = { name: 'note', type: 'textarea' };
const reason: ParamField = { name: 'reason', type: 'textarea', required: true };
const dl = (kind: string, id: string) => `/api/download?kind=${kind}&id=${id}`;
const staffLink = (r: Row) => (r.userId ? `/hr/staff/${String(r.userId)}` : undefined);

/** Columns, links and actions of every HR and payroll kit list. */
export const HR_LISTS = {
  'staff-qualifications': {
    label: 'rk.entity.staff-qualifications',
    empty: { icon: GraduationCap, title: 'hk.empty.qualifications', body: 'hk.empty.qualificationsBody' },
    rowHref: staffLink,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'title', label: 'rk.f.staff-qualifications.title', sort: 'title' },
      { key: 'level', label: 'rk.f.staff-qualifications.level', kind: 'option', sort: 'level' },
      { key: 'specialisation', label: 'rk.f.staff-qualifications.specialisation', hideBelow: 'md' },
      { key: 'university', label: 'rk.f.staff-qualifications.university', hideBelow: 'lg' },
      { key: 'year', label: 'rk.f.staff-qualifications.year', sort: 'year' },
      { key: 'percentage', label: 'rk.f.staff-qualifications.percentage', kind: 'num', hidden: true },
      { key: 'kind', label: 'rk.f.staff-qualifications.kind', kind: 'option', hidden: true },
      { key: 'verified', label: 'hk.col.verified', kind: 'yesno', tick: true },
    ],
  },
  'staff-experience': {
    label: 'rk.entity.staff-experience',
    empty: { icon: Briefcase, title: 'hk.empty.experience', body: 'hk.empty.experienceBody' },
    rowHref: staffLink,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'organisation', label: 'rk.f.staff-experience.organisation', sort: 'organisation', sub: 'designation' },
      { key: 'kind', label: 'rk.f.staff-experience.kind', kind: 'option' },
      { key: 'fromDate', label: 'rk.f.staff-experience.fromDate', kind: 'date', sort: 'from' },
      { key: 'toDate', label: 'rk.f.staff-experience.toDate', kind: 'date' },
      { key: 'years', label: 'hk.col.years', kind: 'num', sort: 'years' },
      { key: 'lastPay', label: 'rk.f.staff-experience.lastPayPaise', kind: 'money', hidden: true },
      { key: 'verified', label: 'hk.col.verified', kind: 'yesno', tick: true },
    ],
  },
  'staff-publications': {
    label: 'rk.entity.staff-publications',
    empty: { icon: BookOpen, title: 'hk.empty.publications', body: 'hk.empty.publicationsBody' },
    rowHref: staffLink,
    cols: [
      { key: 'title', label: 'rk.f.staff-publications.title', sort: 'title', sub: 'venue', wrap: true },
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', hideBelow: 'sm' },
      { key: 'kind', label: 'rk.f.staff-publications.kind', kind: 'option' },
      { key: 'year', label: 'rk.f.staff-publications.year', sort: 'year' },
      { key: 'indexing', label: 'rk.f.staff-publications.indexing', kind: 'status', tones: { scopus: 'success', wos: 'success', ugc_care: 'info', peer_reviewed: 'neutral', none: 'neutral' } },
      { key: 'issnIsbn', label: 'rk.f.staff-publications.issnIsbn', hidden: true },
      { key: 'impactFactor', label: 'rk.f.staff-publications.impactFactor', kind: 'num', sort: 'impact', hidden: true },
      { key: 'authorRole', label: 'rk.f.staff-publications.authorRole', kind: 'option', hidden: true },
      { key: 'status', label: 'rk.f.staff-publications.status', kind: 'option', hidden: true },
      { key: 'verified', label: 'hk.col.verified', kind: 'yesno', tick: true },
    ],
  },
  'staff-documents': {
    label: 'rk.entity.staff-documents',
    empty: { icon: FileText, title: 'hk.empty.documents', body: 'hk.empty.documentsBody' },
    rowHref: staffLink,
    cols: [
      { key: 'title', label: 'rk.f.staff-documents.title', sort: 'title', sub: 'staffName' },
      { key: 'kind', label: 'rk.f.staff-documents.kind', kind: 'option', sort: 'kind' },
      { key: 'number', label: 'rk.f.staff-documents.number', hideBelow: 'md' },
      { key: 'expiresOn', label: 'rk.f.staff-documents.expiresOn', kind: 'date', sort: 'expires' },
      { key: 'hasFile', label: 'hk.col.scan', kind: 'yesno', tick: true },
      { key: 'verified', label: 'hk.col.verified', kind: 'yesno', tick: true },
    ],
    links: (r: Row) => (r.hasFile ? [{ label: 'hk.link.scan', href: dl('staff-doc', r.id) }] : []),
    upload: { label: 'hk.upload.scan', kind: 'staff-doc' },
  },
  designations: {
    label: 'rk.entity.designations',
    empty: { icon: IdCard, title: 'hk.empty.designations', body: 'hk.empty.designationsBody' },
    cols: [
      { key: 'name', label: 'rk.f.designations.name', sort: 'name' },
      { key: 'grade', label: 'rk.f.designations.grade', sort: 'grade' },
      { key: 'cadre', label: 'rk.f.designations.cadre', kind: 'option', sort: 'cadre' },
      { key: 'staffCategory', label: 'rk.f.designations.staffCategory', kind: 'option' },
      { key: 'staffCount', label: 'hk.col.staffCount', kind: 'num', sort: 'staff' },
    ],
  },
  'leave-types': {
    label: 'rk.entity.leave-types',
    empty: { icon: Tags, title: 'hk.empty.leaveTypes' },
    cols: [
      { key: 'code', label: 'rk.f.leave-types.code', sort: 'code', sub: 'name' },
      { key: 'kind', label: 'rk.f.leave-types.kind', kind: 'option' },
      { key: 'paid', label: 'rk.f.leave-types.paid', kind: 'yesno' },
      { key: 'annualDays', label: 'rk.f.leave-types.annualDays', kind: 'num', sort: 'days' },
      { key: 'accrual', label: 'rk.f.leave-types.accrual', kind: 'option', hideBelow: 'md' },
      { key: 'carryForwardMax', label: 'rk.f.leave-types.carryForwardMax', kind: 'num', hideBelow: 'lg' },
      { key: 'maxPerRequest', label: 'rk.f.leave-types.maxPerRequest', kind: 'num', hidden: true },
      { key: 'minNoticeDays', label: 'rk.f.leave-types.minNoticeDays', kind: 'num', hidden: true },
      { key: 'gender', label: 'rk.f.leave-types.gender', kind: 'option', hidden: true },
      { key: 'encashable', label: 'rk.f.leave-types.encashable', kind: 'yesno', hidden: true },
      { key: 'active', label: 'rk.f.leave-types.active', kind: 'yesno', tick: true },
    ],
  },
  'leave-requests': {
    label: 'rk.entity.leave-requests',
    empty: { icon: Palmtree, title: 'hk.empty.leave', body: 'hk.empty.leaveBody' },
    rowHref: (r: Row) => `/hr/leave/${r.id}`,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'departmentName' },
      { key: 'typeCode', label: 'hk.col.leave', sub: 'typeName' },
      { key: 'fromDate', label: 'rk.f.leave-requests.fromDate', kind: 'date', sort: 'from' },
      { key: 'toDate', label: 'rk.f.leave-requests.toDate', kind: 'date' },
      { key: 'days', label: 'hk.col.days', kind: 'num', sort: 'days' },
      { key: 'reason', label: 'rk.f.leave-requests.reason', wrap: true, hideBelow: 'lg' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: DECISION_TONES, sort: 'status' },
      { key: 'hasDocument', label: 'hk.col.document', kind: 'yesno', tick: true, hidden: true },
      { key: 'decidedByName', label: 'hk.col.decidedBy', hidden: true },
      { key: 'createdAt', label: 'hk.col.applied', kind: 'date', sort: 'applied', hidden: true },
    ],
    quick: [
      { key: 'approve', when: waiting },
      { key: 'reject', when: waiting, tone: 'danger' },
      { key: 'cancel', when: (r: Row) => r.status === 'pending' },
      { key: 'arrange', when: (r: Row) => r.status === 'approved' },
    ],
    params: [{ key: 'revoke', fields: [reason], tone: 'danger', when: (r: Row) => r.status === 'approved', help: 'hk.help.revoke' }],
    links: (r: Row) => (r.hasDocument ? [{ label: 'hk.link.document', href: dl('leave-doc', r.id) }] : []),
    upload: { label: 'hk.upload.document', kind: 'leave-doc', when: (r: Row) => ['pending', 'recommended', 'approved'].includes(String(r.status)) },
  },
  'comp-off-credits': {
    label: 'rk.entity.comp-off-credits',
    empty: { icon: CalendarClock, title: 'hk.empty.compOff', body: 'hk.empty.compOffBody' },
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'workedOn', label: 'rk.f.comp-off-credits.workedOn', kind: 'date', sort: 'worked' },
      { key: 'days', label: 'hk.col.days', kind: 'num' },
      { key: 'reason', label: 'rk.f.comp-off-credits.reason', wrap: true, hideBelow: 'md' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: DECISION_TONES },
      { key: 'expiresOn', label: 'hk.col.useBy', kind: 'date', sort: 'expires' },
    ],
    quick: [{ key: 'approve', when: (r: Row) => r.status === 'pending' }],
    params: [{ key: 'reject', fields: [{ ...note, required: true }], tone: 'danger', when: (r: Row) => r.status === 'pending' }],
  },
  'attendance-regularisations': {
    label: 'rk.entity.attendance-regularisations',
    empty: { icon: ClipboardCheck, title: 'hk.empty.regularisations', body: 'hk.empty.regularisationsBody' },
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'date', label: 'rk.f.attendance-regularisations.date', kind: 'date', sort: 'date' },
      { key: 'kind', label: 'rk.f.attendance-regularisations.kind', kind: 'option' },
      { key: 'inTime', label: 'rk.f.attendance-regularisations.inTime', hideBelow: 'md' },
      { key: 'outTime', label: 'rk.f.attendance-regularisations.outTime', hideBelow: 'md' },
      { key: 'requestedStatus', label: 'rk.f.attendance-regularisations.requestedStatus', kind: 'option' },
      { key: 'markedStatus', label: 'hk.col.marked', kind: 'option', hidden: true },
      { key: 'reason', label: 'rk.f.attendance-regularisations.reason', wrap: true, hideBelow: 'lg' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: DECISION_TONES },
    ],
    quick: [{ key: 'approve', when: (r: Row) => r.status === 'pending' }],
    params: [{ key: 'reject', fields: [{ ...note, required: true }], tone: 'danger', when: (r: Row) => r.status === 'pending' }],
  },
  'job-openings': {
    label: 'rk.entity.job-openings',
    empty: { icon: UserPlus, title: 'hk.empty.openings', body: 'hk.empty.openingsBody' },
    rowHref: (r: Row) => `/hr/recruitment/${r.id}`,
    cols: [
      { key: 'title', label: 'rk.f.job-openings.title', sort: 'title', sub: 'departmentName' },
      { key: 'designationName', label: 'rk.f.job-openings.designationId', hideBelow: 'md' },
      { key: 'positions', label: 'rk.f.job-openings.positions', kind: 'num', sort: 'positions' },
      { key: 'applicants', label: 'hk.col.applicants', kind: 'num', sort: 'applicants' },
      { key: 'inProcess', label: 'hk.col.inProcess', kind: 'num', hideBelow: 'sm' },
      { key: 'hired', label: 'hk.col.hired', kind: 'num' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { open: 'success', on_hold: 'warning', closed: 'neutral', requested: 'info', rejected: 'danger' } },
      { key: 'closesOn', label: 'rk.f.job-openings.closesOn', kind: 'date', sort: 'closes', hidden: true },
    ],
  },
  'job-applicants': {
    label: 'rk.entity.job-applicants',
    empty: { icon: Users, title: 'hk.empty.applicants', body: 'hk.empty.applicantsBody' },
    rowHref: (r: Row) => `/hr/recruitment/${String(r.openingId)}/candidates/${r.id}`,
    cols: [
      { key: 'fullName', label: 'rk.f.job-applicants.fullName', sort: 'name', sub: 'qualification' },
      { key: 'openingTitle', label: 'hk.col.opening', hideBelow: 'md' },
      { key: 'experienceYears', label: 'rk.f.job-applicants.experienceYears', kind: 'num', sort: 'experience' },
      { key: 'phd', label: 'rk.f.job-applicants.phd', kind: 'yesno', tick: true, hideBelow: 'sm' },
      { key: 'netSet', label: 'rk.f.job-applicants.netSet', kind: 'yesno', tick: true, hideBelow: 'sm' },
      { key: 'screeningScore', label: 'hk.col.screening', kind: 'num', sort: 'screening', hidden: true },
      { key: 'interviewScore', label: 'hk.col.interview', kind: 'num', sort: 'interview' },
      { key: 'stage', label: 'hk.col.stage', kind: 'status', sort: 'stage', tones: { applied: 'neutral', screening: 'info', interview: 'info', offer: 'warning', hired: 'success', rejected: 'danger', withdrawn: 'neutral' } },
      { key: 'source', label: 'rk.f.job-applicants.source', kind: 'option', hidden: true },
      { key: 'expectedCtc', label: 'rk.f.job-applicants.expectedCtcPaise', kind: 'money', hidden: true },
    ],
    quick: [
      { key: 'shortlist', when: (r: Row) => r.stage === 'applied' },
      { key: 'interview', when: (r: Row) => r.stage === 'applied' || r.stage === 'screening' },
    ],
    params: [
      { key: 'reject', fields: [note], tone: 'danger', when: (r: Row) => !['hired', 'rejected', 'withdrawn'].includes(String(r.stage)) },
      { key: 'withdraw', fields: [note], when: (r: Row) => !['hired', 'rejected', 'withdrawn'].includes(String(r.stage)) },
    ],
    links: (r: Row) => (r.hasResume ? [{ label: 'hk.link.resume', href: dl('resume', r.id) }] : []),
    upload: { label: 'hk.upload.resume', kind: 'resume' },
  },
  'job-interviews': {
    label: 'rk.entity.job-interviews',
    empty: { icon: CalendarDays, title: 'hk.empty.interviews', body: 'hk.empty.interviewsBody' },
    rowHref: (r: Row) => `/hr/recruitment/${String(r.openingId)}/candidates/${String(r.applicantId)}`,
    cols: [
      { key: 'applicantName', label: 'rk.f.job-interviews.applicantId', sort: 'applicant', sub: 'openingTitle' },
      { key: 'round', label: 'rk.f.job-interviews.round', kind: 'num' },
      { key: 'kind', label: 'rk.f.job-interviews.kind', kind: 'option' },
      { key: 'date', label: 'rk.f.job-interviews.date', kind: 'date', sort: 'when', sub: 'time' },
      { key: 'venue', label: 'rk.f.job-interviews.venue', hideBelow: 'lg' },
      { key: 'panelNames', label: 'hk.col.panel', wrap: true, hideBelow: 'md' },
      { key: 'average', label: 'hk.col.average', kind: 'num', sort: 'average' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { scheduled: 'info', completed: 'success', cancelled: 'neutral' } },
    ],
  },
  'salary-components': {
    label: 'rk.entity.salary-components',
    empty: { icon: Wallet, title: 'hk.empty.components' },
    cols: [
      { key: 'code', label: 'rk.f.salary-components.code', sort: 'code', sub: 'name' },
      { key: 'kind', label: 'rk.f.salary-components.kind', kind: 'option', sort: 'kind' },
      { key: 'calc', label: 'rk.f.salary-components.calc', kind: 'option' },
      { key: 'percent', label: 'hk.col.rateToday', kind: 'num' },
      { key: 'baseCode', label: 'rk.f.salary-components.baseCode', hideBelow: 'md' },
      { key: 'pfWage', label: 'rk.f.salary-components.pfWage', kind: 'yesno', hideBelow: 'sm' },
      { key: 'taxable', label: 'rk.f.salary-components.taxable', kind: 'yesno', hidden: true },
      { key: 'used', label: 'hk.col.staffCount', kind: 'num' },
      { key: 'active', label: 'rk.f.salary-components.active', kind: 'yesno', tick: true },
    ],
    params: [
      {
        key: 'revise',
        bulk: false,
        when: (r: Row) => r.calc === 'percent',
        help: 'hk.help.revise',
        fields: [
          { name: 'effectiveMonth', type: 'month', required: true },
          { name: 'percent', type: 'number', required: true },
          { name: 'arrearsMonth', type: 'month', help: 'hk.help.arrearsMonth' },
          note,
        ],
      },
    ],
  },
  'payroll-adjustments': {
    label: 'rk.entity.payroll-adjustments',
    empty: { icon: Receipt, title: 'hk.empty.adjustments', body: 'hk.empty.adjustmentsBody' },
    rowHref: staffLink,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'kind', label: 'rk.f.payroll-adjustments.kind', kind: 'option' },
      { key: 'payMonth', label: 'rk.f.payroll-adjustments.payMonth', kind: 'month', sort: 'month' },
      { key: 'amount', label: 'rk.f.payroll-adjustments.amountPaise', kind: 'money', sort: 'amount' },
      { key: 'reason', label: 'rk.f.payroll-adjustments.reason', wrap: true, hideBelow: 'md' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: DECISION_TONES },
      { key: 'run', label: 'hk.col.run', hidden: true },
    ],
    quick: [
      { key: 'approve', when: (r: Row) => r.status === 'pending' },
      { key: 'reject', when: (r: Row) => r.status === 'pending', tone: 'danger' },
    ],
  },
  'staff-loans': {
    label: 'rk.entity.staff-loans',
    empty: { icon: HandCoins, title: 'hk.empty.loans', body: 'hk.empty.loansBody' },
    rowHref: (r: Row) => `/payroll/loans/${r.id}`,
    cols: [
      { key: 'loanNo', label: 'hk.col.number', sub: 'staffName' },
      { key: 'kind', label: 'rk.f.staff-loans.kind', kind: 'option' },
      { key: 'amount', label: 'rk.f.staff-loans.amountPaise', kind: 'money', sort: 'amount' },
      { key: 'installments', label: 'rk.f.staff-loans.installments', kind: 'num', hideBelow: 'md' },
      { key: 'emi', label: 'hk.col.emi', kind: 'money', hideBelow: 'md' },
      { key: 'startMonth', label: 'rk.f.staff-loans.startMonth', kind: 'month', sort: 'start', hideBelow: 'lg' },
      { key: 'outstanding', label: 'hk.col.outstanding', kind: 'money' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { pending: 'warning', approved: 'info', rejected: 'danger', cancelled: 'neutral', closed: 'success' } },
    ],
    params: [
      { key: 'approve', fields: [note], when: (r: Row) => r.status === 'pending' },
      { key: 'reject', fields: [{ ...note, required: true }], tone: 'danger', when: (r: Row) => r.status === 'pending' },
      { key: 'close', fields: [{ ...note, required: true }], when: (r: Row) => r.status === 'approved', help: 'hk.help.closeLoan' },
    ],
  },
  'tds-challans': {
    label: 'rk.entity.tds-challans',
    empty: { icon: Landmark, title: 'hk.empty.challans', body: 'hk.empty.challansBody' },
    cols: [
      { key: 'payMonth', label: 'rk.f.tds-challans.payMonth', kind: 'month', sort: 'month' },
      { key: 'bsrCode', label: 'rk.f.tds-challans.bsrCode' },
      { key: 'challanSerial', label: 'rk.f.tds-challans.challanSerial' },
      { key: 'depositedOn', label: 'rk.f.tds-challans.depositedOn', kind: 'date', sort: 'deposited' },
      { key: 'tds', label: 'rk.f.tds-challans.tdsPaise', kind: 'money', sort: 'amount' },
      { key: 'deducted', label: 'hk.col.deducted', kind: 'money', hideBelow: 'md' },
      { key: 'interest', label: 'rk.f.tds-challans.interestPaise', kind: 'money', hidden: true },
    ],
  },
  'training-records': {
    label: 'rk.entity.training-records',
    empty: { icon: Award, title: 'hk.empty.training', body: 'hk.empty.trainingBody' },
    rowHref: (r: Row) => `/hr/training/${r.id}`,
    cols: [
      { key: 'title', label: 'rk.f.training-records.title', sort: 'title', sub: 'organiser', wrap: true },
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', hideBelow: 'sm' },
      { key: 'kind', label: 'rk.f.training-records.kind', kind: 'option' },
      { key: 'startsOn', label: 'rk.f.training-records.startsOn', kind: 'date', sort: 'starts' },
      { key: 'hours', label: 'rk.f.training-records.hours', kind: 'num', sort: 'hours' },
      { key: 'hasCertificate', label: 'hk.col.certificate', kind: 'yesno', tick: true, hideBelow: 'md' },
      { key: 'verified', label: 'hk.col.verified', kind: 'yesno', tick: true },
    ],
    links: (r: Row) => (r.hasCertificate ? [{ label: 'hk.link.certificate', href: dl('training-cert', r.id) }] : []),
    upload: { label: 'hk.upload.certificate', kind: 'training-cert' },
  },
  'appraisal-cycles': {
    label: 'rk.entity.appraisal-cycles',
    empty: { icon: ListChecks, title: 'hk.empty.cycles', body: 'hk.empty.cyclesBody' },
    rowHref: (r: Row) => `/hr/appraisal?cycle=${r.id}`,
    cols: [
      { key: 'period', label: 'rk.f.appraisal-cycles.period', sort: 'period' },
      { key: 'opensOn', label: 'rk.f.appraisal-cycles.opensOn', kind: 'date', sort: 'opens' },
      { key: 'closesOn', label: 'rk.f.appraisal-cycles.closesOn', kind: 'date' },
      { key: 'total', label: 'hk.col.appraisals', kind: 'num' },
      { key: 'finalised', label: 'hk.col.finalised', kind: 'num' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { open: 'success', closed: 'neutral' } },
    ],
  },
  'service-book': {
    label: 'rk.entity.service-book',
    empty: { icon: ScrollText, title: 'hk.empty.serviceBook', body: 'hk.empty.serviceBookBody' },
    rowHref: staffLink,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'onDate', label: 'rk.f.service-book.onDate', kind: 'date', sort: 'date' },
      { key: 'kind', label: 'rk.f.service-book.kind', kind: 'option' },
      { key: 'title', label: 'rk.f.service-book.title', wrap: true },
      { key: 'orderNo', label: 'rk.f.service-book.orderNo', hideBelow: 'md' },
    ],
  },
  'leave-encashments': {
    label: 'rk.entity.leave-encashments',
    empty: { icon: HandCoins, title: 'hk.empty.encashments' },
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'typeCode', label: 'hk.col.leave' },
      { key: 'days', label: 'hk.col.days', kind: 'num' },
      { key: 'amount', label: 'hk.col.amount', kind: 'money' },
      { key: 'payMonth', label: 'hk.col.payMonth', kind: 'month', sort: 'month' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: DECISION_TONES },
    ],
    params: [
      { key: 'approve', fields: [note], when: (r: Row) => r.status === 'pending' },
      { key: 'reject', fields: [{ ...note, required: true }], tone: 'danger', when: (r: Row) => r.status === 'pending' },
    ],
  },
  'onboarding-items': {
    label: 'rk.entity.onboarding-items',
    empty: { icon: UserCheck, title: 'hk.empty.onboarding', body: 'hk.empty.onboardingBody' },
    rowHref: staffLink,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'title', label: 'rk.f.onboarding-items.title', wrap: true },
      { key: 'owner', label: 'rk.f.onboarding-items.owner', kind: 'option' },
      { key: 'dueOn', label: 'rk.f.onboarding-items.dueOn', kind: 'date', sort: 'due' },
      { key: 'done', label: 'hk.col.done', kind: 'yesno', tick: true },
    ],
    quick: [
      { key: 'done', when: (r: Row) => !r.done },
      { key: 'undo', when: (r: Row) => !!r.done },
    ],
  },
  separations: {
    label: 'rk.entity.separations',
    empty: { icon: LogOut, title: 'hk.empty.exits' },
    rowHref: (r: Row) => `/hr/exit/${r.id}`,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'departmentName' },
      { key: 'resignedOn', label: 'hk.col.resigned', kind: 'date', sort: 'resigned' },
      { key: 'lastWorkingDay', label: 'hk.col.lastDay', kind: 'date', sort: 'lwd' },
      { key: 'pendingClearances', label: 'hk.col.clearances', kind: 'num', hideBelow: 'md' },
      { key: 'settlement', label: 'hk.col.settlement', kind: 'money', hideBelow: 'md' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { submitted: 'warning', accepted: 'info', clearance: 'info', settled: 'info', relieved: 'success', withdrawn: 'neutral' } },
    ],
    links: (r: Row) => (r.status === 'relieved' ? [{ label: 'hk.link.relieving', href: dl('relieving-letter', r.id) }, { label: 'hk.link.experience', href: dl('experience-cert', r.id) }] : []),
  },
  'staff-transfers': {
    label: 'rk.entity.staff-transfers',
    empty: { icon: Shuffle, title: 'hk.empty.transfers' },
    rowHref: staffLink,
    cols: [
      { key: 'staffName', label: 'hk.col.staff', sort: 'staff', sub: 'employeeCode' },
      { key: 'fromDepartment', label: 'hk.col.fromDept', hideBelow: 'md' },
      { key: 'toDepartment', label: 'hk.col.toDept' },
      { key: 'fromDesignation', label: 'hk.col.fromDesig', hidden: true },
      { key: 'toDesignation', label: 'hk.col.toDesig' },
      { key: 'effectiveOn', label: 'hk.col.effective', kind: 'date', sort: 'effective' },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { scheduled: 'warning', applied: 'success', cancelled: 'neutral' } },
    ],
  },
  delegations: {
    label: 'rk.entity.delegations',
    empty: { icon: Repeat, title: 'hk.empty.delegations', body: 'hk.empty.delegationsBody' },
    cols: [
      { key: 'delegatorName', label: 'hk.col.givenBy' },
      { key: 'delegateName', label: 'hk.col.givenTo' },
      { key: 'scope', label: 'rk.f.delegations.scope', kind: 'option' },
      { key: 'startsOn', label: 'rk.f.delegations.startsOn', kind: 'date', sort: 'starts' },
      { key: 'endsOn', label: 'rk.f.delegations.endsOn', kind: 'date' },
      { key: 'state', label: 'hk.col.status', kind: 'status', tones: { active: 'success', upcoming: 'info', ended: 'neutral', revoked: 'danger' } },
      { key: 'reason', label: 'rk.f.delegations.reason', wrap: true, hideBelow: 'md' },
    ],
  },
  'payroll-runs': {
    label: 'rk.entity.payroll-runs',
    empty: { icon: Timer, title: 'hk.empty.runs', body: 'hk.empty.runsBody' },
    rowHref: (r: Row) => `/payroll/runs/${r.id}`,
    cols: [
      { key: 'month', label: 'hk.col.month', kind: 'month', sort: 'month' },
      { key: 'kind', label: 'hk.col.kind', kind: 'option' },
      { key: 'staffCount', label: 'hk.col.payslips', kind: 'num' },
      { key: 'gross', label: 'hk.col.gross', kind: 'money', hideBelow: 'md' },
      { key: 'deductions', label: 'hk.col.deductions', kind: 'money', hideBelow: 'lg' },
      { key: 'net', label: 'hk.col.net', kind: 'money' },
      { key: 'cost', label: 'hk.col.cost', kind: 'money', hidden: true },
      { key: 'status', label: 'hk.col.status', kind: 'status', tones: { draft: 'neutral', verified: 'info', approved: 'warning', locked: 'success', reversed: 'danger' } },
    ],
  },
} satisfies Record<string, ListConfig>;

export type HrEntity = keyof typeof HR_LISTS;

/** The staff list's actions that need answers: an increment and a promotion. */
export const STAFF_PARAMS: ParamAction[] = [
  { key: 'increment', help: 'hk.help.increment', oneOf: ['percent', 'amountRupees'], fields: [{ name: 'effectiveFrom', type: 'date', required: true }, { name: 'percent', type: 'number' }, { name: 'amountRupees', type: 'number' }, { name: 'roundTo', type: 'number', initial: '100' }, note] },
  { key: 'promote', help: 'hk.help.promote', fields: [{ name: 'designationId', type: 'select', choices: 'designations', required: true }, { name: 'effectiveOn', type: 'date', required: true }, { name: 'basicRupees', type: 'number', help: 'hk.help.basicRupees' }, { name: 'orderNo', type: 'text' }, note] },
];
