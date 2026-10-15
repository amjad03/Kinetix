'use client';

import { AlertTriangle, ClipboardCheck, Inbox, Target } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, DataTable, EmptyState, FormField, FormRow, StatGrid, StatTile, StatusPill, TextInput, type Column } from '@/components/ui';
import { MenuItem } from '@/components/kx';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { lvl, type DashCourse, type ObeDash } from '@/lib/obe-flagship';
import { HeatGrid, LevelCell, LevelLegend } from './Heat';

const FLAG_TONE = { noCos: 'danger', unmapped: 'warning', untagged: 'warning', marks: 'info', noAssessments: 'neutral' } as const;

/** The courses that need attention: no COs, unmapped COs, untagged assessments, missing marks. */
export function CourseFlags({ c }: { c: DashCourse }) {
  const { t } = useI18n();
  if (!c.flags.length) return <StatusPill tone="success">{t('of.flag.ok')}</StatusPill>;
  return (
    <span className="flex flex-wrap gap-1">
      {c.flags.map((f) => (
        <StatusPill key={f} tone={FLAG_TONE[f]}>
          {t(`of.flag.${f}` as MessageKey)}
        </StatusPill>
      ))}
    </span>
  );
}

export const stageLabel = (t: (k: MessageKey) => string, s: string) => t(`of.stage.${s}` as MessageKey);

/** Every course of the year with its CO version and approval state, tagging and marks completeness, attainment and what needs attention. */
export function CoursesTable({ courses, programs, yearId, label }: { courses: DashCourse[]; programs: { id: string; name: string }[]; yearId?: string; label: string }) {
  const { t } = useI18n();
  const href = (c: DashCourse) => `/obe/courses/${c.id}${yearId ? `?academicYearId=${yearId}` : ''}`;
  const columns: Column<DashCourse>[] = [
    { id: 'course', header: t('of.col.course'), rowHeader: true, sort: (c) => `${c.term}-${c.code}`, cell: (c) => (<span><b className="font-semibold">{c.code}</b> {c.name}<span className="block text-xs text-muted-foreground">{t('of.sem', { n: c.term })}{c.department ? ` · ${c.department}` : ''}</span></span>), csv: (c) => `${c.code} ${c.name}` },
    { id: 'programme', header: t('of.col.programme'), hideBelow: 'lg', sort: (c) => programs.find((p) => p.id === c.programId)?.name ?? '', cell: (c) => programs.find((p) => p.id === c.programId)?.name ?? '' },
    { id: 'cos', header: t('of.col.cos'), sort: (c) => c.cos, cell: (c) => (<span className="text-[13px]">{c.cos ? t('of.cosMapped', { n: c.cos, mapped: c.mapped }) : '-'}<span className="block text-xs text-muted-foreground">{stageLabel(t, c.reviewStage)}{c.version ? ` · v${c.version}` : ''}</span></span>), csv: (c) => c.cos },
    { id: 'tags', header: t('of.col.tagged'), align: 'right', hideBelow: 'md', sort: (c) => c.tagged, cell: (c) => `${c.tagged}/${c.assessments}` },
    { id: 'marks', header: t('of.col.marks'), align: 'right', hideBelow: 'md', sort: (c) => c.marksComplete, cell: (c) => `${c.marksComplete}/${c.assessments}` },
    { id: 'att', header: t('of.col.attainment'), align: 'right', sort: (c) => c.attainment, cell: (c) => <LevelCell value={c.attainment} target={2} />, csv: (c) => c.attainment ?? '' },
    { id: 'below', header: t('of.col.below'), align: 'right', hideBelow: 'lg', sort: (c) => c.belowTarget, cell: (c) => c.belowTarget },
    { id: 'flags', header: t('of.col.attention'), cell: (c) => <CourseFlags c={c} />, csv: (c) => c.flags.join(' ') },
  ];
  const terms = [...new Set(courses.map((c) => c.term))].sort((a, b) => a - b);
  return (
    <DataTable
      label={label}
      rows={courses}
      rowId={(c) => c.id}
      columns={columns}
      rowHref={href}
      exportName="obe-courses"
      pageSize={25}
      filters={[
        { id: 'programme', label: t('of.col.programme'), options: programs.map((p) => ({ value: p.id, label: p.name })), match: (c, v) => c.programId === v },
        { id: 'term', label: t('of.col.sem'), options: terms.map((n) => ({ value: String(n), label: t('of.sem', { n }) })), match: (c, v) => String(c.term) === v },
        { id: 'stage', label: t('of.col.stage'), options: (['approved', 'hod', 'coordinator', 'iqac', 'returned', 'draft', 'none'] as const).map((s) => ({ value: s, label: stageLabel(t, s) })), match: (c, v) => c.reviewStage === v },
        { id: 'flag', label: t('of.col.attention'), options: (['noCos', 'unmapped', 'untagged', 'marks', 'noAssessments'] as const).map((f) => ({ value: f, label: t(`of.flag.${f}`) })), match: (c, v) => c.flags.includes(v as DashCourse['flags'][number]) },
      ]}
      empty={<EmptyState icon={<Inbox />} title={t('of.home.noCourses')} />}
    />
  );
}

