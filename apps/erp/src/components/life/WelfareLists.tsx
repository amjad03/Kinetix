'use client';

import { Accessibility, FileSignature, Gavel, HeartHandshake, Route, ScrollText, UserRoundCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { requestUndertakings, undertakingSummary } from '@/app/(dashboard)/grievances/depth-actions';
import { useRead } from '@/components/campus-life/CampusLifeDesk';
import { Grid, InfoDialog, Pill, useToast } from '@/components/ops/kit';
import { RecordsTable } from '@/components/records/RecordsTable';
import { Button } from '@/components/shadcn/button';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, SectionTitle, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { GrievanceReport, UndertakingClass } from '@/lib/life';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { useKitColumns, emptyFor } from './kit';

type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; tab: string; sections: { id: string; name: string }[]; year: string };

export function GrievanceRegister({ meta, page, state, tab }: Props) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'ticketNo', header: 'wd.col.ticket', sortKey: 'ticket', rowHeader: true },
    { key: 'createdAt', header: 'wd.col.raised', kind: 'date', sortKey: 'raised' },
    { key: 'category', header: 'wd.col.category', kind: 'choice' },
    { key: 'committee', header: 'wd.col.committee', kind: 'choice', hideBelow: 'md' },
    { key: 'subject', header: 'wd.col.subject', kind: 'wrap', hideBelow: 'sm' },
    { key: 'status', header: 'wd.col.status', kind: 'choice', tones: { open: 'warning', escalated: 'danger', reopened: 'warning', resolved: 'success', closed: 'neutral' } },
    { key: 'assigneeName', header: 'wd.col.handledBy', hideBelow: 'md' },
    { key: 'resolutionHours', header: 'wd.col.hours', kind: 'number', sortKey: 'resolution', hideBelow: 'sm' },
    { key: 'appealStatus', header: 'wd.col.appeal', defaultHidden: true },
    { key: 'rating', header: 'wd.col.rating', kind: 'number', defaultHidden: true },
  ]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('wd.tab.register')}
      columns={columns}
      extraParams={{ tab }}
      testId="wd-register"
      empty={emptyFor(meta, <EmptyState icon={<ScrollText />} title={t('wd.empty.registerTitle')}>{t('wd.empty.register')}</EmptyState>)}
    />
  );
}

export function RoutesList({ meta, page, state, tab }: Props) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'category', header: 'wd.col.category', kind: 'choice', sortKey: 'category', rowHeader: true },
    { key: 'assigneeName', header: 'wd.col.handledBy', sortKey: 'assignee' },
    { key: 'backupName', header: 'wd.col.backup' },
    { key: 'slaHours', header: 'wd.col.deadline', kind: 'number', hideBelow: 'sm' },
    { key: 'active', header: 'wd.col.active', kind: 'bool' },
  ]);
  return (
    <>
      <p className="mb-3 mt-0 text-[13px] text-muted-foreground">{t('wd.routes.help')}</p>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('wd.tab.routes')}
        columns={columns}
        extraParams={{ tab }}
        testId="wd-routes"
        empty={emptyFor(meta, <EmptyState icon={<Route />} title={t('wd.empty.routesTitle')}>{t('wd.empty.routes')}</EmptyState>)}
      />
    </>
  );
}

export function UndertakingsList({ meta, page, state, tab, sections, year }: Props) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [open, setOpen] = useState<'request' | 'summary' | null>(null);
  const columns = useKitColumns(meta, [
    { key: 'studentName', header: 'wd.col.student', sortKey: 'student', rowHeader: true },
    { key: 'rollNo', header: 'wd.col.roll', sortKey: 'roll', hideBelow: 'sm' },
    { key: 'className', header: 'wd.col.class', sortKey: 'className' },
    { key: 'yearLabel', header: 'wd.col.year', hideBelow: 'md' },
    { key: 'studentRef', header: 'wd.col.studentRef', hideBelow: 'md' },
    { key: 'parentRef', header: 'wd.col.parentRef', hideBelow: 'md' },
    { key: 'status', header: 'wd.col.status', kind: 'choice', sortKey: 'status', tones: { pending: 'warning', received: 'info', verified: 'success' } },
    { key: 'submittedOn', header: 'wd.col.submitted', kind: 'date', defaultHidden: true },
  ]);
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('wd.tab.undertakings')}
        columns={columns}
        extraParams={{ tab }}
        testId="wd-undertakings"
        toolbar={
          <>
            <Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setOpen('summary')}>{t('wd.und.summary')}</Button>
            <Button size="sm" variant="outline" className="h-9 rounded-md" onClick={() => setOpen('request')}>{t('wd.und.request')}</Button>
          </>
        }
        empty={emptyFor(meta, <EmptyState icon={<FileSignature />} title={t('wd.empty.undTitle')}>{t('wd.empty.und')}</EmptyState>, <Button onClick={() => setOpen('request')}>{t('wd.und.request')}</Button>)}
      />
      {open === 'request' && <RequestDialog sections={sections} year={year} onClose={(m) => { setOpen(null); if (m) toast(m); }} />}
      {open === 'summary' && <SummaryDialog year={year} onClose={() => setOpen(null)} />}
      {toastNode}
    </>
  );
}

