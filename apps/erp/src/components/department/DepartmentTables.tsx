'use client';
import Link from 'next/link';
import { MiniBar } from '@/components/Bars';
import { Rate } from '@/components/department/Rate';
import { Hint } from '@/components/Hint';
import { LinkButton } from '@/components/LinkButton';
import { PublishedChip } from '@/components/results/PublishedChip';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import { flagsFor, formatPercent, ofText } from '@/lib/department';
import { lessonPlansText, planChip } from '@/lib/plans';
import { kindLabel } from '@/lib/results';
import type { DepartmentOverview, DeptClass, DeptTeacher } from '@/lib/types';

import { Chip } from '@/components/kx';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
const num = { fontVariantNumeric: 'tabular-nums' } as const;

function Flags({ r, t }: { r: DeptTeacher | DeptClass; t: TFunction }) {
  const flags = flagsFor(r);
  if (flags.length === 0) return null;
  return (
    <Hint title={flags.map((k) => t(k)).join(' · ')}>
      <Chip className="ml-2 h-[22px] bg-red-soft text-red-ink font-medium" size="small" label={t('dept.needsAttention')} data-testid="flag" />
    </Hint>
  );
}

/** Teachers of the department: periods held, attendance taken, attendance rate, homework and recordings. */
export function TeachersTable({ rows }: { rows: DeptTeacher[] }) {
  const { t } = useI18n();
  const columns: Column<DeptTeacher>[] = [
    {
      id: 'teacher',
      header: t('dept.col.teacher'),
      rowHeader: true,
      sort: (r) => r.fullName,
      cell: (r) => (
        <>
          <div className="flex items-center flex-wrap">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{r.fullName}</h6>
            <Flags r={r} t={t} />
          </div>
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {r.scheduled ? t.plural('dept.periodsDue', r.scheduled) : t('dept.noPeriodsDue')}
          </span>
        </>
      ),
    },
    { id: 'held', header: t('dept.col.held'), align: 'right', sort: (r) => r.taughtPercent, cell: (r) => <Rate value={r.taughtPercent} kind="held" detail={ofText(r.taught, r.scheduled, t)} testId="teacher-held" /> },
    { id: 'taken', header: t('dept.col.taken'), align: 'right', sort: (r) => r.attendanceTakenPercent, cell: (r) => <Rate value={r.attendanceTakenPercent} kind="held" detail={ofText(r.attendanceTaken, r.scheduled, t)} testId="teacher-taken" /> },
    { id: 'attendance', header: t('dept.col.attendance'), align: 'right', sort: (r) => r.attendancePercent, cell: (r) => <Rate value={r.attendancePercent} kind="attendance" testId="teacher-attendance" /> },
    { id: 'homework', header: t('dept.col.homework'), align: 'right', hideBelow: 'md', sort: (r) => r.homework, cell: (r) => <span style={num}>{r.homework}</span> },
    { id: 'recordings', header: t('dept.col.recordings'), align: 'right', hideBelow: 'md', sort: (r) => r.recordings, cell: (r) => <span style={num}>{r.recordings}</span> },
  ];
  return <DataTable testId="dept-teachers" label={t('dept.col.teacher')} rows={rows} rowId={(r) => r.id} exportName="department-teachers" rowAttrs={() => ({ 'data-testid': 'dept-teacher-row' })} columns={columns} />;
}

/**
 * One row per class and subject. The teacher sits under the class, lesson plans under the year
 * plan, and the link to the class's results under its latest test.
 */
