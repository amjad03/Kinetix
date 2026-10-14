import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CellTabs, DESK_TABS, type DeskTab } from '@/components/exam-cell/CellTabs';
import { GraceRecords, RevaluationRecords, TransferRecords, WithholdRecords } from '@/components/exam-cell/CellRecords';
import { ReportView, ResultsDesk } from '@/components/exam-cell/CellDesks';
import { ExamsTabs } from '@/components/exams/ExamsTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { EmptyState } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { CELL_REPORTS, NO_SESSION_REPORTS, type CellReport, type ReportData, type ResultRun, type RevisionRow, type SessionOption } from '@/lib/exam-cell';
import type { ExamSessionDetail, ResultRow } from '@/lib/exams';
import { loadRecords } from '@/lib/records-server';

import { ClipboardList } from 'lucide-react';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.resultsDesk') };
}

/** The results desk: processing (dry run, freeze, rollback, publish, corrections), withheld results, grace, revaluation, the registers and transferred credits. */
export default async function ResultsDeskPage({ params, searchParams }: { params: Promise<{ tab: string }>; searchParams: Promise<SP> }) {
  const me = await requireSection('exams');
  const { tab: raw } = await params;
  if (!(DESK_TABS as readonly string[]).includes(raw)) notFound();
  const tab = raw as DeskTab;
  const sp = await searchParams;
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const head = (
    <>
      <PageHeader title={t('nav.resultsDesk')} subtitle={t(`xc.sub.${tab}` as MessageKey)} />
      <ExamsTabs current="resultsDesk" roles={roles} />
      <CellTabs area="desk" current={tab} />
    </>
  );
  const fail = (message: string) => (
    <>
      {head}
      <ErrorState message={message} />
    </>
  );

  if (tab === 'processing' || tab === 'registers') {
    const sessions = await load(() => api<SessionOption[]>('/v1/exam-sessions'));
    if (sessions.error !== undefined) return fail(sessions.error);
    const list = sessions.data;
    const session = list.find((s) => s.id === one(sp.session)) ?? list.find((s) => s.status === 'processed') ?? list.find((s) => s.status !== 'draft') ?? list[0];
    const empty = (
      <EmptyState icon={<ClipboardList />} title={t('xc.empty.sessions')} testId="no-sessions">
        {t('xc.empty.sessionsBody')}
      </EmptyState>
    );
    if (tab === 'processing') {
      if (!session) return (
        <>
          {head}
          {empty}
        </>
      );
      const [runs, revisions, results] = await Promise.all([load(() => api<ResultRun[]>(`/v1/exam-sessions/${session.id}/runs`)), load(() => api<RevisionRow[]>(`/v1/exam-sessions/${session.id}/revisions`)), load(() => api<ResultRow[]>(`/v1/exam-sessions/${session.id}/results`))]);
      const rows = results.data ?? [];
      const detail = await load(() => api<ExamSessionDetail>(`/v1/exam-sessions/${session.id}`));
      const subjectOptions = [...new Map((detail.data?.papers ?? []).map((p) => [p.subjectId, { value: p.subjectId, label: p.subject }])).values()];
      return (
        <>
          {head}
          <div data-slot="toolbar" className="mb-4 flex flex-wrap items-end gap-3">
            <UrlSelect label={t('xc.col.session')} param="session" value={session.id} options={list.map((s) => ({ value: s.id, label: s.name }))} minWidth={300} testId="rd-session" />
          </div>
          <ResultsDesk session={session} runs={runs.data ?? []} revisions={revisions.data ?? []} students={rows.map((r) => ({ value: r.studentId, label: `${r.rollNo} ${r.fullName}` }))} subjects={subjectOptions} canUnpublish={roles.includes('principal') || roles.includes('tenant_admin')} />
        </>
      );
    }
    const report = (CELL_REPORTS as readonly string[]).includes(one(sp.report)) ? (one(sp.report) as CellReport) : 'gazette';
    const needsSession = !NO_SESSION_REPORTS.includes(report);
    const sid = session && UUID.test(session.id) ? session.id : null;
    const data = needsSession && !sid ? null : await load(() => api<ReportData>(`/v1/exam-cell/reports/${report}${sid ? `?sessionId=${sid}` : ''}`));
    const qs = (r: string, s: string | null) => `report=${r}${s ? `&session=${s}` : ''}`;
    return (
      <>
        {head}
        <div data-slot="toolbar" className="mb-4 flex flex-wrap items-end gap-3">
          <UrlSelect label={t('xc.rep.report')} value={qs(report, sid)} options={CELL_REPORTS.map((r) => ({ value: qs(r, sid), label: t(`xc.rep.${r}` as MessageKey) }))} minWidth={260} testId="rep-report" />
          {needsSession && list.length > 0 && <UrlSelect label={t('xc.col.session')} value={qs(report, sid)} options={list.map((s) => ({ value: qs(report, s.id), label: s.name }))} minWidth={300} testId="rep-session" />}
        </div>
        <p className="mb-4 text-[13px] leading-[19px] text-muted-foreground">{t(`xc.rep.about.${report}` as MessageKey)}</p>
        {!data ? empty : data.error !== undefined ? <ErrorState message={data.error} /> : <ReportView data={data.data} csvHref={`/api/exam-cell?kind=report&report=${report}${sid && needsSession ? `&sessionId=${sid}` : ''}`} />}
      </>
    );
  }

  const entity = { withheld: 'result-withholds', grace: 'grace-applications', revaluations: 'revaluations', transfers: 'credit-transfers' }[tab];
  const r = await loadRecords(entity, sp);
  if (r.error !== undefined) return fail(r.error);
  const props = { meta: r.data.meta, page: r.data.page, state: r.data.state };
  return (
    <>
      {head}
      {tab === 'withheld' && <WithholdRecords {...props} />}
      {tab === 'grace' && <GraceRecords {...props} />}
      {tab === 'revaluations' && <RevaluationRecords {...props} />}
      {tab === 'transfers' && <TransferRecords {...props} />}
    </>
  );
}
