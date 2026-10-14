import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { AttendanceTabs, DateField, FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { DayPanel, SheetEditor } from '@/components/attendance-desk/MarkDesk';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isDay, isId, type AttendancePolicy, type ClassDay, type DeskClass, type Sheet } from '@/lib/attendance-desk';
import { schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atd.mark.title') };
}

/**
 * Attendance → Mark: a class's day (its periods, special classes, the day or its sessions) and the chosen mark sheet.
 * `?section=&date=` with `slot=`, `special=` or `session=day|fn|an` (a reminder links straight to `slot=&date=`).
 */
export default async function MarkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const today = schoolToday();
  const date = isDay(sp.date) ? sp.date : today;
  const res = await load(async () => {
    const [classes, policy] = await Promise.all([api<DeskClass[]>('/v1/attendance-desk/classes'), api<AttendancePolicy>('/v1/attendance-desk/policy')]);
    let sheet: Sheet | null = null;
    if (isId(sp.slot)) sheet = await api<Sheet>(`/v1/attendance-desk/sheet?slotId=${sp.slot}&date=${date}`);
    else if (isId(sp.special)) sheet = await api<Sheet>(`/v1/attendance-desk/sheet?specialId=${sp.special}`);
    const section = sheet?.section.id ?? (isId(sp.section) && classes.some((c) => c.id === sp.section) ? sp.section : classes[0]?.id);
    if (!sheet && section && (sp.session === 'day' || sp.session === 'fn' || sp.session === 'an')) sheet = await api<Sheet>(`/v1/attendance-desk/sheet?sectionId=${section}&date=${date}${sp.session === 'day' ? '' : `&session=${sp.session}`}`);
    const day = section ? await api<ClassDay>(`/v1/attendance-desk/day?sectionId=${section}&date=${sheet?.date ?? date}`) : null;
    return { classes, policy, section, day, sheet };
  });
  const header = <PageHeader title={t('atd.mark.title')} subtitle={t('atd.mark.subtitle')} />;
  if (res.error !== undefined)
    return (
      <>
        {header}
        <AttendanceTabs value="mark" t={t} />
        <ErrorState message={res.error} />
      </>
    );
  const { classes, policy, section, day, sheet } = res.data;
  const shownDate = sheet?.date ?? date;
  const current = sheet ? (sheet.kind === 'period' ? `slot:${sheet.slotId}` : sheet.kind === 'special' ? `special:${sheet.id}` : `session:${sheet.kind === 'day' ? 'day' : sheet.session}`) : '';
  return (
    <>
      {header}
      <AttendanceTabs value="mark" t={t} />
      {classes.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t('atd.noClasses')}>
          {t('atd.noClassesBody')}
        </EmptyState>
      ) : (
        <>
          <FilterForm submit={t('atd.show')} testId="mark-filters">
            <SelectField label={t('atd.class')} name="section" value={section} options={classes.map((c) => ({ value: c.id, label: c.name, group: c.program }))} minWidth={240} />
            <DateField label={t('atd.date')} name="date" value={shownDate} />
          </FilterForm>
          <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
            {day && <DayPanel day={day} policy={policy} current={current} base={`/attendance/mark?section=${section}&date=${shownDate}`} />}
            {sheet ? (
              <SheetEditor key={`${current}:${shownDate}`} sheet={sheet} />
            ) : (
              <EmptyState icon={<ClipboardList />} title={t('atd.pick')}>
                {t('atd.pickBody')}
              </EmptyState>
            )}
          </div>
        </>
      )}
    </>
  );
}
