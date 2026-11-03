'use client';

import { Ban, Check, FileDown, FileSpreadsheet, ListChecks, Megaphone, ScanLine, Smartphone, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { decideQrScans, prepareDetentionList, publishDetentionList, releaseDeviceBinding, withdrawDetentionList } from '@/app/(dashboard)/attendance/desk-actions';
import { ReasonDialog } from '@/components/admissions/ReasonDialog';
import { Button } from '@/components/shadcn/button';
import { DataTable, EmptyState, StatGrid, StatTile, StatusPill, useToast, type Column, type RowAction } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AccreditationFigures, ComplianceRow, DetentionList, QrScanRow, SubjectSummaryRow, TrendWeek } from '@/lib/attendance-desk';
import { pctText } from './kit';

const reasonKey = (r: string) => `atdp.reason.${r}` as MessageKey;

/**
 * QR self-marks held for review (another phone, outside the campus, a poor or mocked location, late): accept marks the
 * student present, reject leaves the mark alone; one at a time or for a selection. Decided and refused scans are kept.
 */
export function QrReviewTable({ rows, status }: { rows: QrScanRow[]; status: string }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [release, setRelease] = useState<QrScanRow | null>(null);
  const decide = (ids: string[], decision: 'accepted' | 'rejected') =>
    start(async () => {
      const res = await decideQrScans(ids, decision);
      if (!res.ok) return toast.error(res.error);
      if (res.data.failed) toast.error(t('atdp.qr.someFailed', { n: fmt.number(res.data.failed), error: res.data.report.find((r) => !r.ok)?.error ?? '' }));
      else toast.success(t(decision === 'accepted' ? 'atdp.qr.acceptedN' : 'atdp.qr.rejectedN', { n: fmt.number(res.data.done) }));
      router.refresh();
    });
  const reasons = (r: QrScanRow) => r.reasons.map((x) => t(reasonKey(x))).join(', ');
  const columns: Column<QrScanRow>[] = [
    { id: 'when', header: t('atdp.qr.scanned'), cell: (r) => `${fmt.date(r.date, 'short')} ${fmt.time(r.scannedAt)}`, sort: (r) => r.scannedAt },
    { id: 'student', header: t('atd.col.student'), cell: (r) => `${r.rollNo} ${r.student}`, sort: (r) => r.student, rowHeader: true },
    { id: 'class', header: t('atd.col.class'), cell: (r) => r.section, sort: (r) => r.section, hideBelow: 'md' },
    { id: 'period', header: t('atdp.qr.period'), cell: (r) => `${r.startsAt} ${r.subject}`, sort: (r) => `${r.date} ${r.startsAt}`, hideBelow: 'sm' },
    {
      id: 'reasons',
      header: t('atdp.qr.why'),
      cell: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.reasons.map((x) => (
            <StatusPill key={x} tone={x === 'device_used_for_another' || x === 'device_bound_to_another' || x === 'period_over' ? 'danger' : 'warning'}>
              {t(reasonKey(x))}
            </StatusPill>
          ))}
        </span>
      ),
      csv: reasons,
    },
    { id: 'distance', header: t('atdp.qr.distance'), cell: (r) => (r.distanceM === null ? '—' : t('atdp.qr.metres', { n: fmt.number(r.distanceM), acc: fmt.number(r.accuracyM ?? 0) })), sort: (r) => r.distanceM ?? -1, align: 'right', hideBelow: 'lg' },
    {
      id: 'decision',
      header: t('atd.col.status'),
      cell: (r) =>
        r.decision ? (
          <StatusPill tone={r.decision === 'accepted' ? 'success' : 'neutral'} title={r.decidedBy ?? undefined}>
            {t(`atdp.qr.decision.${r.decision}`)}
          </StatusPill>
        ) : (
          <StatusPill tone={r.outcome === 'refused' ? 'danger' : 'warning'}>{t(`atdp.qr.outcome.${r.outcome}`)}</StatusPill>
        ),
      csv: (r) => r.decision ?? r.outcome,
    },
  ];
  const open = (r: QrScanRow) => r.outcome === 'flagged' && !r.decision;
  const rowActions = (r: QrScanRow): RowAction<QrScanRow>[] => [
    { id: 'accept', label: t('atdp.qr.accept'), icon: <Check />, disabled: !open(r), onSelect: () => decide([r.id], 'accepted') },
    { id: 'reject', label: t('atdp.qr.reject'), icon: <X />, disabled: !open(r), onSelect: () => decide([r.id], 'rejected') },
    { id: 'release', label: t('atdp.qr.release'), icon: <Smartphone />, separator: true, onSelect: () => setRelease(r) },
  ];
  return (
    <>
      <DataTable<QrScanRow>
        testId="qr-review-table"
        label={t('atdp.qr.title')}
        columns={columns}
        rows={rows}
        rowId={(r) => r.id}
        exportName="qr-scans"
        selectable={status === 'flagged'}
        rowActions={rowActions}
        bulkActions={
          status === 'flagged'
            ? [
                { id: 'accept', label: t('atdp.qr.accept'), icon: <Check />, onClick: (sel) => decide(sel.filter(open).map((r) => r.id), 'accepted') },
                { id: 'reject', label: t('atdp.qr.reject'), icon: <X />, tone: 'danger', onClick: (sel) => decide(sel.filter(open).map((r) => r.id), 'rejected') },
              ]
            : undefined
        }
        empty={
          <EmptyState icon={<ScanLine />} title={t(status === 'flagged' ? 'atdp.qr.none' : 'atdp.qr.noneHere')}>
            {t('atdp.qr.noneBody')}
          </EmptyState>
        }
      />
      {release && (
        <ReasonDialog
          title={t('atdp.qr.releaseTitle', { name: release.student })}
          help={t('atdp.qr.releaseHelp')}
          label={t('atdp.reason')}
          required
          confirm={t('atdp.qr.release')}
          onSubmit={(reason) => releaseDeviceBinding(release.studentId, reason)}
          onClose={(done) => {
            setRelease(null);
            if (done) toast.success(t('atdp.qr.released'));
          }}
        />
      )}
    </>
  );
}