function RequestDialog({ sections, year, onClose }: { sections: { id: string; name: string }[]; year: string; onClose: (m?: string) => void }) {
  const { t } = useI18n();
  const [y, setY] = useState(year);
  const [section, setSection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <InfoDialog title={t('wd.und.request')} onClose={() => onClose()}>
      <p className="mt-0 text-sm text-muted-foreground">{t('wd.und.requestHelp')}</p>
      <div className="flex flex-col gap-3">
        <TextInput label={t('wd.col.year')} value={y} onChange={(e) => setY(e.target.value)} />
        <SelectInput label={t('wd.col.class')} value={section} onChange={(e) => setSection(String(e.target.value))} options={sections.map((x) => ({ value: x.id, label: x.name }))} empty={t('wd.und.allClasses')} />
      </div>
      {error && <p className="text-sm text-red-ink">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onClose()}>{t('common.cancel')}</Button>
        <Button
          disabled={busy}
          data-testid="wd-request-send"
          onClick={() =>
            start(async () => {
              if (!/^\d{4}-\d{2}$/.test(y)) return setError(t('ops.err.field', { field: t('wd.col.year') }));
              const r = await requestUndertakings(y, section || undefined);
              if (!r.ok) return setError(r.error);
              onClose(t('wd.und.requested', { n: r.data.requested }));
            })
          }
        >
          {t('wd.und.send')}
        </Button>
      </div>
    </InfoDialog>
  );
}

function SummaryDialog({ year, onClose }: { year: string; onClose: () => void }) {
  const { t } = useI18n();
  const data = useRead<{ year: string; classes: UndertakingClass[] }>(() => undertakingSummary(year));
  return (
    <InfoDialog title={t('wd.und.summaryFor', { year })} onClose={onClose}>
      <Grid
        testId="wd-und-summary"
        exportName="undertakings"
        empty={t('wd.und.none')}
        rows={data.data?.classes ?? []}
        cols={[
          { label: t('wd.col.class'), cell: (r) => r.className },
          { label: t('wd.col.students'), cell: (r) => r.students, num: true },
          { label: t('wd.und.missing'), cell: (r) => (r.missing + r.pending ? <Pill warn label={String(r.missing + r.pending)} /> : 0), sort: (r) => r.missing + r.pending },
          { label: t('wd.und.received'), cell: (r) => r.received, num: true },
          { label: t('wd.und.verified'), cell: (r) => r.verified, num: true },
        ]}
      />
    </InfoDialog>
  );
}

export function AccommodationsList({ meta, page, state, tab }: Props) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'studentName', header: 'wd.col.student', sortKey: 'student', rowHeader: true },
    { key: 'className', header: 'wd.col.class', sortKey: 'className', hideBelow: 'sm' },
    { key: 'disability', header: 'wd.col.disability' },
    { key: 'scribe', header: 'wd.col.scribe', kind: 'bool' },
    { key: 'extraMinutesPerHour', header: 'wd.col.extraTime', kind: 'number' },
    { key: 'separateRoom', header: 'wd.col.room', kind: 'bool', hideBelow: 'md' },
    { key: 'validUntil', header: 'wd.col.validUntil', kind: 'date', sortKey: 'valid', hideBelow: 'sm' },
    { key: 'status', header: 'wd.col.status', kind: 'choice', tones: { active: 'success', revoked: 'danger' } },
    { key: 'certificateNo', header: 'wd.col.certificate', defaultHidden: true },
  ]);
  return (
    <>
      <p className="mb-3 mt-0 text-[13px] text-muted-foreground">{t('wd.acc.help')}</p>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={t('wd.tab.accommodations')}
        columns={columns}
        extraParams={{ tab }}
        testId="wd-accommodations"
        empty={emptyFor(meta, <EmptyState icon={<Accessibility />} title={t('wd.empty.accTitle')}>{t('wd.empty.acc')}</EmptyState>)}
      />
    </>
  );
}