export function ClassesTable({ rows }: { rows: DeptClass[] }) {
  const { t, fmt } = useI18n();
  const results = (c: DeptClass) => (
    <Link href={`/results?class=${c.sectionId}`} aria-label={t('dept.resultsFor', { section: c.section })} style={{ textDecoration: 'none' }}>
      <span className="text-xs leading-4 tracking-[0.3px] text-teal-ink font-medium inline-flex items-center whitespace-nowrap hover:underline">
        {t('dept.col.results')}
        <ChevronRight className="text-[16px] -mr-1" />
      </span>
    </Link>
  );
  const columns: Column<DeptClass>[] = [
    {
      id: 'class',
      header: `${t('dept.col.class')} / ${t('dept.col.teacher')}`,
      rowHeader: true,
      sort: (c) => c.section,
      csv: (c) => `${c.section} · ${c.subject} · ${c.teacher}`,
      cell: (c) => (
        <>
          <div className="flex items-center flex-wrap">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{c.section}</h6>
            <Flags r={c} t={t} />
          </div>
          <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {c.subject} ·{' '}
            <span className="whitespace-nowrap" data-testid="class-teacher">
              {c.teacher}
            </span>
          </div>
        </>
      ),
    },
    { id: 'held', header: t('dept.col.heldShort'), align: 'right', sort: (c) => c.taughtPercent, cell: (c) => <Rate compact value={c.taughtPercent} kind="held" detail={ofText(c.taught, c.scheduled, t)} /> },
    { id: 'attendance', header: t('dept.col.attendance'), align: 'right', sort: (c) => c.attendancePercent, cell: (c) => <Rate compact value={c.attendancePercent} kind="attendance" detail={c.scheduled ? t('dept.takenOf', { n: c.attendanceTaken, d: c.scheduled }) : undefined} /> },
    { id: 'syllabus', header: t('dept.col.syllabus'), hideBelow: 'md', sort: (c) => c.syllabus?.percent ?? null, cell: (c) => <div data-testid="class-syllabus"><SyllabusCell c={c} t={t} /></div> },
    {
      id: 'plan',
      header: `${t('plan.col.yearPlan')} / ${t('plan.col.lessonPlans')}`,
      hideBelow: 'lg',
      sort: (c) => planChip(c.yearPlan, t).label,
      csv: (c) => `${planChip(c.yearPlan, t).label} · ${lessonPlansText(c.lessonPlans ?? 0, c.scheduled, t)}`,
      cell: (c) => (
        <>
          <div data-testid="class-year-plan">
            <YearPlanCell c={c} t={t} />
          </div>
          <Hint title={t('plan.lessonsHelp')}>
            <span className={cn('text-xs tracking-[0.3px] leading-[20px] whitespace-nowrap', c.lessonPlans ? 'text-foreground' : 'text-muted-foreground', 'tabular-nums')} data-testid="class-lesson-plans">
              {lessonPlansText(c.lessonPlans ?? 0, c.scheduled, t)}
            </span>
          </Hint>
        </>
      ),
    },
    { id: 'homework', header: t('dept.col.homework'), align: 'right', hideBelow: 'md', sort: (c) => c.homework, cell: (c) => <span data-testid="class-homework" style={num}>{c.homework}</span> },
    {
      id: 'latest',
      header: `${t('dept.col.latest')} / ${t('dept.col.results')}`,
      align: 'right',
      sort: (c) => c.latestAssessment?.averagePercent ?? null,
      csv: (c) => c.latestAssessment?.averagePercent ?? '',
      cell: (c) => {
        const latest = c.latestAssessment;
        return (
          <div data-testid="class-latest">
            {latest ? (
              <Hint title={`${latest.title} · ${fmt.date(latest.heldOn, 'short')} · ${t('dept.classAverage')}`} block>
                <Rate compact value={latest.averagePercent} kind="marks" detail={results(c)} />
              </Hint>
            ) : (
              <>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  —
                </p>
                <div className="text-xs leading-4 tracking-[0.3px]">
                  {results(c)}
                </div>
              </>
            )}
          </div>
        );
      },
    },
  ];
  return <DataTable dense testId="dept-classes" label={t('dept.col.class')} rows={rows} rowId={(c) => `${c.sectionId}|${c.subjectId}|${c.teacherId}`} exportName="department-classes" rowAttrs={() => ({ 'data-testid': 'dept-class-row' })} columns={columns} />;
}