/** Detention lists: prepare a frozen copy of the shortage list, publish it (hall tickets read it), withdraw it, download it. */
export function DetentionLists({ lists, programId, term, canPublish }: { lists: DetentionList[]; programId?: string; term?: string; canPublish: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [withdraw, setWithdraw] = useState<DetentionList | null>(null);
  const prepare = () =>
    start(async () => {
      const res = await prepareDetentionList({ ...(programId ? { programId } : {}), ...(term ? { term: Number(term) } : {}) });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('atdp.det.prepared'));
      router.refresh();
    });
  const publish = (l: DetentionList) =>
    start(async () => {
      const res = await publishDetentionList(l.id);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('atdp.det.publishedN', { n: fmt.number(res.data.notified) }));
      for (const s of res.data.skipped) toast.error(s);
      router.refresh();
    });
  const tone = (s: DetentionList['status']) => (s === 'published' ? 'success' : s === 'draft' ? 'warning' : 'neutral');
  const columns: Column<DetentionList>[] = [
    { id: 'title', header: t('atdp.det.list'), cell: (l) => l.title, sort: (l) => l.title, rowHeader: true },
    { id: 'asOn', header: t('atdp.det.asOn'), cell: (l) => fmt.date(l.asOn, 'short'), sort: (l) => l.asOn, hideBelow: 'sm' },
    { id: 'eligible', header: t('atd.elig.eligible'), cell: (l) => fmt.number(l.eligible), sort: (l) => l.eligible, align: 'right', hideBelow: 'md' },
    { id: 'condonable', header: t('atd.elig.condonable'), cell: (l) => fmt.number(l.condonable), sort: (l) => l.condonable, align: 'right' },
    { id: 'detained', header: t('atd.elig.detained'), cell: (l) => fmt.number(l.detained), sort: (l) => l.detained, align: 'right' },
    { id: 'status', header: t('atd.col.status'), cell: (l) => <StatusPill tone={tone(l.status)} title={l.withdrawReason ?? undefined}>{t(`atdp.det.status.${l.status}`)}</StatusPill>, sort: (l) => l.status, csv: (l) => l.status },
    {
      id: 'files',
      header: t('atdp.det.files'),
      csv: false,
      align: 'right',
      cell: (l) => (
        <span className="inline-flex gap-1">
          <Button asChild variant="ghost" size="sm" className="h-8">
            <a href={`/api/download?kind=detention-pdf&id=${l.id}`} aria-label={t('atdp.det.pdf', { title: l.title })}>
              <FileDown />
              PDF
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-8">
            <a href={`/api/download?kind=detention-xlsx&id=${l.id}`} aria-label={t('atdp.det.xlsx', { title: l.title })}>
              <FileSpreadsheet />
              Excel
            </a>
          </Button>
        </span>
      ),
    },
  ];
  const rowActions = (l: DetentionList): RowAction<DetentionList>[] =>
    canPublish
      ? [
          { id: 'publish', label: t('atdp.det.publish'), icon: <Megaphone />, disabled: l.status !== 'draft' || pending, onSelect: () => publish(l) },
          { id: 'withdraw', label: t('atdp.det.withdraw'), icon: <Undo2 />, tone: 'danger', disabled: l.status === 'withdrawn', onSelect: () => setWithdraw(l) },
        ]
      : [];
  return (
    <section className="mt-6 grid gap-3" aria-labelledby="det-lists">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="det-lists" className="m-0 text-base font-semibold">
            {t('atdp.det.title')}
          </h2>
          <p className="m-0 text-sm text-muted-foreground">{t('atdp.det.help')}</p>
        </div>
        <Button className="h-9" onClick={prepare} disabled={pending} data-testid="prepare-detention">
          <ListChecks />
          {t('atdp.det.prepare')}
        </Button>
      </div>
      <DataTable<DetentionList>
        testId="detention-lists"
        label={t('atdp.det.title')}
        columns={columns}
        rows={lists}
        rowId={(l) => l.id}
        rowActions={canPublish ? rowActions : undefined}
        exportName="detention-lists"
        empty={
          <EmptyState icon={<Ban />} title={t('atdp.det.none')}>
            {t('atdp.det.noneBody')}
          </EmptyState>
        }
      />
      {withdraw && (
        <ReasonDialog
          title={t('atdp.det.withdrawTitle')}
          help={t('atdp.det.withdrawHelp')}
          label={t('atdp.reason')}
          required
          confirm={t('atdp.det.withdraw')}
          onSubmit={(reason) => withdrawDetentionList(withdraw.id, reason)}
          onClose={(done) => {
            setWithdraw(null);
            if (done) toast.success(t('atdp.det.withdrawn'));
          }}
        />
      )}
    </section>
  );
}