export function WelfareRequestsList({ meta, page, state, tab }: Props) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'studentName', header: 'wd.col.student', sortKey: 'student', rowHeader: true },
    { key: 'kind', header: 'wd.col.kind', kind: 'choice' },
    { key: 'title', header: 'wd.col.request', kind: 'wrap', hideBelow: 'sm' },
    { key: 'requestedRupees', header: 'wd.col.requested', kind: 'rupees', sortKey: 'amount' },
    { key: 'approvedRupees', header: 'wd.col.approved', kind: 'rupees', hideBelow: 'sm' },
    { key: 'status', header: 'wd.col.status', kind: 'choice', sortKey: 'status', tones: { submitted: 'warning', under_review: 'info', approved: 'success', rejected: 'danger', disbursed: 'success', withdrawn: 'neutral' } },
    { key: 'createdAt', header: 'wd.col.raised', kind: 'date', sortKey: 'created', hideBelow: 'md' },
  ]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('wd.tab.welfare')}
      columns={columns}
      extraParams={{ tab }}
      testId="wd-welfare"
      empty={emptyFor(meta, <EmptyState icon={<HeartHandshake />} title={t('wd.empty.welfareTitle')}>{t('wd.empty.welfare')}</EmptyState>)}
    />
  );
}

export function DisciplineRegister({ meta, page, state, tab }: Props) {
  const { t } = useI18n();
  const columns = useKitColumns(meta, [
    { key: 'studentName', header: 'wd.col.student', sortKey: 'student', rowHeader: true },
    { key: 'className', header: 'wd.col.class', hideBelow: 'sm' },
    { key: 'incidentOn', header: 'wd.col.date', kind: 'date', sortKey: 'date' },
    { key: 'kind', header: 'wd.col.incident' },
    { key: 'severity', header: 'wd.col.severity', kind: 'choice', sortKey: 'severity', tones: { minor: 'neutral', major: 'warning', severe: 'danger' } },
    { key: 'status', header: 'wd.col.status', kind: 'choice' },
    { key: 'reportedByName', header: 'wd.col.reportedBy', hideBelow: 'md' },
  ]);
  return (
    <RecordsTable
      meta={meta}
      page={page}
      state={state}
      label={t('wd.tab.discipline')}
      columns={columns}
      extraParams={{ tab }}
      testId="wd-discipline"
      empty={emptyFor(meta, <EmptyState icon={<Gavel />} title={t('wd.empty.disciplineTitle')}>{t('wd.empty.discipline')}</EmptyState>)}
    />
  );
}

/** NAAC grievance figures for a year, by category. Committee matters are counted, never named. */
export function GrievanceReportView({ report }: { report: GrievanceReport }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6" data-testid="wd-report">
      <StatGrid min={140}>
        <StatTile label={t('wd.rep.received')} value={report.total} caption={report.year} />
        <StatTile label={t('wd.rep.resolved')} value={report.resolved} />
        <StatTile label={t('wd.rep.pending')} value={report.pending} tone={report.pending ? 'warning' : 'default'} />
        <StatTile label={t('wd.rep.appeals')} value={report.byCategory.reduce((s, r) => s + r.appeals, 0)} />
      </StatGrid>
      <div>
        <SectionTitle>{t('wd.rep.byCategory')}</SectionTitle>
        <Grid
          testId="wd-report-table"
          exportName="grievances-naac"
          emptyIcon={<UserRoundCheck />}
          empty={t('wd.rep.none')}
          rows={report.byCategory}
          cols={[
            { label: t('wd.col.category'), cell: (r) => t(`gv.cat.${r.category}` as MessageKey), sort: (r) => r.category },
            { label: t('wd.col.committee'), cell: (r) => (r.committee ? t(`wd.committee.${r.committee}` as MessageKey) : '-') },
            { label: t('wd.rep.received'), cell: (r) => r.received, num: true },
            { label: t('wd.rep.resolved'), cell: (r) => r.resolved, num: true },
            { label: t('wd.rep.avgDays'), cell: (r) => (r.avgDays === null ? '-' : r.avgDays), num: true, sort: (r) => r.avgDays ?? -1 },
            { label: t('wd.rep.appeals'), cell: (r) => r.appeals, num: true },
            { label: t('wd.rep.overturned'), cell: (r) => r.overturned, num: true },
          ]}
        />
      </div>
    </div>
  );
}
