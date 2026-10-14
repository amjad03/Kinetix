'use client';

import { BookOpen, GraduationCap, School } from 'lucide-react';
import { useMemo } from 'react';
import { RecordsTable } from '@/components/records/RecordsTable';
import { tr } from '@/components/records/text';
import { EmptyState, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';

export type StructureEntity = 'programmes' | 'classes' | 'subjects';
type R = Row & Record<string, string | number | boolean | null>;

/**
 * Programmes, classes and subjects as record kit lists (Academics → Structure). Classes and subjects are ordered
 * within their programme and term, so reordering asks for those filters first.
 */
export function StructureRecords({ entity, meta, page, state }: { entity: StructureEntity; meta: RecordMeta; page: RecordsPage<Row>; state: ListState }) {
  const { t, fmt } = useI18n();
  const columns = useMemo<Column<Row>[]>(() => {
    const v = (x: Row) => x as R;
    const n = (x: unknown) => fmt.number(Number(x ?? 0));
    if (entity === 'programmes')
      return [
        { id: 'name', header: t('rk.col.programme'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => v(x).name },
        { id: 'level', header: t('rk.col.level'), sortKey: 'level', cell: (x) => <StatusPill tone="info">{tr(t, `rk.o.programmes.level.${v(x).level}`, String(v(x).level))}</StatusPill> },
        { id: 'terms', header: t('rk.col.terms'), sortKey: 'terms', align: 'right', hideBelow: 'sm', cell: (x) => n(v(x).termCount) },
        { id: 'campus', header: t('rk.col.campus'), sortKey: 'campus', hideBelow: 'lg', defaultHidden: true, cell: (x) => v(x).campusName },
        { id: 'classes', header: t('rk.col.classes'), sortKey: 'classes', align: 'right', hideBelow: 'md', cell: (x) => n(v(x).classCount) },
        { id: 'subjects', header: t('rk.col.subjects'), align: 'right', hideBelow: 'md', cell: (x) => n(v(x).subjectCount) },
        { id: 'students', header: t('rk.col.students'), sortKey: 'students', align: 'right', cell: (x) => n(v(x).studentCount) },
      ];
    if (entity === 'classes')
      return [
        { id: 'name', header: t('rk.col.class'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => v(x).displayName },
        { id: 'programme', header: t('rk.col.programme'), sortKey: 'programme', hideBelow: 'sm', cell: (x) => v(x).programName },
        { id: 'term', header: t('rk.col.term'), sortKey: 'term', align: 'right', cell: (x) => n(v(x).term) },
        { id: 'section', header: t('rk.col.section'), defaultHidden: true, cell: (x) => v(x).name },
        { id: 'year', header: t('rk.col.year'), sortKey: 'year', hideBelow: 'md', cell: (x) => (v(x).isCurrentYear ? <StatusPill tone="success">{String(v(x).yearLabel)}</StatusPill> : String(v(x).yearLabel)) },
        { id: 'students', header: t('rk.col.students'), sortKey: 'students', align: 'right', cell: (x) => n(v(x).studentCount) },
      ];
    return [
      { id: 'code', header: t('rk.col.code'), sortKey: 'code', cell: (x) => <span className="tabular-nums">{v(x).code}</span> },
      { id: 'name', header: t('rk.col.subject'), sortKey: 'name', rowHeader: true, hideable: false, cell: (x) => v(x).name },
      { id: 'programme', header: t('rk.col.programme'), sortKey: 'programme', hideBelow: 'sm', cell: (x) => v(x).programName },
      { id: 'term', header: t('rk.col.term'), sortKey: 'term', align: 'right', cell: (x) => n(v(x).term) },
      { id: 'department', header: t('rk.col.department'), sortKey: 'department', hideBelow: 'md', cell: (x) => v(x).departmentName ?? <span className="text-muted-foreground">—</span> },
      { id: 'type', header: t('plan.col.type'), sortKey: 'type', hideBelow: 'md', cell: (x) => <StatusPill tone="neutral">{tr(t, `rk.o.subjects.courseType.${v(x).courseType}`, String(v(x).courseType))}</StatusPill> },
      { id: 'credits', header: t('plan.col.credits'), sortKey: 'credits', align: 'right', hideBelow: 'sm', cell: (x) => (v(x).credits === null ? '—' : fmt.number(Number(v(x).credits))) },
      { id: 'ltps', header: t('plan.col.ltps'), hideBelow: 'lg', cell: (x) => <span className="tabular-nums">{`${v(x).lectureHours}-${v(x).tutorialHours}-${v(x).practicalHours}-${v(x).selfStudyHours}`}</span> },
      { id: 'marks', header: t('plan.col.marksSplit'), hideBelow: 'lg', defaultHidden: true, cell: (x) => (v(x).maxInternal === null && v(x).maxExternal === null ? '—' : `${v(x).maxInternal ?? '—'} + ${v(x).maxExternal ?? '—'}`) },
      { id: 'requires', header: t('plan.col.requires'), hideBelow: 'lg', defaultHidden: true, cell: (x) => v(x).requires || '—' },
    ];
  }, [entity, t, fmt]);

  const icon = entity === 'programmes' ? <GraduationCap /> : entity === 'classes' ? <School /> : <BookOpen />;
  return (
    <RecordsTable
      key={entity}
      meta={meta}
      page={page}
      state={state}
      label={tr(t, `rk.entity.${entity}`, entity)}
      columns={columns}
      extraParams={{ tab: entity }}
      reorderScope={entity === 'classes' ? ['programme', 'term', 'year'] : entity === 'subjects' ? ['programme', 'term'] : []}
      rowHref={entity === 'classes' ? (x) => `/academics/sections/${x.id}` : entity === 'subjects' ? (x) => `/academics/subjects/${x.id}` : undefined}
      empty={
        <EmptyState icon={icon} title={t(`rk.empty.${entity}`)} testId={`no-${entity}`}>
          {t(`rk.emptyHelp.${entity}`)}
        </EmptyState>
      }
    />
  );
}