/** Faculty-wise marking compliance: periods that met, marked the same day, later, or not at all. */
export function ComplianceTable({ rows, total }: { rows: ComplianceRow[]; total: { scheduled: number; sameDay: number; later: number; unmarked: number; markedPct: number | null; onTimePct: number | null } }) {
  const { t, fmt } = useI18n();
  const columns: Column<ComplianceRow>[] = [
    { id: 'teacher', header: t('atdp.rep.teacher'), cell: (r) => r.teacher, sort: (r) => r.teacher, rowHeader: true },
    { id: 'department', header: t('atdp.rep.department'), cell: (r) => r.department || '—', sort: (r) => r.department, hideBelow: 'md' },
    { id: 'scheduled', header: t('atdp.rep.periods'), cell: (r) => fmt.number(r.scheduled), sort: (r) => r.scheduled, align: 'right' },
    { id: 'sameDay', header: t('atdp.rep.sameDay'), cell: (r) => fmt.number(r.sameDay), sort: (r) => r.sameDay, align: 'right', hideBelow: 'sm' },
    { id: 'later', header: t('atdp.rep.later'), cell: (r) => fmt.number(r.later), sort: (r) => r.later, align: 'right', hideBelow: 'sm' },
    { id: 'unmarked', header: t('atdp.rep.unmarked'), cell: (r) => (r.unmarked ? <StatusPill tone="danger">{fmt.number(r.unmarked)}</StatusPill> : '0'), sort: (r) => r.unmarked, csv: (r) => r.unmarked, align: 'right' },
    { id: 'marked', header: t('atdp.rep.markedPct'), cell: (r) => pctText(r.markedPct, fmt), sort: (r) => r.markedPct ?? -1, align: 'right' },
    { id: 'onTime', header: t('atdp.rep.onTimePct'), cell: (r) => pctText(r.onTimePct, fmt), sort: (r) => r.onTimePct ?? -1, align: 'right', hideBelow: 'md' },
  ];
  return (
    <>
      <StatGrid>
        <StatTile label={t('atdp.rep.periods')} value={fmt.number(total.scheduled)} />
        <StatTile label={t('atdp.rep.markedPct')} value={pctText(total.markedPct, fmt)} />
        <StatTile label={t('atdp.rep.onTimePct')} value={pctText(total.onTimePct, fmt)} />
        <StatTile label={t('atdp.rep.unmarked')} value={fmt.number(total.unmarked)} />
      </StatGrid>
      <div className="mt-4">
        <DataTable<ComplianceRow> testId="compliance-table" label={t('atdp.rep.compliance')} columns={columns} rows={rows} rowId={(r) => r.teacherId} exportName="marking-compliance" empty={<EmptyState icon={<ListChecks />} title={t('atdp.rep.noneCompliance')} />} />
      </div>
    </>
  );
}

