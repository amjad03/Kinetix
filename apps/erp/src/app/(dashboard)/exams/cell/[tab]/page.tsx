import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CellTabs, CELL_TABS, type CellTab } from '@/components/exam-cell/CellTabs';
import { AnswerSheetRecords, BundleRecords, CampRecords, DutyRecords, MalpracticeRecords, PastPaperRecords, RescheduleRecords, SessionRecords } from '@/components/exam-cell/CellRecords';
import { CellSettingsForm, ClashPanel, DoubleEntryDesk, RescheduleButton, RosterToolbar, SwapPanel } from '@/components/exam-cell/CellDesks';
import { ExamsTabs } from '@/components/exams/ExamsTabs';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { EmptyState, LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { CellSettings, DoubleEntrySheet, SessionOption, SwapRow } from '@/lib/exam-cell';
import { loadRecords } from '@/lib/records-server';

import { ClipboardPen } from 'lucide-react';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CELL_ROLES = ['tenant_admin', 'principal', 'exam_controller'];

interface OpsOptions {
  sessions: { id: string; name: string; status: string }[];
  papers: { id: string; sessionId: string; subjectId: string; subject: string; sectionId: string; section: string }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.examCell') };
}

/**
 * The exam cell: sessions, invigilation, halls (answer books), postponements, malpractice, double-entry marks,
 * valuation camps, past papers and the cell's settings. Each list is a record kit list.
 */
export default async function ExamCellPage({ params, searchParams }: { params: Promise<{ tab: string }>; searchParams: Promise<SP> }) {
  const me = await requireSection('exams');
  const { tab: raw } = await params;
  if (!(CELL_TABS as readonly string[]).includes(raw)) notFound();
  const tab = raw as CellTab;
  const sp = await searchParams;
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const head = (
    <>
      <PageHeader title={t('nav.examCell')} subtitle={t(`xc.sub.${tab === 'past-papers' ? 'pastPapers' : tab}`)} />
      <ExamsTabs current="cell" roles={roles} />
      <CellTabs area="cell" current={tab} />
    </>
  );
  const fail = (message: string) => (
    <>
      {head}
      <ErrorState message={message} />
    </>
  );

  if (tab === 'settings') {
    const s = await load(() => api<CellSettings>('/v1/exam-cell/settings'));
    return s.error !== undefined ? fail(s.error) : (
      <>
        {head}
        <CellSettingsForm settings={s.data} />
      </>
    );
  }

  if (tab === 'marks') {
    const opts = await load(() => api<OpsOptions>('/v1/exam-ops/options'));
    if (opts.error !== undefined) return fail(opts.error);
    const sessionId = UUID.test(one(sp.session)) ? one(sp.session) : (opts.data.sessions.find((s) => s.status === 'scheduled') ?? opts.data.sessions[0])?.id;
    const papers = opts.data.papers.filter((p) => p.sessionId === sessionId);
    const paperId = papers.find((p) => p.id === one(sp.paper))?.id ?? papers[0]?.id;
    const sheet = paperId ? await load(() => api<DoubleEntrySheet>(`/v1/exam-papers/${paperId}/double-entry`)) : null;
    return (
      <>
        {head}
        <div data-slot="toolbar" className="mb-4 flex flex-wrap items-end gap-3">
          {opts.data.sessions.length > 0 && <UrlSelect label={t('xc.col.session')} param="session" value={sessionId ?? ''} options={opts.data.sessions.map((s) => ({ value: s.id, label: s.name }))} minWidth={280} testId="de-session" />}
          {papers.length > 0 && <UrlSelect label={t('xc.col.paper')} value={`session=${sessionId}&paper=${paperId}`} options={papers.map((p) => ({ value: `session=${sessionId}&paper=${p.id}`, label: `${p.subject} (${p.section})` }))} minWidth={280} testId="de-paper" />}
        </div>
        {!paperId ? (
          <EmptyState icon={<ClipboardPen />} title={t('xc.empty.marks')} testId="no-papers">
            {t('xc.empty.marksBody')}
          </EmptyState>
        ) : sheet?.error !== undefined ? (
          <ErrorState message={sheet!.error!} />
        ) : (
          <DoubleEntryDesk sheet={sheet!.data!} canSettle={roles.some((r) => CELL_ROLES.includes(r))} />
        )}
      </>
    );
  }

  if (tab === 'valuation') {
    const view = one(sp.view) === 'bundles' ? 'bundles' : 'camps';
    const viewTabs = (
      <LinkTabs
        value={view}
        label={t('xc.tab.valuation')}
        items={[
          { value: 'camps', label: t('xc.view.camps'), href: '/exams/cell/valuation' },
          { value: 'bundles', label: t('xc.view.bundles'), href: '/exams/cell/valuation?view=bundles' },
        ]}
      />
    );
    if (view === 'bundles') {
      const r = await loadRecords('valuation-bundles', sp);
      return r.error !== undefined ? fail(r.error) : (
        <>
          {head}
          {viewTabs}
          <BundleRecords meta={r.data.meta} page={r.data.page} state={r.data.state} extraParams={{ view: 'bundles' }} />
        </>
      );
    }
    const [r, opts] = await Promise.all([loadRecords('valuation-camps', sp), load(() => api<OpsOptions>('/v1/exam-ops/options'))]);
    if (r.error !== undefined) return fail(r.error);
    const papers = (opts.data?.papers ?? []).map((p) => ({ value: p.id, label: `${p.subject} (${p.section})`, sessionId: p.sessionId }));
    return (
      <>
        {head}
        {viewTabs}
        <CampRecords meta={r.data.meta} page={r.data.page} state={r.data.state} papers={papers} />
      </>
    );
  }

  const entity = { sessions: 'exam-sessions', duties: 'invigilation-duties', halls: 'answer-sheet-accounts', postponements: 'exam-reschedules', malpractice: 'malpractice-cases', 'past-papers': 'past-exam-questions' }[tab];
  const r = await loadRecords(entity, sp);
  if (r.error !== undefined) return fail(r.error);
  const props = { meta: r.data.meta, page: r.data.page, state: r.data.state };

  if (tab === 'duties') {
    const sessionId = UUID.test(r.data.state.filters.session ?? '') ? r.data.state.filters.session : null;
    const [sessions, swaps] = await Promise.all([load(() => api<SessionOption[]>('/v1/exam-sessions')), sessionId ? load(() => api<SwapRow[]>(`/v1/exam-sessions/${sessionId}/swaps`)) : Promise.resolve(null)]);
    return (
      <>
        {head}
        <DutyRecords {...props} toolbar={<RosterToolbar sessionId={sessionId} sessions={sessions.data ?? []} />} />
        <SwapPanel swaps={swaps?.data ?? []} />
      </>
    );
  }
  if (tab === 'postponements') {
    const opts = await load(() => api<OpsOptions>('/v1/exam-ops/options'));
    const open = new Set((opts.data?.sessions ?? []).filter((s) => s.status === 'draft' || s.status === 'scheduled').map((s) => s.id));
    const papers = (opts.data?.papers ?? []).filter((p) => open.has(p.sessionId)).map((p) => ({ value: p.id, label: `${p.subject} (${p.section})`, sessionId: p.sessionId }));
    const sessionId = UUID.test(r.data.state.filters.session ?? '') ? r.data.state.filters.session : null;
    const clashes = sessionId ? await load(() => api<Parameters<typeof ClashPanel>[0]['clashes']>(`/v1/exam-sessions/${sessionId}/clashes`)) : null;
    return (
      <>
        {head}
        <RescheduleRecords {...props} toolbar={<RescheduleButton papers={papers} />} />
        {clashes?.data && <ClashPanel clashes={clashes.data} />}
      </>
    );
  }
  return (
    <>
      {head}
      {tab === 'sessions' && <SessionRecords {...props} />}
      {tab === 'halls' && <AnswerSheetRecords {...props} />}
      {tab === 'malpractice' && <MalpracticeRecords {...props} />}
      {tab === 'past-papers' && <PastPaperRecords {...props} />}
    </>
  );
}
