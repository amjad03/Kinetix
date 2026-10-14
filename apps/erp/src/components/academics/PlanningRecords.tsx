'use client';

import { BookCopy, Briefcase, CalendarClock, GitBranch, Layers, ListTree, Repeat, ScrollText, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { basketCourses, setBasketCourses, type BasketCourse } from '@/app/(dashboard)/academics/planning/actions';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, EmptyState, StatusPill, TextInput, useToast, type Column, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

export type PlanningEntity = 'elective-baskets' | 'course-requisites' | 'credit-transfers' | 'faculty-allocations' | 'regulations' | 'period-structures' | 'special-classes' | 'working-days';
type R = Row & Record<string, string | number | boolean | null>;
const DECISION_TONE: Record<string, Tone> = { pending: 'warning', approved: 'success', rejected: 'danger', scheduled: 'info', held: 'success', cancelled: 'neutral' };
const WEEKDAY: MessageKey[] = ['plan.day.1', 'plan.day.2', 'plan.day.3', 'plan.day.4', 'plan.day.5', 'plan.day.6', 'plan.day.7'];

const ICONS: Record<PlanningEntity, React.ReactNode> = {
  'elective-baskets': <Layers />,
  'course-requisites': <GitBranch />,
  'credit-transfers': <Repeat />,
  'faculty-allocations': <Briefcase />,
  regulations: <ScrollText />,
  'period-structures': <ListTree />,
  'special-classes': <CalendarClock />,
  'working-days': <Wrench />,
};

/**
 * The academic planning lists (Academics → Planning and Timetable → Setup) on the record depth kit: each entity's
 * columns, its empty state, and the extra a list needs (an elective basket's courses).
 */
export function PlanningRecords({ entity, meta, page, state, tab, reorderScope = [] }: { entity: PlanningEntity; meta: RecordMeta; page: RecordsPage<Row>; state: ListState; tab: string; reorderScope?: string[] }) {
  const { t, fmt } = useI18n();
  const [courses, setCourses] = useState<Row | null>(null);
  const columns = useMemo<Column<Row>[]>(() => {
    const v = (x: Row) => x as R;
    const n = (x: unknown) => (x === null || x === undefined || x === '' ? '—' : fmt.number(Number(x)));
    const opt = (key: string, x: Row) => tr(t, `rk.o.${entity}.${key}.${v(x)[key]}`, String(v(x)[key] ?? ''));
    const pill = (key: string) => (x: Row) => <StatusPill tone={DECISION_TONE[String(v(x)[key])] ?? 'neutral'}>{opt(key, x)}</StatusPill>;
    const date = (x: unknown) => (x ? fmt.date(String(x), 'short') : '—');
    switch (entity) {
      case 'elective-baskets':
        return [
          { id: 'name', header: t('plan.col.basket'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => v(x).name },
          { id: 'programme', header: t('rk.col.programme'), sortKey: 'programme', hideBelow: 'sm', cell: (x) => v(x).programName },
          { id: 'term', header: t('rk.col.term'), sortKey: 'term', align: 'right', cell: (x) => n(v(x).term) },
          { id: 'kind', header: t('plan.col.kind'), sortKey: 'kind', hideBelow: 'md', cell: (x) => <StatusPill tone="info">{opt('kind', x)}</StatusPill> },
          { id: 'choose', header: t('plan.col.choose'), align: 'right', cell: (x) => (v(x).minChoose === v(x).maxChoose ? n(v(x).maxChoose) : `${n(v(x).minChoose)}–${n(v(x).maxChoose)}`) },
          { id: 'courses', header: t('plan.col.courses'), sortKey: 'subjects', cell: (x) => v(x).members || <span className="text-muted-foreground">{t('plan.noCourses')}</span> },
          { id: 'credits', header: t('plan.col.credits'), align: 'right', hideBelow: 'lg', defaultHidden: true, cell: (x) => n(v(x).credits) },
        ];
      case 'course-requisites':
        return [
          { id: 'course', header: t('plan.col.course'), sortKey: 'course', rowHeader: true, hideable: false, cell: (x) => `${v(x).code} ${v(x).name}` },
          { id: 'kind', header: t('plan.col.kind'), sortKey: 'kind', cell: (x) => <StatusPill tone={v(x).kind === 'prerequisite' ? 'info' : 'neutral'}>{opt('kind', x)}</StatusPill> },
          { id: 'requires', header: t('plan.col.requires'), sortKey: 'requires', cell: (x) => `${v(x).requiresCode} ${v(x).requiresName}` },
          { id: 'programme', header: t('rk.col.programme'), sortKey: 'programme', hideBelow: 'md', cell: (x) => `${v(x).programName} · ${n(v(x).term)}` },
          { id: 'note', header: t('plan.col.note'), hideBelow: 'lg', cell: (x) => v(x).note || '—' },
        ];
      case 'credit-transfers':
        return [
          { id: 'student', header: t('atd.col.student'), sortKey: 'student', rowHeader: true, hideable: false, cell: (x) => `${v(x).rollNo} ${v(x).fullName}` },
          { id: 'source', header: t('plan.col.source'), hideBelow: 'sm', cell: (x) => <StatusPill tone="info">{opt('source', x)}</StatusPill> },
          { id: 'course', header: t('plan.col.course'), sortKey: 'course', cell: (x) => v(x).courseTitle },
          { id: 'provider', header: t('plan.col.provider'), hideBelow: 'lg', defaultHidden: true, cell: (x) => v(x).provider || '—' },
          { id: 'credits', header: t('plan.col.credits'), sortKey: 'credits', align: 'right', cell: (x) => n(v(x).credits) },
          { id: 'grade', header: t('plan.col.grade'), hideBelow: 'md', cell: (x) => v(x).grade || '—' },
          { id: 'mapped', header: t('plan.col.countsAs'), hideBelow: 'md', cell: (x) => v(x).mapped ?? '—' },
          { id: 'completed', header: t('plan.col.completed'), sortKey: 'completed', hideBelow: 'lg', defaultHidden: true, cell: (x) => date(v(x).completedOn) },
          { id: 'status', header: t('atd.col.status'), sortKey: 'status', cell: pill('status') },
        ];
      case 'faculty-allocations':
        return [
          { id: 'class', header: t('rk.col.class'), sortKey: 'class', cell: (x) => v(x).section },
          { id: 'subject', header: t('plan.col.course'), sortKey: 'subject', rowHeader: true, hideable: false, cell: (x) => `${v(x).subjectCode} ${v(x).subject}` },
          { id: 'teacher', header: t('plan.col.teacher'), sortKey: 'teacher', cell: (x) => v(x).teacher },
          { id: 'role', header: t('plan.col.role'), hideBelow: 'md', cell: (x) => opt('role', x) },
          { id: 'batch', header: t('plan.col.batch'), hideBelow: 'lg', cell: (x) => v(x).batch || '—' },
          { id: 'hours', header: t('plan.col.hours'), sortKey: 'hours', align: 'right', cell: (x) => n(v(x).hoursPerWeek) },
          { id: 'periods', header: t('plan.col.periods'), align: 'right', hideBelow: 'md', cell: (x) => n(v(x).periods) },
          { id: 'from', header: t('plan.col.from'), sortKey: 'from', hideBelow: 'lg', defaultHidden: true, cell: (x) => date(v(x).fromDate) },
          { id: 'to', header: t('plan.col.to'), hideBelow: 'lg', cell: (x) => (v(x).toDate ? date(v(x).toDate) : <StatusPill tone="success">{t('plan.current')}</StatusPill>) },
        ];
      case 'regulations':
        return [
          { id: 'name', header: t('plan.col.regulation'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => v(x).name },
          { id: 'year', header: t('plan.col.year'), sortKey: 'year', align: 'right', cell: (x) => String(v(x).year) },
          { id: 'programme', header: t('rk.col.programme'), sortKey: 'programme', hideBelow: 'sm', cell: (x) => v(x).programName ?? t('plan.allProgrammes') },
          { id: 'authority', header: t('plan.col.authority'), hideBelow: 'md', cell: (x) => v(x).authority },
          { id: 'effective', header: t('plan.col.effective'), sortKey: 'effective', hideBelow: 'md', cell: (x) => date(v(x).effectiveFrom) },
          { id: 'versions', header: t('plan.col.versions'), sortKey: 'versions', align: 'right', cell: (x) => n(v(x).versions) },
        ];
      case 'period-structures':
        return [
          { id: 'name', header: t('plan.col.structure'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => (v(x).isDefault ? <span className="inline-flex items-center gap-2">{String(v(x).name)} <StatusPill tone="success">{t('plan.default')}</StatusPill></span> : v(x).name) },
          { id: 'programme', header: t('rk.col.programme'), sortKey: 'programme', hideBelow: 'sm', cell: (x) => v(x).programName ?? t('plan.allProgrammes') },
          { id: 'days', header: t('plan.col.days'), hideBelow: 'md', cell: (x) => String(v(x).daysText ?? '').split(',').filter(Boolean).map((d) => t(WEEKDAY[Number(d) - 1])).join(', ') },
          { id: 'periods', header: t('plan.col.periods'), align: 'right', cell: (x) => n(v(x).classCount) },
          { id: 'hours', header: t('plan.col.dayHours'), hideBelow: 'sm', cell: (x) => `${v(x).first ?? '—'}–${v(x).last ?? '—'}` },
          { id: 'bells', header: t('plan.col.bells'), hideBelow: 'lg', defaultHidden: true, cell: (x) => <span className="text-xs whitespace-pre-line">{String(v(x).periodsText ?? '')}</span> },
        ];
      case 'special-classes':
        return [
          { id: 'date', header: t('atd.col.date'), sortKey: 'date', cell: (x) => `${date(v(x).date)} · ${v(x).startsAt}–${v(x).endsAt}` },
          { id: 'class', header: t('rk.col.class'), sortKey: 'class', hideBelow: 'sm', cell: (x) => v(x).section },
          { id: 'subject', header: t('plan.col.course'), sortKey: 'subject', rowHeader: true, hideable: false, cell: (x) => `${v(x).subjectCode} ${v(x).subject}` },
          { id: 'kind', header: t('plan.col.kind'), hideBelow: 'md', cell: (x) => opt('kind', x) },
          { id: 'teacher', header: t('plan.col.teacher'), sortKey: 'teacher', hideBelow: 'md', cell: (x) => v(x).teacher },
          { id: 'topic', header: t('plan.col.topic'), hideBelow: 'lg', cell: (x) => v(x).topic || '—' },
          { id: 'status', header: t('atd.col.status'), sortKey: 'status', cell: pill('status') },
          { id: 'marked', header: t('plan.col.marked'), align: 'right', hideBelow: 'lg', defaultHidden: true, cell: (x) => n(v(x).marked) },
        ];
      case 'working-days':
        return [
          { id: 'date', header: t('atd.col.date'), sortKey: 'date', rowHeader: true, hideable: false, cell: (x) => `${date(v(x).date)} · ${t(WEEKDAY[Number(v(x).weekday) - 1])}` },
          { id: 'follows', header: t('plan.col.follows'), cell: (x) => t(WEEKDAY[Number(v(x).followsWeekday) - 1]) },
          { id: 'programmes', header: t('rk.col.programme'), hideBelow: 'sm', cell: (x) => v(x).programs ?? t('plan.allProgrammes') },
          { id: 'reason', header: t('atd.col.reason'), hideBelow: 'md', cell: (x) => v(x).reason || '—' },
        ];
    }
  }, [entity, t, fmt]);
  const router = useRouter();
  return (
    <>
      <RecordsTable
        key={entity}
        meta={meta}
        page={page}
        state={state}
        label={tr(t, `rk.entity.${entity}`, entity)}
        columns={columns}
        extraParams={{ tab }}
        reorderScope={reorderScope}
        extraRowActions={(row) =>
          entity === 'elective-baskets'
            ? [{ id: 'courses', label: t('plan.basketCourses'), icon: <BookCopy />, onSelect: (r) => setCourses(r) }]
            : entity === 'special-classes' && (row as R).status !== 'cancelled'
              ? [{ id: 'mark', label: t('plan.markAttendance'), icon: <CalendarClock />, onSelect: (r) => router.push(`/attendance/mark?special=${r.id}`) }]
              : []
        }
        empty={
          <EmptyState icon={ICONS[entity]} title={t(`plan.empty.${entity}` as MessageKey)} testId={`no-${entity}`}>
            {t(`plan.emptyHelp.${entity}` as MessageKey)}
          </EmptyState>
        }
      />
      {courses && <BasketCoursesDialog basket={courses as R} canEdit={meta.can.write} onClose={() => setCourses(null)} />}
    </>
  );
}

/** The courses of an elective basket: the programme term's own first, then any other course (an open elective). */
function BasketCoursesDialog({ basket, canEdit, onClose }: { basket: R; canEdit: boolean; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<BasketCourse[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    let live = true;
    void basketCourses(String(basket.id)).then((r) => {
      if (!live) return;
      if (!r.ok) return toast.error(r.error);
      setList(r.data.subjects);
      setChosen(r.data.subjects.filter((s) => s.chosen).map((s) => s.id));
    });
    return () => {
      live = false;
    };
    // Loads once per basket; the toast is only used to report a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basket.id]);
  const words = q.trim().toLowerCase();
  const shown = (list ?? []).filter((s) => s.chosen || s.sameTerm || (words && `${s.code} ${s.name} ${s.program}`.toLowerCase().includes(words)));
  const save = () =>
    start(async () => {
      const r = await setBasketCourses(String(basket.id), chosen);
      if (!r.ok) return toast.error(r.error);
      toast.success(t('plan.basketSaved', { n: fmt.number(r.data.count) }));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('plan.basketCoursesOf', { name: String(basket.name) })}
      size="md"
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {canEdit ? t('common.cancel') : t('common.close')}
          </Button>
          {canEdit && (
            <Button onClick={save} disabled={pending || list === null} data-testid="basket-save">
              {t('common.save')}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <p className="m-0 text-sm text-muted-foreground">{t('plan.basketHelp', { min: fmt.number(Number(basket.minChoose)), max: fmt.number(Number(basket.maxChoose)) })}</p>
        <TextInput label={t('plan.findCourse')} value={q} onChange={(e) => setQ(e.target.value)} helper={t('plan.findCourseHelp')} />
        {list === null ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="grid max-h-80 gap-0.5 overflow-y-auto rounded-md border p-2" data-testid="basket-courses">
            {shown.map((s) => (
              <CheckboxField
                key={s.id}
                disabled={!canEdit}
                label={`${s.code} ${s.name}${s.credits !== null ? ` · ${t('plan.creditsN', { n: fmt.number(s.credits) })}` : ''}${s.sameTerm ? '' : ` · ${s.program} ${s.term}`}`}
                checked={chosen.includes(s.id)}
                onChange={(c) => setChosen((x) => (c ? [...x, s.id] : x.filter((y) => y !== s.id)))}
              />
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