/** A class's subjects: periods held, the class average and students short. */
export function SubjectSummary({ rows, thresholdPct, sectionId }: { rows: SubjectSummaryRow[]; thresholdPct: number; sectionId: string }) {
  const { t, fmt } = useI18n();
  const columns: Column<SubjectSummaryRow>[] = [
    { id: 'code', header: t('atdp.rep.code'), cell: (r) => r.code, sort: (r) => r.code },
    { id: 'subject', header: t('atd.col.subject'), cell: (r) => <Link href={`/attendance/register?sectionId=${sectionId}&subjectId=${r.subjectId}`}>{r.subject}</Link>, csv: (r) => r.subject, sort: (r) => r.subject, rowHeader: true },
    { id: 'teachers', header: t('atdp.rep.teacher'), cell: (r) => r.teachers.join(', ') || '—', csv: (r) => r.teachers.join(', '), hideBelow: 'md' },
    { id: 'held', header: t('atdp.rep.held'), cell: (r) => fmt.number(r.held), sort: (r) => r.held, align: 'right' },
    { id: 'avg', header: t('atdp.rep.average'), cell: (r) => pctText(r.averagePct, fmt), sort: (r) => r.averagePct ?? -1, align: 'right' },
    { id: 'short', header: t('atdp.rep.short', { n: fmt.number(thresholdPct) }), cell: (r) => (r.short ? <StatusPill tone="danger">{fmt.number(r.short)}</StatusPill> : '0'), csv: (r) => r.short, sort: (r) => r.short, align: 'right' },
    { id: 'warning', header: t('atdp.rep.warning'), cell: (r) => fmt.number(r.warning), sort: (r) => r.warning, align: 'right', hideBelow: 'sm' },
  ];
  return <DataTable<SubjectSummaryRow> testId="subject-summary" label={t('atdp.rep.subjects')} columns={columns} rows={rows} rowId={(r) => r.subjectId} exportName="subject-attendance" empty={<EmptyState icon={<ListChecks />} title={t('atdp.rep.noneSubjects')} />} />;
}

/** Students short of attendance at the end of each week, as bars and a table. */
export function TrendView({ weeks }: { weeks: TrendWeek[] }) {
  const { t, fmt } = useI18n();
  const max = Math.max(1, ...weeks.map((w) => w.short + w.warning));
  const columns: Column<TrendWeek>[] = [
    { id: 'week', header: t('atdp.rep.weekEnding'), cell: (w) => fmt.date(w.weekEnding, 'short'), sort: (w) => w.weekEnding, rowHeader: true },
    { id: 'students', header: t('atdp.rep.students'), cell: (w) => fmt.number(w.students), align: 'right', hideBelow: 'sm' },
    { id: 'short', header: t('atdp.rep.shortAll'), cell: (w) => fmt.number(w.short), align: 'right' },
    { id: 'shortPct', header: '%', cell: (w) => pctText(w.shortPct, fmt), align: 'right' },
    { id: 'detained', header: t('atd.elig.detained'), cell: (w) => fmt.number(w.detained), align: 'right', hideBelow: 'sm' },
    { id: 'warning', header: t('atdp.rep.warning'), cell: (w) => fmt.number(w.warning), align: 'right', hideBelow: 'md' },
  ];
  return (
    <div className="grid gap-4">
      <figure className="m-0 rounded-lg border bg-card p-4" aria-label={t('atdp.rep.trend')}>
        <div className="flex h-40 items-end gap-2" role="img" aria-label={weeks.map((w) => `${w.weekEnding}: ${w.short}`).join(', ')}>
          {weeks.map((w) => (
            <div key={w.weekEnding} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-xs tabular-nums text-muted-foreground">{fmt.number(w.short)}</span>
              <div className="flex w-full max-w-10 flex-col justify-end overflow-hidden rounded-t-sm" style={{ height: `${((w.short + w.warning) / max) * 120}px` }}>
                <div className="bg-amber-300/70" style={{ height: `${(w.warning / Math.max(1, w.short + w.warning)) * 100}%` }} />
                <div className="flex-1 bg-red-500/70" />
              </div>
              <span className="truncate text-[11px] text-muted-foreground">{fmt.date(w.weekEnding, 'short').replace(/\s?\d{4}$/, '')}</span>
            </div>
          ))}
        </div>
        <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm bg-red-500/70" /> {t('atdp.rep.shortAll')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-sm bg-amber-300/70" /> {t('atdp.rep.warning')}
          </span>
        </figcaption>
      </figure>
      <DataTable<TrendWeek> testId="trend-table" label={t('atdp.rep.trend')} columns={columns} rows={weeks} rowId={(w) => w.weekEnding} exportName="defaulter-trend" />
    </div>
  );
}

