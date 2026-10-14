import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { StudentRecords, type StudentKitRow } from '@/components/students/StudentRecords';
import { api, requireSection } from '@/lib/api';
import { canChangeLifecycle, canSee } from '@/lib/access';
import { loadRecords } from '@/lib/records-server';
import { feeStates } from '@/lib/roster';
import { schoolToday } from '@/lib/school';
import type { FeeInvoice } from '@/lib/types';
import { getI18n } from '@/i18n/server';

import { ArrowUpDown as SwapVert, UsersRound as GroupsOutlined } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.students') };
}

/** attendance-governance: class attendance and eligibility are for teaching staff, the principal and the administrator. */
const ATTENDANCE_ROLES = ['teacher', 'hod', 'principal', 'tenant_admin'];
type Eligibility = { thresholdPct: number; students: { studentId: string; effectivePct: number | null; pct: number | null }[] };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('students');
  const sp = await searchParams;
  const roles = me?.roles ?? [];
  const showFees = canSee(roles, 'fees');
  const showAttendance = roles.some((r) => ATTENDANCE_ROLES.includes(r));
  const loaded = await loadRecords<StudentKitRow>('students', sp);
  const { t } = await getI18n();

  // Attendance (after condonation) and fee state for the students on this page only (best effort: a failed call shows "—").
  let rows: StudentKitRow[] = [];
  if (loaded.data) {
    const page = loaded.data.page.rows;
    const sections = [...new Set(page.map((r) => r.sectionId))].slice(0, 60);
    const [eligibility, invoices] = await Promise.all([
      showAttendance ? Promise.all(sections.map((id) => api<Eligibility>(`/v1/attendance/eligibility?sectionId=${id}`).catch(() => null))) : Promise.resolve([]),
      showFees ? api<FeeInvoice[]>('/v1/fees/invoices').catch(() => null) : Promise.resolve(null),
    ]);
    const attendance = new Map<string, number | null>();
    for (const e of eligibility) for (const s of e?.students ?? []) attendance.set(s.studentId, s.effectivePct ?? s.pct);
    const fees = invoices ? feeStates(invoices, schoolToday()) : null;
    rows = page.map((r) => ({ ...r, attendancePct: attendance.get(r.id) ?? null, fee: fees ? (fees.get(r.id)?.state ?? 'none') : null, duePaise: fees?.get(r.id)?.duePaise ?? 0 }));
  }

  return (
    <>
      <PageHeader
        title={t('nav.students')}
        subtitle={loaded.data ? t('ro.subtitle', { n: loaded.data.page.total }) : t('stu.subtitle')}
        actions={
          me && canChangeLifecycle(me.roles) ? (
            <LinkButton href="/students/promotion" variant="outlined" startIcon={<SwapVert />}>
              {t('stu.promotion')}
            </LinkButton>
          ) : undefined
        }
      />
      {loaded.error !== undefined ? (
        <ErrorState message={loaded.error} />
      ) : (
        <StudentRecords
          meta={loaded.data.meta}
          page={{ ...loaded.data.page, rows }}
          state={loaded.data.state}
          showFees={showFees}
          showAttendance={showAttendance}
          canRemind={showFees}
          empty={
            <EmptyState icon={<GroupsOutlined />} title={t('stu.none')} testId="no-students">
              {t('stu.noneBody')}
            </EmptyState>
          }
        />
      )}
    </>
  );
}
