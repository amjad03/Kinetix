'use client';

import { BookOpenCheck, CheckCheck, NotebookPen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { reviewEntries } from '@/app/(dashboard)/teaching-diary/actions';
import { Grid, type Col } from '@/components/ops/kit';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { Card, Dialog, EmptyState, FormField, StatGrid, StatTile, StatusPill, TextInput, useToast, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

export interface CompletionRow {
  sectionId: string;
  section: string;
  subjectId: string;
  code: string;
  subject: string;
  department: string | null;
  teachers: string;
  topics: number;
  covered: number;
  coveredPct: number | null;
  scheduled: number;
  scheduledToDate: number;
  logged: number;
  behindPlan: number;
  unreviewed: number;
  elapsedPct: number | null;
  pace: 'ahead' | 'on_track' | 'behind' | 'not_started';
}

export interface Register {
  section: { id: string; name: string };
  subject: { id: string; code: string; name: string; credits: number | null; ltp: string };
  term: { name: string; startsOn: string; endsOn: string };
  topics: { covered: number; total: number; percent: number | null };
  hours: { perWeek: number; allotted: number; scheduled: number; scheduledToDate: number; held: number; heldHours: number; logged: number };
  lessonPlans: { n: number; approved: number };
  againstPlan: Record<'as_planned' | 'ahead' | 'behind' | 'unplanned', number>;
  elapsedPct: number | null;
  pace: CompletionRow['pace'];
  pending: { date: string; slotId: string | null; batch: string | null }[];
  entries: { id: string; date: string; startsAt: string; delivery: string; summary: string; againstPlan: string; deviationReason: string; topicIds: string[] }[];
}

export const PACE_TONE: Record<CompletionRow['pace'], Tone> = { ahead: 'info', on_track: 'success', behind: 'danger', not_started: 'neutral' };
const PLAN_TONE: Record<string, Tone> = { as_planned: 'success', ahead: 'info', behind: 'warning', unplanned: 'neutral' };

/** Syllabus completion by class and course, with the pace against how far the term has run. */
export function CompletionTable({ rows }: { rows: CompletionRow[] }) {
  const { t, fmt } = useI18n();
  const pct = (n: number | null) => (n === null ? '—' : `${fmt.number(n)}%`);
  const cols: Col<CompletionRow>[] = [
    { label: t('td.col.class'), cell: (r) => r.section },
    { label: t('td.col.course'), cell: (r) => (
      <a className="text-primary hover:underline" href={`/teaching-diary?tab=register&section=${r.sectionId}&subject=${r.subjectId}`}>
        {r.code} {r.subject}
      </a>
    ), sort: (r) => r.code },
    { label: t('td.col.department'), cell: (r) => r.department ?? '—' },
    { label: t('td.col.teachers'), cell: (r) => r.teachers, wrap: true },
    { label: t('td.col.covered'), cell: (r) => `${fmt.number(r.covered)} / ${fmt.number(r.topics)}`, sort: (r) => r.coveredPct ?? -1 },
    { label: t('td.col.coveredPct'), cell: (r) => pct(r.coveredPct), sort: (r) => r.coveredPct ?? -1 },
    { label: t('td.col.elapsed'), cell: (r) => pct(r.elapsedPct), sort: (r) => r.elapsedPct ?? -1 },
    { label: t('td.col.periods'), cell: (r) => `${fmt.number(r.scheduledToDate)} / ${fmt.number(r.scheduled)}`, sort: (r) => r.scheduledToDate },
    { label: t('td.col.logged'), cell: (r) => r.logged, num: true },
    { label: t('td.col.behind'), cell: (r) => r.behindPlan, num: true },
    { label: t('td.col.unreviewed'), cell: (r) => r.unreviewed, num: true },
    { label: t('td.col.pace'), cell: (r) => <StatusPill tone={PACE_TONE[r.pace]}>{t(`td.pace.${r.pace}` as MessageKey)}</StatusPill>, sort: (r) => r.pace },
  ];
  return <Grid cols={cols} rows={rows} empty={t('td.noCompletion')} emptyIcon={<BookOpenCheck />} testId="completion" exportName="syllabus-completion" tint={(r) => r.pace === 'behind'} />;
}

/** One class and course: hours allotted against taken, coverage, plan against actual, entries and periods still to log. */
export function RegisterView({ r }: { r: Register }) {
  const { t, fmt } = useI18n();
  const pct = (n: number | null) => (n === null ? '—' : `${fmt.number(n)}%`);
  return (
    <div className="grid gap-6">
      <StatGrid min={150}>
        <StatTile label={t('td.s.coverage')} value={pct(r.topics.percent)} caption={t('td.s.topics', { covered: fmt.number(r.topics.covered), total: fmt.number(r.topics.total) })} />
        <StatTile label={t('td.s.term')} value={pct(r.elapsedPct)} caption={<StatusPill tone={PACE_TONE[r.pace]}>{t(`td.pace.${r.pace}` as MessageKey)}</StatusPill>} />
        <StatTile label={t('td.s.allotted')} value={fmt.number(r.hours.allotted)} caption={t('td.s.perWeek', { n: fmt.number(r.hours.perWeek), ltp: r.subject.ltp })} />
        <StatTile label={t('td.s.taken')} value={`${fmt.number(r.hours.held)} / ${fmt.number(r.hours.scheduledToDate)}`} caption={t('td.s.hours', { h: fmt.number(r.hours.heldHours) })} />
        <StatTile label={t('td.s.logged')} value={fmt.number(r.hours.logged)} caption={t('td.s.plans', { n: fmt.number(r.lessonPlans.n), a: fmt.number(r.lessonPlans.approved) })} />
      </StatGrid>
      <Card title={t('td.againstPlan')}>
        <div className="flex flex-wrap gap-2">
          {(['as_planned', 'ahead', 'behind', 'unplanned'] as const).map((k) => (
            <StatusPill key={k} tone={PLAN_TONE[k]}>{`${t(`td.plan.${k}` as MessageKey)}: ${fmt.number(r.againstPlan[k] ?? 0)}`}</StatusPill>
          ))}
        </div>
      </Card>
      <Card title={t('td.pending')} subtitle={t('td.pendingHelp')}>
        {r.pending.length === 0 ? <p className="text-sm text-muted-foreground">{t('td.noPending')}</p> : <p className="text-sm">{r.pending.map((p) => `${fmt.date(p.date, 'short')}${p.batch ? ` (${p.batch})` : ''}`).join(', ')}</p>}
      </Card>
    </div>
  );
}

/** The diary entries on the record kit, with the head of department's review as a bulk action. */
export function DiaryRecords({ meta, page, state, canReview }: { meta: RecordMeta; page: RecordsPage<Row>; state: ListState; canReview: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reviewing, setReviewing] = useState<string[] | null>(null);
  const [remark, setRemark] = useState('');
  type R = Row & Record<string, string | number | boolean | null>;
  const columns = useMemo<Column<Row>[]>(() => {
    const v = (x: Row) => x as R;
    return [
      { id: 'date', header: t('td.col.date'), sortKey: 'date', rowHeader: true, hideable: false, cell: (x) => `${fmt.date(String(v(x).date), 'short')} ${v(x).startsAt}` },
      { id: 'class', header: t('td.col.class'), sortKey: 'class', cell: (x) => `${v(x).section}${v(x).batch ? ` · ${v(x).batch}` : ''}` },
      { id: 'subject', header: t('td.col.course'), sortKey: 'subject', cell: (x) => `${v(x).subjectCode} ${v(x).subject}` },
      { id: 'teacher', header: t('td.col.teacher'), sortKey: 'teacher', hideBelow: 'md', cell: (x) => `${v(x).teacher}${v(x).substitute ? ` (${t('td.substitute')})` : ''}` },
      { id: 'topics', header: t('td.col.topics'), cell: (x) => <span className="block min-w-[180px] max-w-[320px] whitespace-normal">{(v(x).topics as string | null) || (v(x).summary as string) || '—'}</span> },
      { id: 'delivery', header: t('td.col.delivery'), hideBelow: 'lg', cell: (x) => tr(t, `rk.o.teaching-logs.delivery.${v(x).delivery}`, String(v(x).delivery)) },
      { id: 'plan', header: t('td.col.plan'), sortKey: 'plan', cell: (x) => <StatusPill tone={PLAN_TONE[String(v(x).againstPlan)] ?? 'neutral'}>{t(`td.plan.${v(x).againstPlan}` as MessageKey)}</StatusPill> },
      { id: 'why', header: t('td.col.why'), hideBelow: 'lg', defaultHidden: true, cell: (x) => v(x).deviationReason || '—' },
      { id: 'source', header: t('td.col.source'), hideBelow: 'lg', defaultHidden: true, cell: (x) => t(`td.source.${v(x).source}` as MessageKey) },
      { id: 'reviewed', header: t('td.col.reviewed'), cell: (x) => (v(x).reviewedAt ? <StatusPill tone="success">{t('td.reviewed')}</StatusPill> : <StatusPill tone="warning">{t('td.toReview')}</StatusPill>) },
    ];
  }, [t, fmt]);
  const go = () =>
    start(async () => {
      const res = await reviewEntries(reviewing!, remark);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('td.reviewedN', { n: fmt.number(res.data.reviewed) }));
      if (res.data.refused.length) toast.error(res.data.refused[0].reason);
      setReviewing(null);
      setRemark('');
      router.refresh();
    });
  return (
    <>
      <RecordsTable
        meta={meta}
        page={page}
        state={state}
        label={tr(t, 'rk.entity.teaching-logs', 'Teaching diary')}
        columns={columns}
        extraParams={{ tab: 'diary' }}
        empty={<EmptyState icon={<NotebookPen />} title={t('td.emptyTitle')} description={t('td.emptyBody')} />}
        extraRowActions={(row) => (canReview && !(row as R).reviewedAt ? [{ id: 'review', label: t('td.review'), icon: <CheckCheck />, onSelect: (r) => setReviewing([r.id]) }] : [])}
        extraBulkActions={canReview ? [{ id: 'review', label: t('td.review'), icon: <CheckCheck />, onClick: (rows) => setReviewing(rows.map((r) => r.id)) }] : []}
      />
      {reviewing && (
        <Dialog
          title={t('td.reviewTitle', { n: fmt.number(reviewing.length) })}
          busy={pending}
          onClose={() => setReviewing(null)}
          actions={
            <>
              <Button variant="outline" onClick={() => setReviewing(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={go} disabled={pending} data-testid="confirm-review">
                <CheckCheck />
                {t('td.review')}
              </Button>
            </>
          }
        >
          <FormField label={t('td.remark')} helper={t('td.remarkHelp')}>
            <TextInput value={remark} onChange={(e) => setRemark(e.target.value)} multiline minRows={2} />
          </FormField>
        </Dialog>
      )}
    </>
  );
}