/** The attendance figures NAAC, AISHE and UDISE+ ask for, and which items they fill. */
export function AccreditationView({ data }: { data: AccreditationFigures }) {
  const { t, fmt } = useI18n();
  const prog: Column<AccreditationFigures['programmes'][number]>[] = [
    { id: 'program', header: t('atd.programme'), cell: (r) => r.program, sort: (r) => r.program, rowHeader: true },
    { id: 'students', header: t('atdp.rep.students'), cell: (r) => fmt.number(r.students), sort: (r) => r.students, align: 'right' },
    { id: 'held', header: t('atdp.rep.marks'), cell: (r) => fmt.number(r.held), sort: (r) => r.held, align: 'right', hideBelow: 'sm' },
    { id: 'avg', header: t('atdp.rep.average'), cell: (r) => pctText(r.averagePct, fmt), sort: (r) => r.averagePct ?? -1, align: 'right' },
  ];
  return (
    <div className="grid gap-6">
      <StatGrid>
        <StatTile label={t('atdp.acc.days')} value={fmt.number(data.instructionalDays)} caption={t('atdp.acc.periods', { n: fmt.number(data.periodsHeld) })} />
        <StatTile label={t('atdp.acc.shortage')} value={fmt.number(data.shortageStudents)} caption={t('atdp.acc.texted', { n: fmt.number(data.alertsTexted) })} />
        <StatTile label={t('atd.elig.detained')} value={fmt.number(data.detained)} caption={t('atdp.acc.condonable', { n: fmt.number(data.condonable) })} />
        <StatTile label={t('atdp.acc.condonations')} value={fmt.number(data.condonationsApproved)} caption={t('atdp.acc.points', { n: fmt.number(data.condonedPoints) })} />
        <StatTile label={t('atdp.acc.staff')} value={pctText(data.staff.presentPct, fmt)} caption={t('atdp.acc.staffDays', { n: fmt.number(data.staff.days) })} />
      </StatGrid>
      <DataTable testId="acc-programmes" label={t('atdp.acc.programmes')} columns={prog} rows={data.programmes} rowId={(r) => r.program} exportName={`attendance-by-programme-${data.year}`} />
      <section aria-labelledby="acc-feeds" className="grid gap-2">
        <h2 id="acc-feeds" className="m-0 text-base font-semibold">
          {t('atdp.acc.feeds')}
        </h2>
        <ul className="m-0 grid list-none gap-2 p-0">
          {data.feeds.map((f) => (
            <li key={`${f.framework}-${f.item}`} className="flex flex-wrap items-baseline gap-2 rounded-md border bg-card px-3 py-2 text-sm">
              <StatusPill tone="info">{f.framework}</StatusPill>
              <span className="font-medium">{f.item}</span>
              <span className="text-muted-foreground">{t(`atdp.acc.feed.${f.source}` as MessageKey)}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm text-muted-foreground">
          <Link href="/accreditation">{t('atdp.acc.open')}</Link>
        </p>
      </section>
    </div>
  );
}
