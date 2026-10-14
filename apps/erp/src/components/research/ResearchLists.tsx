'use client';

import { BookOpen, Building2, CalendarClock, FileBadge, FlaskConical, Handshake, Lightbulb, Microscope, ScrollText, ShieldCheck, Trophy, Users, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { KitList, type ColSpec, type ParamAction } from '@/components/registers/KitList';
import type { Tone } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

const status = (good: string[], warn: string[] = [], bad: string[] = []) => (v: string): Tone => (good.includes(v) ? 'success' : warn.includes(v) ? 'warning' : bad.includes(v) ? 'danger' : 'neutral');

interface Spec {
  label: MessageKey;
  columns: ColSpec[];
  empty: { icon: ReactNode; title: MessageKey; body: MessageKey };
  paramActions?: ParamAction[];
}

/** The research office's registers: the columns each list shows, its empty state and the actions that ask for values. */
export const RESEARCH_SPECS: Record<string, Spec> = {
  'research-publications': {
    label: 'rsx.list.publications',
    columns: [
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'authors', header: 'rsx.col.authors', kind: 'list', hideBelow: 'md' },
      { key: 'venue', header: 'rsx.col.venue', hideBelow: 'lg' },
      { key: 'year', header: 'rsx.col.year' },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice', hideBelow: 'md' },
      { key: 'indexedIn', header: 'rsx.col.indexed', hideBelow: 'md' },
      { key: 'citations', header: 'rsx.col.citations', kind: 'number', hideBelow: 'sm' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['published'], ['accepted'], ['retracted']) },
      { key: 'doi', header: 'rsx.col.doi', defaultHidden: true },
      { key: 'ownerUserId', from: 'ownerUserIdName', header: 'rsx.col.owner', defaultHidden: true },
      { key: 'departmentId', from: 'departmentIdName', header: 'rsx.col.department', defaultHidden: true },
    ],
    empty: { icon: <BookOpen />, title: 'rsx.empty.publications', body: 'rsx.emptyBody.publications' },
  },
  'research-patents': {
    label: 'rsx.list.patents',
    columns: [
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice' },
      { key: 'inventors', header: 'rsx.col.inventors', kind: 'list', hideBelow: 'md' },
      { key: 'applicationNo', header: 'rsx.col.applicationNo', hideBelow: 'sm' },
      { key: 'filedOn', header: 'rsx.col.filedOn', kind: 'date', hideBelow: 'md' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['granted'], ['filed', 'published'], ['rejected']) },
      { key: 'grantedOn', header: 'rsx.col.grantedOn', kind: 'date', defaultHidden: true },
      { key: 'patentNo', header: 'rsx.col.patentNo', defaultHidden: true },
      { key: 'licensed', header: 'rsx.col.licensed', kind: 'bool', defaultHidden: true },
    ],
    empty: { icon: <Lightbulb />, title: 'rsx.empty.patents', body: 'rsx.emptyBody.patents' },
    paramActions: [
      { key: 'publish', fields: [{ name: 'on', label: 'rsx.p.publishedOn', type: 'date', required: true }], when: (r) => r.status === 'filed' },
      { key: 'grant', fields: [{ name: 'on', label: 'rsx.p.grantedOn', type: 'date', required: true }, { name: 'patentNo', label: 'rsx.p.patentNo', required: true }], when: (r) => r.status === 'filed' || r.status === 'published' },
    ],
  },
  'research-conferences': {
    label: 'rsx.list.conferences',
    columns: [
      { key: 'name', header: 'rsx.col.event', kind: 'wrap' },
      { key: 'role', header: 'rsx.col.role', kind: 'choice' },
      { key: 'level', header: 'rsx.col.level', kind: 'choice', hideBelow: 'sm' },
      { key: 'heldOn', header: 'rsx.col.heldOn', kind: 'date' },
      { key: 'userId', from: 'userIdName', header: 'rsx.col.teacher', hideBelow: 'md' },
      { key: 'paperTitle', header: 'rsx.col.paper', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <CalendarClock />, title: 'rsx.empty.conferences', body: 'rsx.emptyBody.conferences' },
  },
  'research-recognitions': {
    label: 'rsx.list.recognitions',
    columns: [
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'userId', from: 'userIdName', header: 'rsx.col.teacher' },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice' },
      { key: 'body', header: 'rsx.col.body', hideBelow: 'md' },
      { key: 'level', header: 'rsx.col.level', kind: 'choice', hideBelow: 'sm' },
      { key: 'receivedOn', header: 'rsx.col.receivedOn', kind: 'date' },
      { key: 'amount', header: 'rsx.col.amount', kind: 'money', defaultHidden: true },
    ],
    empty: { icon: <Trophy />, title: 'rsx.empty.recognitions', body: 'rsx.emptyBody.recognitions' },
  },
  'research-calls': {
    label: 'rsx.list.calls',
    columns: [
      { key: 'title', header: 'rsx.col.call', kind: 'strong' },
      { key: 'agency', header: 'rsx.col.agency' },
      { key: 'internalDeadline', header: 'rsx.col.internalDeadline', kind: 'date', hideBelow: 'sm' },
      { key: 'deadline', header: 'rsx.col.deadline', kind: 'date' },
      { key: 'daysLeft', header: 'rsx.col.daysLeft', kind: 'number', sortKey: false, hideBelow: 'md' },
      { key: 'proposals', header: 'rsx.col.proposals', kind: 'number', sortKey: false, hideBelow: 'md' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['open'], [], ['closed']) },
      { key: 'maxAmount', header: 'rsx.col.maxAmount', kind: 'money', defaultHidden: true },
    ],
    empty: { icon: <CalendarClock />, title: 'rsx.empty.calls', body: 'rsx.emptyBody.calls' },
  },
  'research-proposals': {
    label: 'rsx.list.proposals',
    columns: [
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'piUserId', from: 'piUserIdName', header: 'rsx.col.pi' },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice', hideBelow: 'md' },
      { key: 'fundingSought', header: 'rsx.col.fundingSought', kind: 'money', hideBelow: 'md' },
      { key: 'callDeadline', header: 'rsx.col.internalDeadline', kind: 'date', sortKey: false, hideBelow: 'lg' },
      { key: 'ethicsStatus', header: 'rsx.col.ethics', kind: 'choice', tone: status(['cleared', 'not_required'], ['pending'], ['rejected']), hideBelow: 'sm' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['approved'], ['submitted', 'under_review'], ['rejected', 'withdrawn']) },
      { key: 'reviewNote', header: 'rsx.col.reviewNote', kind: 'wrap', defaultHidden: true, sortKey: false },
    ],
    empty: { icon: <ScrollText />, title: 'rsx.empty.proposals', body: 'rsx.emptyBody.proposals' },
    paramActions: [
      { key: 'approve', fields: [{ name: 'startsOn', label: 'rsx.p.startsOn', type: 'date' }], when: (r) => r.status === 'submitted' || r.status === 'under_review' },
      { key: 'reject', fields: [{ name: 'note', label: 'rsx.p.reason', type: 'textarea', required: true }], tone: 'danger', when: (r) => r.status === 'submitted' || r.status === 'under_review' },
    ],
  },
  'research-projects': {
    label: 'rsx.list.projects',
    columns: [
      { key: 'code', header: 'rsx.col.code', kind: 'strong' },
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'piUserId', from: 'piUserIdName', header: 'rsx.col.pi', hideBelow: 'sm' },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice', hideBelow: 'md' },
      { key: 'startsOn', header: 'rsx.col.startsOn', kind: 'date', hideBelow: 'md' },
      { key: 'grantLakhs', header: 'rsx.col.grantLakhs', kind: 'number', sortKey: false, hideBelow: 'lg' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['active', 'completed'], ['on_hold'], ['cancelled']) },
      { key: 'sponsorOrg', header: 'rsx.col.sponsor', defaultHidden: true },
    ],
    empty: { icon: <FlaskConical />, title: 'rsx.empty.projects', body: 'rsx.emptyBody.projects' },
  },
  'research-grants': {
    label: 'rsx.list.grants',
    columns: [
      { key: 'agency', header: 'rsx.col.agency', kind: 'strong' },
      { key: 'projectTitle', header: 'rsx.col.project', kind: 'wrap', sortKey: false },
      { key: 'sanctionRef', header: 'rsx.col.sanctionRef', hideBelow: 'md' },
      { key: 'sanctioned', header: 'rsx.col.sanctioned', kind: 'money' },
      { key: 'spent', header: 'rsx.col.spent', kind: 'money', hideBelow: 'sm' },
      { key: 'balance', header: 'rsx.col.balance', kind: 'money', sortKey: false, hideBelow: 'md' },
      { key: 'endsOn', header: 'rsx.col.endsOn', kind: 'date', hideBelow: 'lg' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['active'], [], ['cancelled']) },
      { key: 'ucs', header: 'rsx.col.ucs', kind: 'number', sortKey: false, defaultHidden: true },
    ],
    empty: { icon: <Wallet />, title: 'rsx.empty.grants', body: 'rsx.emptyBody.grants' },
  },
  'grant-ucs': {
    label: 'rsx.list.ucs',
    columns: [
      { key: 'grantName', header: 'rsx.col.grant', kind: 'strong', sortKey: false },
      { key: 'periodFrom', header: 'rsx.col.periodFrom', kind: 'date' },
      { key: 'periodTo', header: 'rsx.col.periodTo', kind: 'date' },
      { key: 'utilised', header: 'rsx.col.utilised', kind: 'money' },
      { key: 'submittedOn', header: 'rsx.col.submittedOn', kind: 'date', hideBelow: 'sm' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['accepted'], ['submitted', 'draft'], ['returned']) },
      { key: 'reference', header: 'rsx.col.reference', defaultHidden: true },
    ],
    empty: { icon: <FileBadge />, title: 'rsx.empty.ucs', body: 'rsx.emptyBody.ucs' },
  },
  'research-seed-grants': {
    label: 'rsx.list.seed',
    columns: [
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'applicantUserId', from: 'applicantUserIdName', header: 'rsx.col.teacher' },
      { key: 'sanctioned', header: 'rsx.col.sanctioned', kind: 'money' },
      { key: 'utilised', header: 'rsx.col.utilised', kind: 'money', hideBelow: 'sm' },
      { key: 'sanctionedOn', header: 'rsx.col.sanctionedOn', kind: 'date', hideBelow: 'md' },
      { key: 'reportSubmittedOn', header: 'rsx.col.reportOn', kind: 'date', hideBelow: 'lg' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['completed', 'sanctioned'], ['applied'], ['rejected']) },
    ],
    empty: { icon: <Wallet />, title: 'rsx.empty.seed', body: 'rsx.emptyBody.seed' },
  },
  'research-consultancies': {
    label: 'rsx.list.consultancy',
    columns: [
      { key: 'title', header: 'rsx.col.title', kind: 'wrap' },
      { key: 'client', header: 'rsx.col.client' },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice', hideBelow: 'md' },
      { key: 'leadUserId', from: 'leadUserIdName', header: 'rsx.col.lead', hideBelow: 'md' },
      { key: 'received', header: 'rsx.col.received', kind: 'money' },
      { key: 'institutionShare', header: 'rsx.col.institutionShare', kind: 'money', sortKey: false, hideBelow: 'sm' },
      { key: 'consultantShare', header: 'rsx.col.consultantShare', kind: 'money', sortKey: false, hideBelow: 'lg' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['completed', 'active'], ['proposed'], ['cancelled']) },
      { key: 'startsOn', header: 'rsx.col.startsOn', kind: 'date', defaultHidden: true },
    ],
    empty: { icon: <Building2 />, title: 'rsx.empty.consultancy', body: 'rsx.emptyBody.consultancy' },
  },
  'research-mous': {
    label: 'rsx.list.mous',
    columns: [
      { key: 'partner', header: 'rsx.col.partner', kind: 'strong' },
      { key: 'partnerKind', header: 'rsx.col.kind', kind: 'choice', hideBelow: 'sm' },
      { key: 'signedOn', header: 'rsx.col.signedOn', kind: 'date' },
      { key: 'validUntil', header: 'rsx.col.validUntil', kind: 'date', hideBelow: 'sm' },
      { key: 'activities', header: 'rsx.col.activities', kind: 'number', sortKey: false, hideBelow: 'md' },
      { key: 'lastActivity', header: 'rsx.col.lastActivity', kind: 'date', sortKey: false, hideBelow: 'lg' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['active'], [], ['terminated']) },
      { key: 'purpose', header: 'rsx.col.purpose', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <Handshake />, title: 'rsx.empty.mous', body: 'rsx.emptyBody.mous' },
  },
  'research-mou-activities': {
    label: 'rsx.list.activities',
    columns: [
      { key: 'title', header: 'rsx.col.activity', kind: 'wrap' },
      { key: 'partner', header: 'rsx.col.partner', sortKey: false },
      { key: 'kind', header: 'rsx.col.kind', kind: 'choice', hideBelow: 'sm' },
      { key: 'heldOn', header: 'rsx.col.heldOn', kind: 'date' },
      { key: 'participants', header: 'rsx.col.participants', kind: 'number', hideBelow: 'md' },
    ],
    empty: { icon: <Handshake />, title: 'rsx.empty.activities', body: 'rsx.emptyBody.activities' },
  },
  'research-scholars': {
    label: 'rsx.list.scholars',
    columns: [
      { key: 'fullName', header: 'rsx.col.scholar', kind: 'strong' },
      { key: 'programme', header: 'rsx.col.programme', kind: 'choice', hideBelow: 'sm' },
      { key: 'supervisorUserId', from: 'supervisorUserIdName', header: 'rsx.col.supervisor' },
      { key: 'enrolledOn', header: 'rsx.col.registeredOn', kind: 'date', hideBelow: 'md' },
      { key: 'dcMeetings', header: 'rsx.col.dcMeetings', kind: 'number', sortKey: false, hideBelow: 'md' },
      { key: 'nextDcDue', header: 'rsx.col.nextDc', kind: 'date', sortKey: false, hideBelow: 'lg' },
      { key: 'courseworkDone', header: 'rsx.col.coursework', sortKey: false, hideBelow: 'lg' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['awarded'], ['thesis_submitted', 'enrolled'], ['withdrawn']) },
      { key: 'thesisTitle', header: 'rsx.col.thesis', kind: 'wrap', defaultHidden: true },
    ],
    empty: { icon: <Users />, title: 'rsx.empty.scholars', body: 'rsx.emptyBody.scholars' },
  },
  'scholar-dc-meetings': {
    label: 'rsx.list.dc',
    columns: [
      { key: 'scholarName', header: 'rsx.col.scholar', kind: 'strong', sortKey: false },
      { key: 'heldOn', header: 'rsx.col.heldOn', kind: 'date' },
      { key: 'progress', header: 'rsx.col.progress', kind: 'choice', tone: status(['satisfactory'], ['needs_improvement'], ['unsatisfactory']) },
      { key: 'nextDueOn', header: 'rsx.col.nextDc', kind: 'date', hideBelow: 'sm' },
      { key: 'recommendations', header: 'rsx.col.recommendations', kind: 'wrap', hideBelow: 'md' },
    ],
    empty: { icon: <Users />, title: 'rsx.empty.dc', body: 'rsx.emptyBody.dc' },
  },
  'scholar-coursework': {
    label: 'rsx.list.coursework',
    columns: [
      { key: 'course', header: 'rsx.col.course', kind: 'strong' },
      { key: 'scholarName', header: 'rsx.col.scholar', sortKey: false },
      { key: 'credits', header: 'rsx.col.credits', kind: 'number', hideBelow: 'sm' },
      { key: 'grade', header: 'rsx.col.grade', hideBelow: 'sm' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['passed', 'exempted'], ['enrolled'], ['failed']) },
      { key: 'completedOn', header: 'rsx.col.completedOn', kind: 'date', hideBelow: 'md' },
    ],
    empty: { icon: <BookOpen />, title: 'rsx.empty.coursework', body: 'rsx.emptyBody.coursework' },
  },
  'research-equipment': {
    label: 'rsx.list.equipment',
    columns: [
      { key: 'name', header: 'rsx.col.instrument', kind: 'strong' },
      { key: 'code', header: 'rsx.col.code' },
      { key: 'location', header: 'rsx.col.location', hideBelow: 'md' },
      { key: 'internalRate', header: 'rsx.col.internalRate', kind: 'money', hideBelow: 'lg' },
      { key: 'externalRate', header: 'rsx.col.externalRate', kind: 'money', hideBelow: 'lg' },
      { key: 'hoursThisYear', header: 'rsx.col.hoursYear', kind: 'number', sortKey: false, hideBelow: 'sm' },
      { key: 'revenueThisYear', header: 'rsx.col.revenueYear', kind: 'money', sortKey: false, hideBelow: 'md' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['working'], ['under_repair'], ['retired']) },
      { key: 'custodianUserId', from: 'custodianUserIdName', header: 'rsx.col.custodian', defaultHidden: true },
    ],
    empty: { icon: <Microscope />, title: 'rsx.empty.equipment', body: 'rsx.emptyBody.equipment' },
  },
  'research-equipment-usage': {
    label: 'rsx.list.usage',
    columns: [
      { key: 'equipmentName', header: 'rsx.col.instrument', kind: 'strong', sortKey: false },
      { key: 'startsAt', header: 'rsx.col.from', kind: 'datetime' },
      { key: 'hours', header: 'rsx.col.hours', kind: 'number', sortKey: false, hideBelow: 'sm' },
      { key: 'userKind', header: 'rsx.col.userKind', kind: 'choice', hideBelow: 'md' },
      { key: 'externalName', header: 'rsx.col.externalUser', hideBelow: 'lg' },
      { key: 'amount', header: 'rsx.col.amount', kind: 'money' },
      { key: 'status', header: 'rsx.col.status', kind: 'choice', tone: status(['billed', 'completed'], ['booked'], ['cancelled']) },
      { key: 'userId', from: 'userIdName', header: 'rsx.col.internalUser', defaultHidden: true },
      { key: 'invoiceRef', header: 'rsx.col.invoice', defaultHidden: true },
    ],
    empty: { icon: <Microscope />, title: 'rsx.empty.usage', body: 'rsx.emptyBody.usage' },
  },
  'research-ethics': {
    label: 'rsx.list.ethics',
    columns: [
      { key: 'title', header: 'rsx.col.study', kind: 'wrap' },
      { key: 'committee', header: 'rsx.col.committee', kind: 'choice' },
      { key: 'protocolNo', header: 'rsx.col.protocol', hideBelow: 'sm' },
      { key: 'approvedOn', header: 'rsx.col.approvedOn', kind: 'date', hideBelow: 'md' },
      { key: 'expiresOn', header: 'rsx.col.validUntil', kind: 'date' },
      { key: 'validity', header: 'rsx.col.validity', kind: 'choice', sortKey: false, tone: status(['valid'], ['expiring', 'pending'], ['expired', 'rejected']) },
      { key: 'piUserId', from: 'piUserIdName', header: 'rsx.col.pi', defaultHidden: true },
    ],
    empty: { icon: <ShieldCheck />, title: 'rsx.empty.ethics', body: 'rsx.emptyBody.ethics' },
  },
};

/** One research register as a kit list. */
export function ResearchList({ entity, meta, page, state, extraParams, toolbar }: { entity: string; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; extraParams: Record<string, string>; toolbar?: ReactNode }) {
  const spec = RESEARCH_SPECS[entity];
  return <KitList meta={meta} page={page} state={state} label={spec.label} columns={spec.columns} empty={spec.empty} paramActions={spec.paramActions} extraParams={extraParams} toolbar={toolbar} testId={`list-${entity}`} />;
}