/** The department's recent assessments with the class average and publication state. */
export function DeptAssessmentsTable({ o }: { o: DepartmentOverview }) {
  const { t, fmt } = useI18n();
  type A = DepartmentOverview['assessments'][number];
  const columns: Column<A>[] = [
    {
      id: 'assessment',
      header: t('dept.col.assessment'),
      rowHeader: true,
      sort: (a) => a.title,
      csv: (a) => `${a.title} (${a.section}, ${a.subject}, ${kindLabel(a.kind, t)})`,
      cell: (a) => (
        <>
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{a.title}</h6>
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {a.section} · {a.subject} · {kindLabel(a.kind, t)} · {a.createdBy}
          </span>
        </>
      ),
    },
    { id: 'heldOn', header: t('dept.col.heldOn'), sort: (a) => a.heldOn, cell: (a) => <div className="whitespace-nowrap">{fmt.date(a.heldOn, 'short')}</div> },
    { id: 'entered', header: t('dept.col.entered'), align: 'right', sort: (a) => a.entered, cell: (a) => <span style={num}>{a.entered}</span> },
    { id: 'average', header: t('dept.col.average'), align: 'right', sort: (a) => a.averagePercent, cell: (a) => <Rate value={a.averagePercent} kind="marks" /> },
    { id: 'status', header: t('dept.col.status'), sort: (a) => a.publishedAt ?? '', csv: (a) => a.publishedAt?.slice(0, 10) ?? '', cell: (a) => <PublishedChip publishedAt={a.publishedAt} /> },
    {
      id: 'open',
      header: '',
      csv: false,
      align: 'right',
      cell: (a) => (
        <LinkButton href={`/results/${a.id}`} size="small" endIcon={<ChevronRight />} aria-label={t('dept.marksFor', { title: a.title })}>
          {t('dept.marks')}
        </LinkButton>
      ),
    },
  ];
  return <DataTable testId="dept-assessments" label={t('dept.col.assessment')} rows={o.assessments} rowId={(a) => a.id} exportName="department-assessments" rowAttrs={() => ({ 'data-testid': 'dept-assessment-row' })} columns={columns} />;
}

/** Topics of the class's syllabus taught so far, with a link to the topic list. */
function SyllabusCell({ c, t }: { c: DeptClass; t: TFunction }) {
  const sy = c.syllabus;
  if (!sy || sy.total === 0)
    return (
      <Hint title={t('dept.syllabus.noneHelp')}>
        <span className="text-[13px] leading-[19px] text-muted-foreground" data-percent="none">
          {t('dept.syllabus.none')}
        </span>
      </Hint>
    );
  const p = sy.percent ?? 0;
  return (
    <Link
      href={`/department/syllabus?section=${c.sectionId}&subject=${c.subjectId}`}
      aria-label={t('dept.syllabus.open', { section: c.section, subject: c.subject })}
      data-percent={p}
      style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}
    >
      <div className="w-[40px] shrink-0">
        <MiniBar value={p} color={p >= 100 ? 'kx.success' : 'primary.main'} />
      </div>
      <div>
        <p className="text-[13px] leading-[19px] text-teal-ink font-medium tabular-nums">
          {formatPercent(p)}
        </p>
        <div className="text-xs tracking-[0.3px] text-muted-foreground leading-[16px] whitespace-nowrap tabular-nums">
          {t('dept.syllabus.topics', { covered: sy.covered, total: sy.total })}
        </div>
      </div>
    </Link>
  );
}

const planHref = (c: DeptClass) => `/department/plan?section=${c.sectionId}&subject=${c.subjectId}`;

/** The class against its year plan, as a chip that opens the class's plans. */
function YearPlanCell({ c, t }: { c: DeptClass; t: TFunction }) {
  const p = c.yearPlan;
  const chip = planChip(p, t);
  const tone = chip.status === 'behind' ? 'bg-red-soft text-red-ink' : chip.tone === 'good' ? 'bg-green-soft text-green-ink' : 'text-muted-foreground';
  return (
    <Hint title={p ? t('plan.status.help', { covered: p.covered, total: p.total, expected: p.expected }) : t('plan.status.noneHelp')}>
      <Link href={planHref(c)} aria-label={t('plan.open', { section: c.section, subject: c.subject })} style={{ textDecoration: 'none' }}>
        <Chip className={`max-w-[180px] cursor-pointer font-medium ${tone}`} size="small" label={chip.label} variant={chip.tone === 'none' ? 'outlined' : 'filled'} data-testid="plan-status" data-status={chip.status} />
      </Link>
    </Hint>
  );
}
