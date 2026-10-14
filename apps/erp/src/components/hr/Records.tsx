'use client';
import { BriefcaseBusiness, Building2, Cake, CalendarDays, CircleCheck, Clock, IdCard, Mail, Phone, School, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { HrApproval, LOAN_TONE, ServiceBook } from '@/components/hr/HrFlow';
import { LeaveExtras } from '@/components/hr/LeaveExtras';
import { HrList, type HrListData } from '@/components/hr/HrList';
import { LinkButton } from '@/components/LinkButton';
import { RunDetail } from '@/components/payroll/RunDetail';
import { RecordPage, WorkflowStepper, type ActivityItem, type RecordDocument } from '@/components/templates';
import { Card, DataTable, StatusPill, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate, formatDateTime, formatMonth } from '@/lib/dates';
import { downloadUrl } from '@/lib/hr';
import { leaveSteps, linearSteps, runSteps, type ServiceBookEntry, type StaffLoan } from '@/lib/hr-flow';
import type { Appraisal, AppraisalCategory, SeparationDetail, TrainingRecord } from '@/lib/hr-lifecycle';
import type { JobApplicant, JobOpening, LeaveRequest, PayrollRunDetail, Payslip, StaffOverview, StaffProfile } from '@/lib/hr-types';
import { formatRupees } from '@/lib/money';

function useFmt() {
  const { t, locale } = useI18n();
  return { t, locale, d: (x: string | null | undefined) => (x ? formatDate(x, 'day', locale) : '–'), m: (ym: string) => formatMonth(`${ym}-01`, locale) };
}

function Details({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="mt-1 text-sm font-medium whitespace-pre-line">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const STAFF_TONE: Record<string, Tone> = { active: 'success', on_notice: 'warning', exited: 'neutral' };

function StaffTabs(o: StaffOverview, { t, m }: ReturnType<typeof useFmt>) {
  const tile = (label: string, value: ReactNode) => (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
  return [
    {
      value: 'classes',
      label: t('v2.prof.classes'),
      count: o.classes.length,
      content: (
        <Card>
          {o.classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('v2.prof.noClasses')}</p>
          ) : (
            <ul className="divide-y">
              {o.classes.map((c) => (
                <li key={c.sectionId + c.subject} className="flex items-center gap-3 py-2.5 text-sm">
                  <a className="font-medium hover:underline" href={`/academics/sections/${c.sectionId}`}>{c.section}</a>
                  <span className="flex-1 text-muted-foreground">{c.subject}</span>
                  <span className="tabular-nums text-muted-foreground">{t('v2.prof.periods', { n: c.periods })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ),
    },
    {
      value: 'attendance',
      label: t('v2.prof.attendance'),
      content: (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tile(t('v2.prof.attPercent'), o.attendance.percent === null ? '–' : `${o.attendance.percent}%`)}
          {tile(t('v2.prof.present'), o.attendance.present)}
          {tile(t('v2.prof.absent'), o.attendance.absent)}
          {tile(t('v2.prof.onLeave'), o.attendance.leave)}
        </div>
      ),
    },
    {
      value: 'payroll',
      label: t('v2.prof.payroll'),
      count: o.payslips.length,
      content: (
        <Card>
          {o.payslips.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('v2.prof.noPayslips')}</p>
          ) : (
            <ul className="divide-y">
              {o.payslips.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="flex-1 font-medium">{m(p.month)}</span>
                  <span className="text-muted-foreground">{t('v2.prof.gross', { amount: formatRupees(p.grossPaise) })}</span>
                  <b className="tabular-nums">{formatRupees(p.netPaise)}</b>
                  <a className="text-xs underline" href={downloadUrl.payslip(p.id)}>PDF</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ),
    },
    {
      value: 'mentees',
      label: t('v2.prof.mentees'),
      count: o.mentees.length,
      content: (
        <Card>
          {o.mentees.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('v2.prof.noMentees')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {o.mentees.map((m) => (
                <li key={m.studentId}>
                  <a href={`/students/${m.studentId}`} className="flex items-center gap-2.5 rounded-lg border p-2.5 text-sm hover:bg-muted">
                    <span className="grid size-8 place-items-center rounded-full bg-violet-500/12 text-xs font-semibold text-violet-700">{m.fullName.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                    <span className="min-w-0">
                      <b className="block truncate font-medium">{m.fullName}</b>
                      <span className="text-xs text-muted-foreground">{m.section}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ),
    },
  ];
}

export function StaffRecord({ s, book, leave, loans, training, activity, canAdd, overview }: { s: StaffProfile; book: ServiceBookEntry[]; leave: LeaveRequest[]; loans: StaffLoan[]; training: TrainingRecord[]; activity: ActivityItem[]; canAdd: boolean; overview?: StaffOverview | null }) {
  const fmt = useFmt();
  const { t, d, locale } = fmt;
  const sd = (x: string | null | undefined) => (x ? formatDate(x, 'day', locale) : '–');
  return (
    <RecordPage
      profile={{
        kind: t('pf.kindStaff'),
        chips: s.roles.map((r) => t(`role.${r}` as MessageKey)),
        meta: [
          ...(s.designation ? [{ icon: <BriefcaseBusiness aria-hidden />, text: s.designation.name }] : []),
          ...(s.department ? [{ icon: <Building2 aria-hidden />, text: s.department.name }] : []),
          ...(s.dateOfJoining ? [{ icon: <CalendarDays aria-hidden />, text: t('pf.joined', { date: sd(s.dateOfJoining) }) }] : []),
        ],
        about: [
          {
            title: t('pf.about'),
            rows: [
              { icon: <UserRound aria-hidden />, label: t('pf.fullName'), value: s.fullName },
              { icon: <CircleCheck aria-hidden />, label: t('pf.status'), value: s.status ? t(`hr.status.${s.status}` as MessageKey) : '–' },
              { icon: <IdCard aria-hidden />, label: t('pf.code'), value: s.employeeCode ?? '–' },
              { icon: <BriefcaseBusiness aria-hidden />, label: t('pf.designation'), value: s.designation?.name ?? '–' },
              { icon: <Building2 aria-hidden />, label: t('pf.department'), value: s.department?.name ?? '–' },
              { icon: <Cake aria-hidden />, label: t('pf.dob'), value: sd(s.dateOfBirth) },
              { icon: <CalendarDays aria-hidden />, label: t('hf.staff.joined'), value: sd(s.dateOfJoining) },
              { icon: <Clock aria-hidden />, label: t('hf.staff.type'), value: s.employmentType ? t(`hf.emp.${s.employmentType}` as MessageKey) : '–' },
            ],
          },
          {
            title: t('pf.contacts'),
            rows: [
              { icon: <Phone aria-hidden />, label: t('pf.phone'), value: s.phone ?? '–' },
              { icon: <Mail aria-hidden />, label: t('pf.email'), value: s.email ?? '–' },
            ],
          },
        ],
        side: overview
          ? [
              {
                title: t('v2.prof.classes'),
                content: overview.classes.length ? (
                  <ul className="grid gap-2">
                    {overview.classes.slice(0, 5).map((c) => (
                      <li key={c.sectionId + c.subject} className="flex items-center gap-3 text-sm">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted [&_svg]:size-4"><School aria-hidden /></span>
                        <span className="min-w-0 flex-1">
                          <a className="block truncate font-medium hover:underline" href={`/academics/sections/${c.sectionId}`}>{c.section}</a>
                          <span className="block truncate text-xs text-muted-foreground">{c.subject}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('v2.prof.noClasses')}</p>
                ),
              },
              {
                title: t('pf.mentees'),
                content: overview.mentees.length ? (
                  <ul className="grid gap-2">
                    {overview.mentees.slice(0, 5).map((m) => (
                      <li key={m.studentId}>
                        <a href={`/students/${m.studentId}`} className="flex items-center gap-3 text-sm hover:underline">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">{m.fullName.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                          <span className="min-w-0">
                            <b className="block truncate font-medium">{m.fullName}</b>
                            <span className="block truncate text-xs text-muted-foreground">{m.section}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('v2.prof.noMentees')}</p>
                ),
              },
            ]
          : undefined,
      }}
      title={s.fullName}
      status={s.status ? { label: t(`hr.status.${s.status}` as MessageKey), tone: STAFF_TONE[s.status] } : undefined}
      facts={[]}
      secondary={
        <>
          <LinkButton href={`/hr/staff/${s.userId}/faculty`} variant="outlined">{t('hk.fp.open')}</LinkButton>
          <LinkButton href="/hr">{t('hf.backToStaff')}</LinkButton>
        </>
      }
      overview={
        <Card>
          <Details
            items={[
              [t('hf.staff.left'), sd(s.dateOfLeaving)],
              ['PAN', s.pan ?? '–'],
              ['UAN', s.uan ?? '–'],
              [t('hf.staff.regime'), t(`hf.regime.${s.taxRegime}` as MessageKey)],
              [t('hf.staff.bank'), s.bank ? `${s.bank.bankName} · XXXX${s.bank.accountLast4}` : '–'],
              [t('hf.staff.statutory'), [s.pfEnabled && 'PF', s.esiEnabled && 'ESI', s.ptEnabled && 'PT'].filter(Boolean).join(' · ') || '–'],
            ]}
          />
        </Card>
      }
      related={[
        ...(overview ? StaffTabs(overview, fmt) : []),
        { value: 'service', label: t('hf.sb.title'), count: book.length, content: <ServiceBook userId={s.userId} entries={book} canAdd={canAdd} /> },
        {
          value: 'leave',
          label: t('hr.tab.leave'),
          count: leave.length,
          content: (
            <DataTable
              label={t('hr.tab.leave')}
              rows={leave}
              rowId={(r) => r.id}
              rowHref={(r) => `/hr/leave/${r.id}`}
              exportName="staff-leave"
              columns={[
                { id: 't', header: t('hr.leave.type'), rowHeader: true, sort: (r) => r.leaveType.name, cell: (r) => r.leaveType.name },
                { id: 'f', header: t('hr.leave.dates'), sort: (r) => r.fromDate, cell: (r) => `${d(r.fromDate)} – ${d(r.toDate)}` },
                { id: 'd', header: t('hr.leave.days'), align: 'right', sort: (r) => r.days, cell: (r) => r.days },
                { id: 's', header: t('hr.f.status'), sort: (r) => r.status, cell: (r) => <StatusPill>{t(`hr.leave.status.${r.status}` as MessageKey)}</StatusPill> },
              ]}
            />
          ),
        },
        {
          value: 'loans',
          label: t('hf.loan.title'),
          count: loans.length,
          content: (
            <DataTable
              label={t('hf.loan.title')}
              rows={loans}
              rowId={(l) => l.id}
              rowHref={(l) => `/payroll/loans/${l.id}`}
              exportName="staff-loans"
              columns={[
                { id: 'n', header: t('hf.loan.no'), rowHeader: true, sort: (l) => l.loanNo, cell: (l) => l.loanNo },
                { id: 'a', header: t('hf.amount'), align: 'right', sort: (l) => l.amountPaise, cell: (l) => formatRupees(l.amountPaise) },
                { id: 'o', header: t('hf.loan.outstanding'), align: 'right', sort: (l) => l.outstandingPaise, cell: (l) => formatRupees(l.outstandingPaise) },
                { id: 's', header: t('hr.f.status'), sort: (l) => l.status, cell: (l) => <StatusPill tone={LOAN_TONE[l.status]}>{t(`hf.status.${l.status}` as MessageKey)}</StatusPill> },
              ]}
            />
          ),
        },
        {
          value: 'training',
          label: t('hl.tab.training'),
          count: training.length,
          content: (
            <DataTable
              label={t('hl.tab.training')}
              rows={training}
              rowId={(r) => r.id}
              rowHref={(r) => `/hr/training/${r.id}`}
              exportName="staff-training"
              columns={[
                { id: 't', header: t('hf.training.programme'), rowHeader: true, sort: (r) => r.title, cell: (r) => r.title },
                { id: 'd', header: t('hl.date'), sort: (r) => r.startsOn, cell: (r) => d(r.startsOn) },
                { id: 'h', header: t('hf.training.hours'), align: 'right', sort: (r) => r.hours, cell: (r) => r.hours },
                { id: 'v', header: t('hr.f.status'), sort: (r) => (r.verified ? 1 : 0), cell: (r) => <StatusPill tone={r.verified ? 'success' : 'warning'}>{t(r.verified ? 'hf.verified' : 'hf.unverified')}</StatusPill> },
              ]}
            />
          ),
        },
      ]}
      activity={activity}
    />
  );
}

const LEAVE_PILL: Record<string, Tone> = { pending: 'warning', recommended: 'info', approved: 'success', rejected: 'danger', cancelled: 'neutral' };

export function LeaveRecord({ r, twoLevel, canDecide, activity, canManage = false, canRevoke = false }: { r: LeaveRequest; twoLevel: boolean; canDecide: boolean; activity: ActivityItem[]; canManage?: boolean; canRevoke?: boolean }) {
  const { t, d } = useFmt();
  const steps = leaveSteps(r, twoLevel, { applied: t('hf.step.applied'), hod: t('hf.step.hod'), approval: t('hf.step.principal') });
  return (
    <RecordPage
      title={`${r.user.fullName} · ${r.leaveType.name}`}
      subtitle={`${d(r.fromDate)} – ${d(r.toDate)}`}
      status={{ label: t(`hr.leave.status.${r.status}` as MessageKey), tone: LEAVE_PILL[r.status] }}
      facts={[
        { label: t('hr.leave.type'), value: `${r.leaveType.name} (${r.leaveType.code})` },
        { label: t('hr.leave.days'), value: r.halfDay ? `${r.days} · ${t('hf.halfDay')}` : r.days },
        { label: t('hf.leave.paid'), value: t(r.leaveType.paid ? 'hf.yes' : 'hf.no') },
        { label: t('hf.appliedOn'), value: formatDateTime(r.createdAt) },
      ]}
      primary={<LeaveExtras r={r} canManage={canManage} canRevoke={canRevoke} />}
      secondary={<LinkButton href="/hr/leave">{t('hr.tab.leave')}</LinkButton>}
      overview={
        <Details
          items={[
            [t('hr.leave.reason'), r.reason || '–'],
            [t('hk.leave.delegate'), r.delegate?.fullName ?? '–'],
            [t('hk.leave.appliedBy'), r.appliedBy?.fullName ?? r.user.fullName],
            [t('hk.leave.document'), r.documentName ?? '–'],
            ...(r.revokedReason ? ([[t('hk.leave.revokedReason'), r.revokedReason]] as [string, string][]) : []),
            [t('hf.step.hod'), r.recommendedBy ? `${r.recommendedBy.fullName}${r.recommendNote ? ` · ${r.recommendNote}` : ''}` : '–'],
            [t('hf.decidedBy'), r.decidedBy ? `${r.decidedBy.fullName}${r.decisionNote ? ` · ${r.decisionNote}` : ''}` : '–'],
          ]}
        />
      }
      activity={activity}
      aside={<HrApproval kind="leave" id={r.id} steps={steps} canDecide={canDecide} title={t('hf.approval')} />}
    />
  );
}

const RUN_PILL: Record<string, Tone> = { draft: 'neutral', verified: 'info', approved: 'warning', locked: 'success', reversed: 'danger' };

export function RunRecord({ run, canApprove, activity }: { run: PayrollRunDetail; canApprove: boolean; activity: ActivityItem[] }) {
  const { t, m } = useFmt();
  const steps = runSteps(run, { prepare: t('hf.run.prepare'), verify: t('pay.verify'), approve: t('pay.approve'), lock: t('pay.lock'), bank: t('hf.run.bank'), publish: t('pay.publish') });
  return (
    <RecordPage
      title={t('pay.run.title', { month: m(run.month) })}
      status={{ label: t(`pay.status.${run.status}` as MessageKey), tone: RUN_PILL[run.status] }}
      subtitle={[run.kind === 'supplementary' ? t('hk.run.supplementary') : null, run.publishedAt ? t('hf.run.published') : null, run.status === 'reversed' && run.reversalReason ? `${t('hk.run.reversedBecause')}: ${run.reversalReason}` : null, run.note || null].filter(Boolean).join(' · ') || undefined}
      facts={[
        { label: t('pay.staff'), value: run.staffCount },
        { label: t('pay.gross'), value: formatRupees(run.grossPaise) },
        { label: t('pay.deductions'), value: formatRupees(run.deductionsPaise) },
        { label: t('pay.net'), value: formatRupees(run.netPaise) },
        { label: t('pay.cost'), value: formatRupees(run.employerCostPaise) },
      ]}
      secondary={<LinkButton href="/payroll">{t('pay.back')}</LinkButton>}
      overview={
        <div className="space-y-6">
          <Card title={t('hf.workflow')}>
            <WorkflowStepper steps={steps} label={t('hf.workflow')} />
          </Card>
          <RunDetail run={run} canApprove={canApprove} />
        </div>
      }
      activity={activity}
    />
  );
}

export function PayslipRecord({ p, activity }: { p: Payslip; activity: ActivityItem[] }) {
  const { t, m } = useFmt();
  const lines = (rows: { code: string; name: string; amountPaise: number }[], label: string) => (
    <DataTable label={label} rows={rows} rowId={(x) => x.code} exportName={`payslip-${label}`} columns={[{ id: 'n', header: label, rowHeader: true, cell: (x) => x.name }, { id: 'a', header: t('hf.amount'), align: 'right', cell: (x) => formatRupees(x.amountPaise) }]} />
  );
  const docs: RecordDocument[] = [{ id: 'pdf', name: `${t('nav.payslips')} ${m(p.month)}.pdf`, href: downloadUrl.payslip(p.id), meta: p.payslipNo ?? undefined }];
  return (
    <RecordPage
      title={`${p.user.fullName} · ${m(p.month)}`}
      subtitle={[p.payslipNo, p.user.employeeCode, p.user.designation, p.user.department].filter(Boolean).join(' · ')}
      status={{ label: t(`pay.status.${p.runStatus}` as MessageKey), tone: RUN_PILL[p.runStatus] }}
      facts={[
        { label: t('pay.gross'), value: formatRupees(p.grossPaise) },
        { label: t('pay.deductions'), value: formatRupees(p.deductionsPaise) },
        { label: t('pay.net'), value: formatRupees(p.netPaise) },
        { label: t('hf.payslip.paidDays'), value: `${p.paidDays} / ${p.daysInMonth}` },
        { label: t('pay.lop'), value: p.lopDays },
        { label: t('hf.staff.regime'), value: t(`hf.regime.${p.taxRegime}` as MessageKey) },
      ]}
      primary={<LinkButton href={downloadUrl.payslip(p.id)}>{t('pay.dl.pdf')}</LinkButton>}
      secondary={<LinkButton href={`/payroll/runs/${p.runId}`}>{t('hf.payslip.run')}</LinkButton>}
      overview={
        <div className="grid gap-6 lg:grid-cols-2">
          {lines(p.earnings, t('hf.payslip.earnings'))}
          {lines(p.deductions, t('pay.deductions'))}
          <div className="lg:col-span-2">
            <Details items={[[t('hf.payslip.employerPf'), formatRupees(p.employer.epfPaise + p.employer.epsPaise)], [t('hf.payslip.employerEsi'), formatRupees(p.employer.esiPaise)], [t('hf.payslip.annualTax'), formatRupees(p.annualTaxPaise)]]} />
          </div>
        </div>
      }
      documents={docs}
      activity={activity}
    />
  );
}

const OPENING_PILL: Record<string, Tone> = { requested: 'warning', rejected: 'danger', open: 'success', on_hold: 'warning', closed: 'neutral' };
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired'];

export function OpeningRecord({ o, applicants, canDecide, activity, applicantsList }: { o: JobOpening; applicants: JobApplicant[]; canDecide: boolean; activity: ActivityItem[]; applicantsList?: HrListData }) {
  const { t, d } = useFmt();
  const reqSteps = linearSteps(['raised', 'approved', 'posted'], o.status === 'requested' ? 'raised' : o.status === 'rejected' ? 'rejected' : 'posted', (s) => t(`hf.req.step.${s}` as MessageKey), ['rejected']);
  return (
    <RecordPage
      title={o.title}
      subtitle={[o.department?.name, o.designation?.name].filter(Boolean).join(' · ')}
      status={{ label: t(`hr.rec.status.${o.status}` as MessageKey), tone: OPENING_PILL[o.status] }}
      facts={[
        { label: t('hr.rec.positions'), value: o.positions },
        { label: t('hf.rec.applicants'), value: applicants.length },
        { label: t('hr.rec.stage.hired'), value: o.pipeline.hired ?? 0 },
        { label: t('hf.rec.closes'), value: d(o.closesOn) },
      ]}
      secondary={<LinkButton href="/hr/recruitment">{t('hr.tab.recruitment')}</LinkButton>}
      overview={<Details items={[[t('hf.req.justification'), o.justification || '–'], [t('hf.req.description'), o.description || '–'], [t('hf.decisionNote'), o.decisionNote || '–']]} />}
      related={[
        {
          value: 'applicants',
          label: t('hf.rec.applicants'),
          count: applicants.length,
          content: applicantsList ? (
            <HrList entity="job-applicants" data={applicantsList} createDefaults={{ openingId: o.id }} />
          ) : (
            <DataTable
              label={t('hf.rec.applicants')}
              rows={applicants}
              rowId={(a) => a.id}
              rowHref={(a) => `/hr/recruitment/${o.id}/candidates/${a.id}`}
              exportName="applicants"
              columns={[
                { id: 'n', header: t('hl.staff'), rowHeader: true, sort: (a) => a.fullName, cell: (a) => a.fullName },
                { id: 's', header: t('hf.rec.stage'), sort: (a) => STAGES.indexOf(a.stage), cell: (a) => <StatusPill>{t(`hr.rec.stage.${a.stage}` as MessageKey)}</StatusPill> },
              ]}
            />
          ),
        },
      ]}
      initialTab={applicantsList ? 'applicants' : undefined}
      activity={activity}
      aside={o.status === 'requested' || o.status === 'rejected' || o.approvedAt ? <HrApproval kind="requisition" id={o.id} steps={reqSteps} canDecide={canDecide && o.status === 'requested'} title={t('hf.req.approval')} /> : undefined}
    />
  );
}

export function CandidateRecord({ a, opening, offers }: { a: JobApplicant; opening: JobOpening; offers: { id: string; offerNo: string; position: string; annualCtcPaise: number; joiningOn: string; status: string }[] }) {
  const { t, d } = useFmt();
  const failed = a.stage === 'rejected' || a.stage === 'withdrawn';
  const reached = failed ? Math.max(0, ...a.stageHistory.map((h) => STAGES.indexOf(h.stage))) : STAGES.indexOf(a.stage);
  const steps = STAGES.map((s, i) => ({ id: s, label: t(`hr.rec.stage.${s}` as MessageKey), state: (i <= reached ? 'done' : failed && i === reached + 1 ? 'rejected' : failed ? 'skipped' : i === reached + 1 ? 'current' : 'upcoming') as 'done', at: a.stageHistory.find((h) => h.stage === s)?.at, note: a.stageHistory.find((h) => h.stage === s)?.note }));
  return (
    <RecordPage
      title={a.fullName}
      subtitle={opening.title}
      status={{ label: t(`hr.rec.stage.${a.stage}` as MessageKey), tone: a.stage === 'hired' ? 'success' : failed ? 'danger' : 'info' }}
      facts={[
        { label: t('hf.staff.email'), value: a.email ?? '–' },
        { label: t('hf.staff.phone'), value: a.phone ?? '–' },
        { label: t('hf.appliedOn'), value: d(a.createdAt.slice(0, 10)) },
        { label: t('hf.rec.offers'), value: offers.length },
      ]}
      secondary={<LinkButton href={`/hr/recruitment/${opening.id}`}>{t('hf.rec.backToOpening')}</LinkButton>}
      overview={<Details items={[[t('hf.rec.notes'), a.notes || '–']]} />}
      related={[
        {
          value: 'offers',
          label: t('hf.rec.offers'),
          count: offers.length,
          content: (
            <DataTable label={t('hf.rec.offers')} rows={offers} rowId={(x) => x.id} exportName="offers" columns={[{ id: 'n', header: t('hf.rec.offerNo'), rowHeader: true, cell: (x) => x.offerNo }, { id: 'p', header: t('hr.f.designation'), cell: (x) => x.position }, { id: 'c', header: t('hf.rec.ctc'), align: 'right', cell: (x) => formatRupees(x.annualCtcPaise) }, { id: 'j', header: t('hf.staff.joined'), cell: (x) => d(x.joiningOn) }, { id: 's', header: t('hr.f.status'), cell: (x) => x.status }]} />
          ),
        },
      ]}
      documents={offers.map((x) => ({ id: x.id, name: `${x.offerNo}.pdf`, href: `/api/download?kind=offer-letter&id=${x.id}`, meta: x.position }))}
      activity={a.stageHistory.map((h, i) => ({ id: String(i), at: h.at, actor: h.by, action: t(`hr.rec.stage.${h.stage}` as MessageKey), detail: h.note }))}
      aside={
        <Card title={t('hf.rec.pipeline')}>
          <WorkflowStepper steps={steps} label={t('hf.rec.pipeline')} />
        </Card>
      }
    />
  );
}

const APPR_ORDER = ['draft', 'self_submitted', 'hod_reviewed', 'committee_reviewed', 'finalised'];

export function AppraisalRecord({ a, cats, period, activity }: { a: Appraisal; cats: AppraisalCategory[]; period: string; activity: ActivityItem[] }) {
  const { t } = useFmt();
  const steps = linearSteps(APPR_ORDER, a.status, (s) => t(`hf.appr.step.${s}` as MessageKey));
  return (
    <RecordPage
      title={`${a.fullName ?? ''} · ${period}`}
      status={{ label: t(`hf.appr.step.${a.status}` as MessageKey), tone: a.status === 'finalised' ? 'success' : 'warning' }}
      facts={[
        { label: t('hl.appr.col.self'), value: `${a.selfPercent}%` },
        { label: t('hl.appr.col.hod'), value: `${a.hodPercent}%` },
        { label: t('hk.appr.committee'), value: a.committeeScore == null ? '–' : `${a.committeeScore}%` },
        { label: t('hk.appr.feedback'), value: a.studentFeedbackScore == null ? '–' : `${a.studentFeedbackScore}%` },
        { label: t('hl.appr.col.final'), value: a.finalScore ?? '–' },
        { label: t('hl.appr.col.grade'), value: a.grade ?? '–' },
      ]}
      secondary={<LinkButton href="/hr/appraisal">{t('hl.tab.appraisal')}</LinkButton>}
      overview={
        <div className="space-y-6">
          <DataTable
            label={t('hl.tab.appraisal')}
            rows={cats}
            rowId={(c) => c.key}
            exportName="appraisal"
            columns={[
              { id: 'c', header: t('hf.appr.category'), rowHeader: true, cell: (c) => c.label },
              { id: 'm', header: t('hf.appr.max'), align: 'right', cell: (c) => c.max },
              { id: 's', header: t('hl.appr.col.self'), align: 'right', cell: (c) => a.selfScores[c.key]?.score ?? '–' },
              { id: 'h', header: t('hl.appr.col.hod'), align: 'right', cell: (c) => a.hodScores[c.key]?.score ?? '–' },
              { id: 'e', header: t('hf.appr.evidence'), cell: (c) => a.selfScores[c.key]?.evidence ?? '–' },
            ]}
          />
          <Details items={[[t('hf.appr.hodRemarks'), a.hodRemarks || '–'], [t('hk.appr.committeeRemarks'), a.committeeRemarks || '–'], [t('hf.appr.principalRemarks'), a.principalRemarks || '–']]} />
        </div>
      }
      activity={activity}
      aside={
        <Card title={t('hf.workflow')}>
          <WorkflowStepper steps={steps} label={t('hf.workflow')} />
        </Card>
      }
    />
  );
}

export function TrainingRecordView({ r, activity }: { r: TrainingRecord; activity: ActivityItem[] }) {
  const { t, d } = useFmt();
  return (
    <RecordPage
      title={r.title}
      subtitle={r.fullName}
      status={{ label: t(r.verified ? 'hf.verified' : 'hf.unverified'), tone: r.verified ? 'success' : 'warning' }}
      facts={[
        { label: t('hf.training.kind'), value: t(`hf.training.kind.${r.kind}` as MessageKey) },
        { label: t('hf.training.organiser'), value: r.organiser ?? '–' },
        { label: t('hf.training.dates'), value: `${d(r.startsOn)} – ${d(r.endsOn)}` },
        { label: t('hf.training.hours'), value: r.hours },
      ]}
      secondary={<LinkButton href="/hr/training">{t('hl.tab.training')}</LinkButton>}
      overview={<Details items={[[t('hl.staff'), r.fullName], [t('hf.training.certRef'), r.certificateRef ?? '–']]} />}
      documents={r.hasCertificate ? [{ id: 'cert', name: r.certificateName ?? t('hf.training.certificate'), href: `/api/download?kind=training-cert&id=${r.id}` }] : []}
      activity={activity}
    />
  );
}

const EXIT_ORDER = ['submitted', 'clearance', 'settled', 'relieved'];

export function ExitRecord({ s, activity }: { s: SeparationDetail; activity: ActivityItem[] }) {
  const { t, d } = useFmt();
  const steps = linearSteps(EXIT_ORDER, s.status, (x) => t(`hl.exit.status.${x}` as MessageKey), ['withdrawn']);
  return (
    <RecordPage
      title={s.fullName ?? ''}
      subtitle={t('hf.exit.case')}
      status={{ label: t(`hl.exit.status.${s.status}` as MessageKey), tone: s.status === 'relieved' ? 'success' : s.status === 'withdrawn' ? 'neutral' : 'warning' }}
      facts={[
        { label: t('hf.exit.resigned'), value: d(s.resignedOn) },
        { label: t('hf.exit.lastDay'), value: d(s.lastWorkingDay) },
        { label: t('hf.exit.notice'), value: s.noticeDays },
        { label: t('hf.exit.shortfall'), value: s.noticeShortfallDays },
        { label: t('hf.exit.dues'), value: formatRupees(s.duesPaise) },
        { label: t('hf.exit.settlement'), value: s.settlementPaise === null ? '–' : formatRupees(s.settlementPaise) },
      ]}
      secondary={<LinkButton href="/hr/exit">{t('hl.tab.exit')}</LinkButton>}
      overview={<Details items={[[t('hr.leave.reason'), s.reason], [t('hf.exit.settlementNote'), s.settlementNote ?? '–'], [t('hf.exit.relieved'), d(s.relievedOn)]]} />}
      related={[
        {
          value: 'clearance',
          label: t('hl.exit.clearance'),
          count: s.clearances.length,
          content: (
            <DataTable
              label={t('hl.exit.clearance')}
              rows={s.clearances}
              rowId={(c) => c.id}
              exportName="exit-clearance"
              columns={[
                { id: 'd', header: t('hr.f.department'), rowHeader: true, cell: (c) => c.department },
                { id: 's', header: t('hr.f.status'), cell: (c) => <StatusPill tone={c.status === 'cleared' ? 'success' : 'warning'}>{t(c.status === 'cleared' ? 'hf.cleared' : 'hf.pending')}</StatusPill> },
                { id: 'a', header: t('hf.exit.dues'), align: 'right', cell: (c) => formatRupees(c.duesPaise) },
                { id: 'r', header: t('hf.remarks'), cell: (c) => c.remarks ?? '–' },
              ]}
            />
          ),
        },
      ]}
      documents={s.status === 'relieved' ? [{ id: 'rl', name: t('hf.exit.relievingLetter'), href: `/api/download?kind=relieving-letter&id=${s.id}` }, { id: 'ex', name: t('hk.link.experience'), href: `/api/download?kind=experience-cert&id=${s.id}` }] : []}
      activity={activity}
      aside={
        <Card title={t('hf.workflow')}>
          <WorkflowStepper steps={steps} label={t('hf.workflow')} />
        </Card>
      }
    />
  );
}

export function LoanRecord({ l, canDecide, activity }: { l: StaffLoan; canDecide: boolean; activity: ActivityItem[] }) {
  const { t, m } = useFmt();
  const steps = linearSteps(['requested', 'approved', 'recovering', 'closed'], l.status === 'pending' ? 'requested' : l.status === 'closed' ? 'closed' : l.status === 'approved' ? (l.recoveredPaise > 0 ? 'recovering' : 'approved') : l.status, (s) => t(`hf.loan.step.${s}` as MessageKey), ['rejected', 'cancelled']);
  return (
    <RecordPage
      title={l.loanNo}
      subtitle={`${l.user.fullName} · ${t(`hf.loan.kind.${l.kind}` as MessageKey)}`}
      status={{ label: t(`hf.status.${l.status}` as MessageKey), tone: LOAN_TONE[l.status] }}
      facts={[
        { label: t('hf.amount'), value: formatRupees(l.amountPaise) },
        { label: t('hf.loan.emi'), value: `${formatRupees(l.emiPaise)} × ${l.installments}` },
        { label: t('hf.loan.start'), value: m(l.startMonth) },
        { label: t('hf.loan.recovered'), value: formatRupees(l.recoveredPaise) },
        { label: t('hf.loan.outstanding'), value: formatRupees(l.outstandingPaise) },
      ]}
      secondary={<LinkButton href="/payroll/loans">{t('hf.loan.title')}</LinkButton>}
      overview={
        <div className="space-y-6">
          <Details items={[[t('hf.loan.purpose'), l.purpose], [t('hf.decisionNote'), l.decisionNote ?? '–']]} />
          <DataTable
            label={t('hf.loan.schedule')}
            rows={l.schedule}
            rowId={(x) => x.month}
            exportName={`loan-${l.loanNo}`}
            columns={[
              { id: 'm', header: t('pay.month'), rowHeader: true, cell: (x) => m(x.month) },
              { id: 'a', header: t('hf.amount'), align: 'right', cell: (x) => formatRupees(x.amountPaise) },
              { id: 's', header: t('hr.f.status'), cell: (x) => <StatusPill tone={x.recovered ? 'success' : 'neutral'}>{t(x.recovered ? 'hf.loan.recovered' : 'hf.pending')}</StatusPill> },
            ]}
          />
        </div>
      }
      activity={activity}
      aside={<HrApproval kind="loan" id={l.id} steps={steps} canDecide={canDecide} title={t('hf.approval')} />}
    />
  );
}
