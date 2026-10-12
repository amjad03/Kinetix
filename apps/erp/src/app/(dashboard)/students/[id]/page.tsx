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
import { ApiError, api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import type { StudentProfile } from '@/lib/admissions';
import { statusTone, type AuditRow, type RequestRow } from '@/lib/academics';
import { formatDate, formatMonth } from '@/lib/dates';
import { formatRupees } from '@/lib/money';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

import { Alert, Link } from '@/components/kx';
import { ArrowLeft as ArrowBack } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('stu.profile') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('students');
  const { id } = await params;
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
  return (
    <>
      {back}
      <RecordPage
        profile={{ cover: 'blue', chips: [s.program.name, s.section.displayName, ...(a?.mentor ? [t('v2.prof.mentorChip', { name: a.mentor.fullName })] : [])] }}
        title={s.fullName}
        subtitle={`${s.section.displayName} · ${t('stu.rollNo', { roll: s.rollNo })} · ${s.program.name}`}
        status={{ label: t(`acad.stu.${s.status}` as MessageKey), tone: statusTone(s.status) }}
        facts={[
          { label: t('acad.col.section'), value: <NextLink className="underline" href={`/academics/sections/${s.section.id}`}>{s.section.displayName}</NextLink> },
          { label: t('acad.col.rollNo'), value: s.rollNo },
          { label: t('acad.col.program'), value: s.program.name },
          { label: t('acad.joined'), value: s.enrolledOn ? formatDate(s.enrolledOn, 'long', locale) : '—' },
          { label: t('acad.children'), value: String(s.guardians.length) },
        ]}
        primary={onRolls ? <LinkButton variant="contained" href={`/academics?new=section_change&section=${s.section.id}&student=${s.id}`}>{t('acad.kind.section_change')}</LinkButton> : undefined}
        secondary={onRolls ? <LinkButton variant="outlined" href={`/academics?new=withdrawal&section=${s.section.id}&student=${s.id}`}>{t('acad.kind.withdrawal')}</LinkButton> : undefined}
        overview={
          <>
            {s.finalTerm && s.status === 'active' && (
              <Alert className="mb-4" severity="info">
                {t('stu.finalTerm')}
              </Alert>
            )}
            <div className="grid grid-cols-[1fr] lg:grid-cols-[1fr_1fr] gap-6">
              <div>
                <div className="rounded-[12px] border bg-card p-5">
                  <SectionTitle flush>{t('stu.admission')}</SectionTitle>
                  <p className="text-[13px] leading-[19px]">{s.enrolledOn ? t('stu.joined', { date: formatDate(s.enrolledOn, 'long', locale) }) : t('stu.noJoinDate')}</p>
                  {s.application && (
                    <p className="text-[13px] leading-[19px] mt-1">
                      <Link component={NextLink} href={`/admissions/applications/${s.application.id}`}>
                        {s.application.applicationNo}
                      </Link>{' '}
                      · {s.application.cycleName}
                    </p>
                  )}
                </div>
                <StudentActions student={s} canChange={canChange} canGuardians classes={sameProgram} />
              </div>
              <div className="rounded-[12px] border bg-card p-5">
                <SectionTitle flush>{t('stu.timeline')}</SectionTitle>
                <LifecycleTimeline events={s.timeline} />
              </div>
            </div>
          </>
        }
        related={[
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
                          <span className="text-muted-foreground">{formatDate(x.dueOn, 'long', locale)}</span>
                          <span className="tabular-nums">{formatRupees(x.paidPaise)} / {formatRupees(x.amountPaise)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${x.status === 'paid' ? 'bg-green-soft text-green-ink' : 'bg-amber-soft text-amber-ink'}`}>{x.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            ),
          },
          {
            value: 'mentor',
            label: t('v2.prof.mentor'),
            content: (
              <div className={box}>
                {a?.mentor ? (
                  <NextLink href={`/hr/staff/${a.mentor.id}`} className="flex items-center gap-3 hover:underline">
                    <span className="grid size-10 place-items-center rounded-full bg-violet-500/12 font-semibold text-violet-700">{a.mentor.fullName.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                    <span>
                      <b className="block">{a.mentor.fullName}</b>
                      <span className="text-xs text-muted-foreground">{t('v2.prof.mentorSince', { date: formatDate(a.mentor.startedOn, 'long', locale) })}</span>
                    </span>
                  </NextLink>
                ) : (
                  empty('v2.prof.noMentor')
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
