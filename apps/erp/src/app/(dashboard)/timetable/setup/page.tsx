import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { PlanningRecords, type PlanningEntity } from '@/components/academics/PlanningRecords';
import { BatchesEditor, type BatchData } from '@/components/timetable/BatchesEditor';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs, StatGrid, StatTile } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isId, type DeskClass } from '@/lib/attendance-desk';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.timetableSetup') };
}

const TABS = ['periods', 'special', 'days', 'batches'] as const;
type Tab = (typeof TABS)[number];
const ENTITY: Record<Exclude<Tab, 'batches'>, PlanningEntity> = { periods: 'period-structures', special: 'special-classes', days: 'working-days' };

interface WorkingDays {
  from: string;
  to: string;
  total: number;
  structure: { id: string; name: string } | null;
  months: { month: string; days: number; holidays: number; swaps: number }[];
}

/**
 * Timetable → Setup: bell schedules (period structures), special and extra classes, compensatory working days with
 * the working-day count by month, and lab or tutorial batches of a class.
 */
export default async function TimetableSetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('timetable');
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'periods';
  const { t, fmt } = await getI18n();
  const canEdit = (me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod');
  const head = (
    <>
      <PageHeader title={t('nav.timetableSetup')} subtitle={t('tts.subtitle')} />
      <LinkTabs value={tab} label={t('nav.timetableSetup')} items={TABS.map((x) => ({ value: x, label: t(`tts.tab.${x}`), href: `/timetable/setup?tab=${x}` }))} />
    </>
  );

  if (tab === 'batches') {
    const section = typeof sp.section === 'string' ? sp.section : undefined;
    const res = await load(async () => {
      const classes = await api<DeskClass[]>('/v1/attendance-desk/classes');
      const id = isId(section) && classes.some((c) => c.id === section) ? section : classes[0]?.id;
      return { classes, data: id ? await api<BatchData>(`/v1/academic-planning/batches?sectionId=${id}`) : null };
    });
    return (
      <>
        {head}
        {res.error !== undefined ? (
          <ErrorState message={res.error} />
        ) : !res.data.data ? (
          <EmptyState icon={<Users />} title={t('atd.noClasses')}>
            {t('atd.noClassesBody')}
          </EmptyState>
        ) : (
          <>
            <FilterForm submit={t('atd.show')} hidden={{ tab: 'batches' }}>
              <SelectField label={t('atd.class')} name="section" value={res.data.data.section.id} options={res.data.classes.map((c) => ({ value: c.id, label: c.name, group: c.program }))} minWidth={240} />
            </FilterForm>
            <p className="mb-4 text-sm text-muted-foreground">{t('tts.batchesHelp')}</p>
            <BatchesEditor data={res.data.data} canEdit={canEdit} />
          </>
        )}
      </>
    );
  }

  const entity = ENTITY[tab];
  const [records, days] = await Promise.all([loadRecords(entity, sp), tab === 'days' ? load(() => api<WorkingDays>('/v1/academic-planning/working-days')) : Promise.resolve(null)]);
  return (
    <>
      {head}
      {days?.data && (
        <section aria-label={t('tts.workingDays')} className="mb-6">
          <p className="mb-3 text-sm text-muted-foreground">{t('tts.workingDaysHelp', { from: fmt.date(days.data.from, 'short'), to: fmt.date(days.data.to, 'short'), n: fmt.number(days.data.total) })}</p>
          <StatGrid min={140}>
            {days.data.months.map((m) => (
              <StatTile key={m.month} label={fmt.month(`${m.month}-01`)} value={fmt.number(m.days)} caption={t('tts.monthCaption', { h: fmt.number(m.holidays), s: fmt.number(m.swaps) })} />
            ))}
          </StatGrid>
        </section>
      )}
      {records.error !== undefined ? <ErrorState message={records.error} /> : <PlanningRecords entity={entity} tab={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} />}
    </>
  );
}