/** The OBE dashboard for whoever opens it: approvals waiting, courses needing attention, heat maps and weak COs. */
export function ObeHome({ data, programId }: { data: ObeDash; programId: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const year = data.year;
  const go = (p: Record<string, string>) => router.push(`/obe?${new URLSearchParams({ ...(year ? { academicYearId: year.id } : {}), ...(programId ? { programId } : {}), ...p })}`);
  const attention = data.courses.filter((c) => c.flags.length);
  const courseHref = (c: { id: string } | { subjectId: string }) => `/obe/courses/${'id' in c ? c.id : c.subjectId}${year ? `?academicYearId=${year.id}` : ''}`;
  const columns: Column<DashCourse>[] = [
    { id: 'course', header: t('of.col.course'), rowHeader: true, sort: (c) => `${c.term}-${c.code}`, cell: (c) => (<span><b className="font-semibold">{c.code}</b> {c.name}<span className="block text-xs text-muted-foreground">{t('of.sem', { n: c.term })}{c.department ? ` · ${c.department}` : ''}</span></span>), csv: (c) => `${c.code} ${c.name}` },
    { id: 'stage', header: t('of.col.cos'), sort: (c) => c.reviewStage, cell: (c) => (<span className="text-[13px]">{c.cos ? t('of.cosMapped', { n: c.cos, mapped: c.mapped }) : '-'}<span className="block text-xs text-muted-foreground">{stageLabel(t, c.reviewStage)}</span></span>), csv: (c) => c.cos },
    { id: 'tags', header: t('of.col.tagged'), align: 'right', hideBelow: 'md', sort: (c) => c.tagged, cell: (c) => `${c.tagged}/${c.assessments}` },
    { id: 'marks', header: t('of.col.marks'), align: 'right', hideBelow: 'md', sort: (c) => c.marksComplete, cell: (c) => `${c.marksComplete}/${c.assessments}` },
    { id: 'att', header: t('of.col.attainment'), align: 'right', sort: (c) => c.attainment, cell: (c) => <LevelCell value={c.attainment} target={2} />, csv: (c) => c.attainment ?? '' },
    { id: 'flags', header: t('of.col.attention'), cell: (c) => <CourseFlags c={c} />, csv: (c) => c.flags.join(' ') },
  ];
  return (
    <div className="flex flex-col gap-6">
      <FormRow>
        <FormField label={t('obe2.f.year')}>
          <TextInput className="min-w-[140px]" select value={year?.id ?? ''} onChange={(e) => go({ academicYearId: e.target.value })} data-testid="of-year">
            {data.years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('obe2.f.programme')}>
          <TextInput className="min-w-[200px]" select value={programId || 'all'} onChange={(e) => go({ programId: e.target.value === 'all' ? '' : e.target.value })} data-testid="of-programme">
            <MenuItem value="all">{t('of.allProgrammes')}</MenuItem>
            {data.programs.map((p) => (
              <MenuItem key={p.id} value={p.id}>
                {p.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
      </FormRow>

      <StatGrid min={160}>
        <StatTile label={t('of.kpi.approvals')} value={fmt.number(data.counts.approvals)} tone={data.counts.approvals ? 'warning' : 'default'} href="/obe/approvals" testId="of-kpi-approvals" />
        <StatTile label={t('of.kpi.courses')} value={fmt.number(data.counts.courses)} caption={t('of.kpi.cos', { n: data.counts.cos })} href="/obe/courses" />
        <StatTile label={t('of.kpi.cosMet')} value={data.counts.cosMeasured ? `${Math.round((data.counts.cosMet / data.counts.cosMeasured) * 100)}%` : '-'} caption={t('of.kpi.cosMetOf', { met: data.counts.cosMet, n: data.counts.cosMeasured })} />
        <StatTile label={t('of.kpi.attention')} value={fmt.number(attention.length)} tone={attention.length ? 'warning' : 'default'} caption={t('of.kpi.attentionSub', { cos: data.counts.noCos, tags: data.counts.untagged, marks: data.counts.marks })} />
        <StatTile label={t('of.kpi.actions')} value={fmt.number(data.counts.actionsOpen)} caption={data.counts.actionsOverdue ? t('of.kpi.overdue', { n: data.counts.actionsOverdue }) : undefined} tone={data.counts.actionsOverdue ? 'warning' : 'default'} href="/obe/actions" />
        <StatTile label={t('of.kpi.surveys')} value={fmt.number(data.counts.surveysOpen)} href="/obe/surveys" />
      </StatGrid>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={t('of.home.pos')} subtitle={t('of.home.posSub')} testId="of-heat-programmes">
          {data.heat.programs.length === 0 ? (
            <EmptyState dense icon={<Target />} title={t('of.home.noProgrammes')} />
          ) : (
            <>
              <HeatGrid label={t('of.col.programme')} rows={data.heat.programs.map((p) => ({ key: p.programId, title: p.name, sub: `${t(`of.fw.${p.framework}` as MessageKey)}${p.computedAt ? ` · ${fmt.date(p.computedAt.slice(0, 10), 'short')}` : ''}`, href: `/obe/attainment?programId=${p.programId}${year ? `&academicYearId=${year.id}` : ''}`, cells: p.outcomes.map((o) => ({ code: o.code, value: o.value, target: o.target })) }))} />
              <div className="mt-3">
                <LevelLegend />
              </div>
            </>
          )}
        </Card>
        <Card title={t('of.home.approvals')} action={<Link className="text-[13px] font-medium" href="/obe/approvals">{t('of.home.all')}</Link>} testId="of-home-approvals">
          {data.approvals.length === 0 ? (
            <EmptyState dense icon={<ClipboardCheck />} title={t('of.home.noApprovals')} />
          ) : (
            <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0">
              {data.approvals.slice(0, 6).map((a) => (
                <li key={a.id} className="rounded-md border p-2.5">
                  <Link href={`/obe/courses/${a.subjectId}?tab=cos`} className="font-medium text-foreground hover:underline">
                    {a.code} {a.subject}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {a.program} · v{a.version} · {stageLabel(t, a.stage)}
                    {a.submittedAt ? ` · ${fmt.date(a.submittedAt.slice(0, 10), 'short')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t('of.home.cos')} subtitle={t('of.home.cosSub')} testId="of-heat-courses">
        {data.heat.courses.length === 0 ? (
          <EmptyState dense icon={<Target />} title={t('of.home.noCourses')} />
        ) : (
          <HeatGrid label={t('of.col.course')} rows={data.heat.courses.map((c) => ({ key: c.subjectId, title: `${c.code} ${c.name}`, sub: `${data.programs.find((p) => p.id === c.programId)?.name ?? ''} · ${t('of.sem', { n: c.term })}`, href: courseHref(c), cells: c.cos.map((x) => ({ code: x.code, value: x.value, target: x.target, href: `${courseHref(c)}${year ? '&' : '?'}tab=attainment` })) }))} />
        )}
      </Card>

      <div className="grid items-start gap-4">
        <Card title={t('of.home.attention')} padded={false} testId="of-attention">
          <DataTable label={t('of.home.attention')} rows={attention} rowId={(c) => c.id} columns={columns} rowHref={courseHref} exportName="obe-attention" pageSize={8} empty={<EmptyState icon={<Inbox />} title={t('of.home.noAttention')} />} />
        </Card>
        <Card title={t('of.home.weak')} subtitle={t('of.home.weakSub')} testId="of-weak">
          {data.weakCos.length === 0 ? (
            <EmptyState dense icon={<Target />} title={t('of.home.noWeak')} />
          ) : (
            <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0 md:grid-cols-2 xl:grid-cols-3">
              {data.weakCos.map((w) => (
                <li key={w.coId} className="flex items-start gap-3 rounded-md border p-2.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <Link href={`/obe/courses/${w.subjectId}?tab=attainment${year ? `&academicYearId=${year.id}` : ''}`} className="font-medium text-foreground hover:underline">
                      {w.code}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">{w.subject}</span>
                    {w.weak.length > 0 && <span className="block truncate text-xs text-muted-foreground">{t('of.home.weakest', { items: w.weak.join(', ') })}</span>}
                  </span>
                  <span className="text-right text-[13px] tabular-nums">
                    {lvl(w.combined)}
                    <span className="block text-xs text-muted-foreground">{t('of.home.gap', { gap: lvl(w.gap) })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
