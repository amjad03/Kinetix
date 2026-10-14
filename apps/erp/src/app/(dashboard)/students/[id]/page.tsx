import NextLink from 'next/link';
import type { MessageKey } from '@/i18n/messages';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RequestList } from '@/components/academics/shared';
import { RecordPage } from '@/components/templates';
import { LinkButton } from '@/components/LinkButton';
import { SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LifecycleTimeline } from '@/components/students/LifecycleTimeline';
import { StudentActions } from '@/components/students/StudentActions';
import { StudentClearancesTab } from '@/components/students/StudentClearancesTab';
import { StudentDetailsTab } from '@/components/students/StudentDetailsTab';
import type { ChangeRequest, Clearance, StudentDetails } from '@/lib/student-info';
import { ApiError, api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import type { StudentProfile } from '@/lib/admissions';
import { statusTone, type AuditRow, type RequestRow } from '@/lib/academics';
import { formatDate, formatMonth } from '@/lib/dates';
import { formatRupees } from '@/lib/money';
import type { Structure } from '@/lib/types';
import { getI18n, isSchoolTenant } from '@/i18n/server';

import { Alert } from '@/components/kx';
import { ArrowLeft as ArrowBack, BookOpen, Cake, CalendarDays, CircleCheck, Droplet, Hash, IdCard, Mail, Phone, School, UserRound, Users } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('stu.profile') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('students');
  const { id } = await params;
  const { tab } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { t, locale } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<StudentProfile>(`/v1/students/${id}/profile`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href="/students" size="small" startIcon={<ArrowBack />}>
        {t('nav.students')}
      </LinkButton>
    </div>
  );
  if (res.error !== undefined) {
    return (
      <>
        {back}
        <ErrorState message={res.error} />
      </>
    );
  }
  const s = res.data;
  const canChange = me ? canChangeLifecycle(me.roles) : false;
  const structure = canChange ? await load(() => api<Structure>('/v1/admin/structure')) : undefined;
  const sameProgram = (structure?.data?.sections ?? []).filter((x) => x.programId === s.program.id && x.id !== s.section.id).map((x) => ({ id: x.id, name: x.displayName }));
  const roles = me?.roles ?? [];
  const [details, changeRequests, clearances] = await Promise.all([
    load(() => api<StudentDetails>(`/v1/students/${id}/details`)),
    load(() => api<ChangeRequest[]>(`/v1/students/${id}/change-requests`)),
    load(() => api<Clearance[]>(`/v1/students/${id}/clearances`)),
  ]);
  const [requests, activity, att, marks, fees] = await Promise.all([
    load(() => api<RequestRow[]>(`/v1/academics/requests?studentId=${id}`)),
    load(() => api<AuditRow[]>(`/v1/academics/activity/${id}`)),
    load(() => api<{ present: number; total: number; percent: number | null; months: { month: string; present: number; total: number }[]; mentor: { id: string; fullName: string; startedOn: string } | null }>(`/v1/profiles/students/${id}/attendance`)),
    load(() => api<{ subjects: { subject: string; percent: number }[] }>(`/v1/marks/students/${id}`)),
    load(() => api<{ duePaise: number; invoices: { id: string; title: string; amountPaise: number; paidPaise: number; dueOn: string; status: string }[] }>(`/v1/fees/students/${id}`)),
  ]);
  const a = att.data;
  const subjects = marks.data?.subjects ?? [];
  const invoices = fees.data?.invoices ?? [];
  const box = 'rounded-[12px] border bg-card p-5';
  const empty = (k: MessageKey) => <p className="text-sm text-muted-foreground">{t(k)}</p>;
  const reqRows = requests.data ?? [];
  const onRolls = ['active', 'enrolled', 'on_leave', 'detained'].includes(s.status);
  const school = await isSchoolTenant();
  const short = (d: string) => formatDate(d, 'day', locale);
  const ab = s.about;
  // The student's own profile details win over what the application said.
  const prof = Object.fromEntries((details.data?.fields ?? []).map((f) => [f.key, f.value])) as Record<string, string | null>;
  const dob = prof.dateOfBirth ?? ab?.dateOfBirth ?? null;
  const gender = prof.gender ?? ab?.gender ?? null;
  const primaryG = s.guardians.find((g) => g.isPrimary) ?? s.guardians[0];
  const none = <span className="font-normal text-muted-foreground">{t('pf.none')}</span>;
  return (
    <>
      {back}
      <RecordPage
        profile={{
          kind: t('pf.kindStudent'),
          meta: [
            { icon: <School aria-hidden />, text: s.section.displayName },
            { icon: <Hash aria-hidden />, text: t('stu.rollNo', { roll: s.rollNo }) },
            ...(school ? [] : [{ icon: <BookOpen aria-hidden />, text: s.program.name }]),
            ...(s.enrolledOn ? [{ icon: <CalendarDays aria-hidden />, text: t('pf.joined', { date: short(s.enrolledOn) }) }] : []),
          ],
          about: [
            {
              title: t('pf.about'),
              rows: [
                { icon: <UserRound aria-hidden />, label: t('pf.fullName'), value: s.fullName },
                { icon: <CircleCheck aria-hidden />, label: t('pf.status'), value: t(`acad.stu.${s.status}` as MessageKey) },
                { icon: <School aria-hidden />, label: t('pf.classRoll'), value: <><NextLink className="underline-offset-2 hover:underline" href={`/academics/sections/${s.section.id}`}>{s.section.displayName}</NextLink> · {s.rollNo}</> },
                { icon: <BookOpen aria-hidden />, label: school ? t('pf.stage') : t('acad.col.program'), value: s.program.name },
                ...(s.application ? [{ icon: <IdCard aria-hidden />, label: t('pf.admissionNo'), value: <NextLink className="underline-offset-2 hover:underline" href={`/admissions/applications/${s.application.id}`}>{s.application.applicationNo}</NextLink> }] : []),
                ...(prof.admissionNo ? [{ icon: <Hash aria-hidden />, label: t('si.f.admissionNo'), value: prof.admissionNo }] : []),
                { icon: <Cake aria-hidden />, label: t('pf.dob'), value: dob ? short(dob) : none },
                ...(gender ? [{ icon: <UserRound aria-hidden />, label: t('pf.gender'), value: ['male', 'female', 'other'].includes(gender) ? t(`si.o.gender.${gender}` as MessageKey) : <span className="capitalize">{gender}</span> }] : []),
                { icon: <Droplet aria-hidden />, label: t('pf.blood'), value: ab?.bloodGroup ?? none },
                { icon: <CalendarDays aria-hidden />, label: t('acad.joined'), value: s.enrolledOn ? short(s.enrolledOn) : none },
              ],
            },
            {
              title: t('pf.contacts'),
              rows: [
                { icon: <Phone aria-hidden />, label: t('pf.phone'), value: ab?.phone ?? primaryG?.phone ?? none },
                { icon: <Mail aria-hidden />, label: t('pf.email'), value: ab?.email ?? primaryG?.email ?? none },
              ],
            },
            {
              title: t('pf.guardians'),
              rows: s.guardians.length
                ? s.guardians.map((g) => ({ icon: <Users aria-hidden />, label: g.relation, value: <>{g.fullName}{g.phone ? <span className="text-muted-foreground"> · {g.phone}</span> : null}</> }))
                : [{ icon: <Users aria-hidden />, label: t('pf.guardians'), value: none }],
            },
          ],
          side: [
            {
              title: t('pf.guardians'),
              content: s.guardians.length ? (
                <ul className="grid gap-2">
                  {s.guardians.map((g) => (
                    <li key={g.id} className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">{g.fullName.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                      <span className="min-w-0 flex-1">
                        {g.userId ? <NextLink className="block truncate text-sm font-medium hover:underline" href={`/academics/guardians/${g.userId}`}>{g.fullName}</NextLink> : <b className="block truncate text-sm font-medium">{g.fullName}</b>}
                        <span className="text-xs text-muted-foreground capitalize">{g.relation}{g.isPrimary ? ` · ${t('acad.primary')}` : ''}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                empty('pf.noGuardians')
              ),
            },
            {
              title: t('pf.mentor'),
              content: a?.mentor ? (
                <NextLink href={`/hr/staff/${a.mentor.id}`} className="flex items-center gap-3 hover:underline">
                  <span className="grid size-9 place-items-center rounded-lg bg-violet-500/12 text-xs font-semibold text-violet-700 dark:text-violet-300">{a.mentor.fullName.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-medium">{a.mentor.fullName}</b>
                    <span className="text-xs text-muted-foreground">{t('v2.prof.mentorSince', { date: short(a.mentor.startedOn) })}</span>
                  </span>
                </NextLink>
              ) : (
                empty('v2.prof.noMentor')
              ),
            },
          ],
        }}
        title={s.fullName}
        status={{ label: t(`acad.stu.${s.status}` as MessageKey), tone: statusTone(s.status) }}
        primary={onRolls ? <LinkButton variant="contained" href={`/academics?new=section_change&section=${s.section.id}&student=${s.id}`}>{t('acad.kind.section_change')}</LinkButton> : undefined}
        secondary={onRolls ? <LinkButton variant="outlined" href={`/academics?new=withdrawal&section=${s.section.id}&student=${s.id}`}>{t('acad.kind.withdrawal')}</LinkButton> : undefined}
        overview={
          <>
            {s.finalTerm && s.status === 'active' && (
              <Alert className="mb-4" severity="info">
                {t('stu.finalTerm')}
              </Alert>
            )}
            <div className="grid grid-cols-[1fr] gap-6 lg:grid-cols-[1fr_1.55fr]">
              <div className="min-w-0">
                <StudentActions student={s} canChange={canChange} canGuardians classes={sameProgram} />
              </div>
              <div className="rounded-[12px] border bg-card p-5">
                <SectionTitle flush>{t('stu.timeline')}</SectionTitle>
                <LifecycleTimeline events={s.timeline} />
              </div>
            </div>
          </>
        }
        initialTab={tab === 'details' || tab === 'clearances' ? tab : undefined}
        related={[
          {
            value: 'details',
            label: t('si.tab.details'),
            count: (changeRequests.data ?? []).filter((r) => r.status === 'pending').length || undefined,
            content: details.data ? (
              <StudentDetailsTab details={details.data} requests={changeRequests.data ?? []} canDecide={roles.some((r) => ['tenant_admin', 'principal', 'admissions_officer'].includes(r))} />
            ) : (
              <ErrorState message={details.error ?? ''} />
            ),
          },
          {
            value: 'clearances',
            label: t('si.tab.clearances'),
            count: (clearances.data ?? []).length,
            content: <StudentClearancesTab studentId={s.id} clearances={clearances.data ?? []} canStart={roles.some((r) => ['tenant_admin', 'principal', 'admissions_officer'].includes(r))} />,
          },
          {
            value: 'guardians',
            label: t('acad.guardians'),
            count: s.guardians.length,
            content: (
              <ul className="grid gap-3">
                {s.guardians.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[12px] border bg-card p-4">
                    {g.userId ? <NextLink className="font-medium underline" href={`/academics/guardians/${g.userId}`}>{g.fullName}</NextLink> : <span className="font-medium">{g.fullName}</span>}
                    <span className="text-sm text-muted-foreground">{g.relation}{g.isPrimary ? ` · ${t('acad.primary')}` : ''}</span>
                    <span className="text-sm">{g.phone ?? ''}</span>
                  </li>
                ))}
              </ul>
            ),
          },
          {
            value: 'academics',
            label: t('v2.prof.academics'),
            count: subjects.length,
            content: (
              <div className={box}>
                {subjects.length === 0
                  ? empty('v2.prof.noMarks')
                  : (
                    <ul className="grid gap-3">
                      {subjects.map((x) => (
                        <li key={x.subject} className="grid grid-cols-[minmax(0,1fr)_120px_48px] items-center gap-3 text-sm">
                          <span className="truncate">{x.subject}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-muted"><i className={`block h-full rounded-full ${x.percent >= 60 ? 'bg-teal' : x.percent >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, x.percent)}%` }} /></span>
                          <b className="text-right tabular-nums">{x.percent}%</b>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            ),
          },
          {
            value: 'attendance',
            label: t('v2.prof.attendance'),
            content: (
              <div className={box}>
                {!a || a.total === 0
                  ? empty('v2.prof.noAttendance')
                  : (
                    <>
                      <p className="text-sm">{t('v2.prof.attSummary', { percent: a.percent ?? 0, present: a.present, total: a.total })}</p>
                      <div className="mt-4 flex h-36 items-end gap-3" role="img" aria-label={t('v2.prof.attByMonth')}>
                        {a.months.map((m) => {
                          const pct = m.total ? Math.round((m.present / m.total) * 100) : 0;
                          return (
                            <div key={m.month} className="flex flex-1 flex-col items-center gap-1 text-xs">
                              <span className="tabular-nums">{pct}%</span>
                              <span className={`w-full max-w-10 rounded-t-md ${pct >= 75 ? 'bg-teal' : 'bg-amber-500'}`} style={{ height: `${Math.max(4, pct)}%` }} />
                              <span className="text-muted-foreground">{formatMonth(`${m.month}-01`, locale)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
              </div>
            ),
          },
          {
            value: 'fees',
            label: t('v2.prof.fees'),
            count: invoices.length,
            content: (
              <div className={box}>
                {fees.data && <p className="mb-3 text-sm">{t('v2.prof.feesDue', { amount: formatRupees(fees.data.duePaise) })}</p>}
                {invoices.length === 0
                  ? empty('v2.prof.noFees')
                  : (
                    <ul className="divide-y">
                      {invoices.map((x) => (
                        <li key={x.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium">{x.title}</span>
                          <span className="text-muted-foreground">{short(x.dueOn)}</span>
                          <span className="tabular-nums">{formatRupees(x.paidPaise)} / {formatRupees(x.amountPaise)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${x.status === 'paid' ? 'bg-green-soft text-green-ink' : 'bg-amber-soft text-amber-ink'}`}>{x.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            ),
          },
          { value: 'requests', label: t('acad.tab.requests'), count: reqRows.length, content: <RequestList rows={reqRows} label={t('acad.tab.requests')} /> },
        ]}
        documents={[
          { id: 'passport', name: t('v2.prof.docPassport'), href: `/api/download?kind=passport&id=${s.id}`, meta: 'PDF' },
          { id: 'progress', name: t('v2.prof.docProgress'), href: `/api/download?kind=progress-report&id=${s.id}`, meta: 'PDF' },
        ]}
        activity={(activity.data ?? []).map((a) => {
          const key = `acad.audit.${a.action}`;
          const label = t(key as MessageKey);
          return { id: String(a.id), at: a.at, actor: a.actor ?? t('acad.system'), action: label === key ? a.action.replace(/[._]/g, ' ') : label };
        })}
      />
    </>
  );
}
