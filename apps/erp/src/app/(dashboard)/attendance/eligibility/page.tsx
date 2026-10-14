import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { AlertsLog, ClassEligibility, DetentionTable } from '@/components/attendance-desk/EligibilityViews';
import { AttendanceTabs, FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isId, type AlertRow, type DeskClass, type DetentionRow, type Eligibility } from '@/lib/attendance-desk';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atd.elig.title') };
}

type View = 'class' | 'programme' | 'alerts';

/**
 * Attendance → Eligibility: a class's eligibility under the rules in force (the affiliating university's profile),
 * the detention list across a programme, and the shortage alerts sent.
 */
export default async function EligibilityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const lead = roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod');
  const admin = roles.some((r) => r === 'principal' || r === 'tenant_admin');
  const view: View = lead && (sp.view === 'programme' || sp.view === 'alerts') ? sp.view : 'class';
  const header = (
    <>
      <PageHeader title={t('atd.elig.title')} subtitle={t('atd.elig.subtitle')} />
      <AttendanceTabs value="eligibility" t={t} />
      {lead && (
        <LinkTabs
          value={view}
          label={t('atd.elig.title')}
          items={(['class', 'programme', 'alerts'] as const).map((v) => ({ value: v, label: t(`atd.elig.view.${v}`), href: `/attendance/eligibility?view=${v}` }))}
        />
      )}
    </>
  );

  if (view === 'alerts') {
    const res = await load(() => api<AlertRow[]>('/v1/attendance-desk/alerts'));
    return (
      <>
        {header}
        {res.error !== undefined ? <ErrorState message={res.error} /> : <AlertsLog rows={res.data} canSend={admin} />}
      </>
    );
  }

  if (view === 'programme') {
    const res = await load(async () => {
      const structure = await api<Structure>('/v1/admin/structure');
      const q = new URLSearchParams({ ...(isId(sp.programme) ? { programId: sp.programme } : {}), ...(sp.term && /^\d{1,2}$/.test(sp.term) ? { term: sp.term } : {}) });
      const list = await api<{ classes: number; eligible: number; rows: DetentionRow[] }>(`/v1/attendance-desk/detention?${q.toString()}`);
      return { structure, list };
    });
    return (
      <>
        {header}
        {res.error !== undefined ? (
          <ErrorState message={res.error} />
        ) : (
          <>
            <FilterForm submit={t('atd.show')} hidden={{ view: 'programme' }}>
              <SelectField label={t('atd.programme')} name="programme" value={sp.programme} options={res.data.structure.programs.map((p) => ({ value: p.id, label: p.name }))} empty={t('atd.all')} />
              <SelectField label={t('atd.term')} name="term" value={sp.term} options={Array.from({ length: Math.max(0, ...res.data.structure.programs.map((p) => p.termCount)) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} empty={t('atd.all')} minWidth={120} />
            </FilterForm>
            <p className="mb-3 text-sm text-muted-foreground">{t('atd.detention.summary', { classes: res.data.list.classes, eligible: res.data.list.eligible, short: res.data.list.rows.length })}</p>
            <DetentionTable rows={res.data.list.rows} />
          </>
        )}
      </>
    );
  }

  const res = await load(async () => {
    const classes = await api<DeskClass[]>('/v1/attendance-desk/classes');
    const section = isId(sp.section) && classes.some((c) => c.id === sp.section) ? sp.section : classes[0]?.id;
    const data = section ? await api<Eligibility>(`/v1/attendance/eligibility?sectionId=${section}`) : null;
    return { classes, section, data };
  });
  return (
    <>
      {header}
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : !res.data.section || !res.data.data ? (
        <EmptyState icon={<GraduationCap />} title={t('atd.noClasses')}>
          {t('atd.noClassesBody')}
        </EmptyState>
      ) : (
        <>
          <FilterForm submit={t('atd.show')}>
            <SelectField label={t('atd.class')} name="section" value={res.data.section} options={res.data.classes.map((c) => ({ value: c.id, label: c.name, group: c.program }))} minWidth={240} />
          </FilterForm>
          <ClassEligibility data={res.data.data} sectionId={res.data.section} canAlert={admin} />
        </>
      )}
    </>
  );
}
