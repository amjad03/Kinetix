import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { StudentRoster } from '@/components/students/StudentRoster';
import { api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle, canSee } from '@/lib/access';
import type { StudentRow } from '@/lib/admissions';
import { buildRoster } from '@/lib/roster';
import { schoolToday } from '@/lib/school';
import type { FeeInvoice, Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

import { ArrowUpDown as SwapVert, UsersRound as GroupsOutlined } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.students') };
}

/** attendance-governance: class attendance and eligibility are for teaching staff, the principal and the administrator. */
const ATTENDANCE_ROLES = ['teacher', 'hod', 'principal', 'tenant_admin'];
type Eligibility = { thresholdPct: number; students: { studentId: string; effectivePct: number | null; pct: number | null }[] };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireSection('students');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const roles = me?.roles ?? [];
  const showFees = canSee(roles, 'fees');
  const showAttendance = roles.some((r) => ATTENDANCE_ROLES.includes(r));
  const [rows, structure, invoices] = await Promise.all([
    load(() => api<StudentRow[]>('/v1/students')),
    load(() => api<Structure>('/v1/admin/structure')),
    showFees ? load(() => api<FeeInvoice[]>('/v1/fees/invoices')) : Promise.resolve(null),
  ]);
  // Overall attendance after condonation, one call per class on the roll (best effort: a failed class shows "—").
  let attendance: Map<string, number | null> | null = null;
  if (showAttendance && rows.data) {
    attendance = new Map();
    const sections = [...new Set(rows.data.map((r) => r.sectionId))].slice(0, 60);
    const all = await Promise.all(sections.map((id) => api<Eligibility>(`/v1/attendance/eligibility?sectionId=${id}`).catch(() => null)));
    for (const e of all) for (const s of e?.students ?? []) attendance.set(s.studentId, s.effectivePct ?? s.pct);
  }
  const { t } = await getI18n();
  const roster = rows.data ? buildRoster(rows.data, structure.data ?? null, invoices?.data ?? null, attendance, schoolToday()) : [];
  return (
    <>
      <PageHeader
        title={t('nav.students')}
        subtitle={rows.data ? t('ro.subtitle', { n: rows.data.length }) : t('stu.subtitle')}
        actions={
          me && canChangeLifecycle(me.roles) ? (
            <LinkButton href="/students/promotion" variant="outlined" startIcon={<SwapVert />}>
              {t('stu.promotion')}
            </LinkButton>
          ) : undefined
        }
      />
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : rows.data.length === 0 ? (
        <EmptyState icon={<GroupsOutlined />} title={t('stu.none')} testId="no-students">
          {t('stu.noneBody')}
        </EmptyState>
      ) : (
        <StudentRoster rows={roster} initialQuery={q} canRemind={showFees} showFees={showFees && !!invoices?.data} showAttendance={showAttendance} />
      )}
    </>
  );
}
