import type { Metadata } from 'next';
import { AdmissionsDashboard } from '@/components/dashboard/AdmissionsDashboard';
import { ExamsDashboard } from '@/components/dashboard/ExamsDashboard';
import { FinanceDashboard } from '@/components/dashboard/FinanceDashboard';
import { HodDashboard } from '@/components/dashboard/HodDashboard';
import { HrDashboard } from '@/components/dashboard/HrDashboard';
import { PrincipalDashboard } from '@/components/dashboard/PrincipalDashboard';
import { DateNav } from '@/components/DateNav';
import { PageHeader } from '@/components/PageHeader';
import { LinkTabs } from '@/components/ui/Tabs';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { greetingName, personaFor, viewFrom, viewsFor, VIEW_LABEL, type View } from '@/lib/dashboard';
import { dateParam, schoolToday } from '@/lib/school';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.dashboard') };
}

/**
 * The dashboard for the signed-in role: what needs action today. The principal and administrator
 * get the school overview and can switch to the exam, finance, admissions and HR desks; the head of
 * department, accounts office, admissions officer and HR manager each get their own.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const me = await requireSection('dashboard');
  if (!me) return null;
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const today = schoolToday();
  const date = dateParam(sp.date);
  const persona = personaFor(me.roles);
  const view = viewFrom(sp.view, me.roles);
  const views = viewsFor(me.roles);
  const href = (v: View) => (v === 'overview' ? '/' : `/?view=${v}`);
  const showDate = view === 'overview' && persona === 'principal';

  return (
    <>
      <PageHeader
        title={t('dash.welcome', { name: greetingName(me.fullName) })}
        subtitle={showDate && date !== today ? fmt.date(date, 'long') : t('dash.subtitle', { date: fmt.date(today, 'long') })}
        actions={showDate ? <DateNav date={date} today={today} /> : undefined}
      />
      {views.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <LinkTabs value={view} label={t('dash.views')} items={views.map((v) => ({ value: v, label: t(VIEW_LABEL[v]), href: href(v) }))} />
        </div>
      )}
      {view === 'exams' ? (
        <ExamsDashboard today={today} />
      ) : view === 'finance' || (view === 'overview' && persona === 'accountant') ? (
        <FinanceDashboard me={me} today={today} />
      ) : view === 'admissions' || (view === 'overview' && persona === 'admissions') ? (
        <AdmissionsDashboard />
      ) : view === 'hr' || (view === 'overview' && persona === 'hr') ? (
        <HrDashboard me={me} today={today} />
      ) : persona === 'hod' ? (
        <HodDashboard me={me} today={today} />
      ) : (
        <PrincipalDashboard me={me} date={date} today={today} />
      )}
    </>
  );
}
