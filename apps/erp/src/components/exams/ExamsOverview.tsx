'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { Check, ClipboardList, Layers, Lock, ShieldCheck, Ticket, UserCheck } from 'lucide-react';
import { approvalStep, requestPublishApproval, sessionStep } from '@/app/(dashboard)/exams/actions';
import { Button } from '@/components/shadcn/button';
import { Progress } from '@/components/shadcn/progress';
import { Card, StatGrid, StatTile, StatusPill, useToast, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ExamPaper, ExamSessionDetail } from '@/lib/exams';
import { cn } from '@/lib/utils';

export interface SessionCounts {
  registered: number;
  registrations: number;
  tickets: number;
  blocked: number;
}
export interface PublishGate {
  required: boolean;
  approved: boolean;
  request: { id: string; status: string } | null;
}

type PaperState = 'moderated' | 'verified' | 'valuing' | 'pending' | 'none';
const STATE_TONE: Record<PaperState, Tone> = { moderated: 'success', verified: 'success', valuing: 'neutral', pending: 'warning', none: 'neutral' };

/** Where a paper's valuation stands, from marks entered and the marks workflow stage. */
export function paperState(p: Pick<ExamPaper, 'entered' | 'enrolled' | 'markStatus'>): PaperState {
  if (p.markStatus === 'moderated') return 'moderated';
  if (p.markStatus === 'verified') return 'verified';
  const entered = p.entered ?? 0;
  if (entered === 0) return 'none';
  return entered < (p.enrolled ?? 0) ? 'valuing' : 'pending';
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** The session overview from the prototype: KPIs, valuation per paper, pass % by subject, and the publish checklist wired to the approval steps. */
export function ExamsOverview({ s, counts, gate, canManage, canApprove }: { s: ExamSessionDetail; counts: SessionCounts; gate: PublishGate | null; canManage: boolean; canApprove: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const papers = s.papers;
  const scripts = papers.reduce((n, p) => n + (p.enrolled ?? 0), 0);
  const valued = papers.reduce((n, p) => n + Math.min(p.entered ?? 0, p.enrolled ?? 0), 0);
  const states = papers.map(paperState);
  const modDone = states.filter((x) => x === 'moderated' || x === 'verified').length;
  const modPending = states.filter((x) => x === 'pending').length;
  const processed = s.status === 'processed' || s.status === 'published' || s.status === 'locked';
  const published = s.status === 'published' || s.status === 'locked';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(t('axr.gate.done'));
        router.refresh();
      } else toast.error(res.error ?? '');
    });

  type Gate = { title: MessageKey; sub: string; approval?: boolean; done: boolean; note?: string; action?: ReactNode };
  const btn = (label: MessageKey, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    canManage || label === 'axr.gate.approve' ? (
      <Button size="sm" disabled={pending} onClick={() => run(fn)}>
        {t(label)}
      </Button>
    ) : undefined;
  const principalDone = !s.approvalRequired || !!s.approvedAt || published;
  const workflowDone = !gate || !gate.required || gate.approved || published;
  const gates: Gate[] = [
    { title: 'axr.gate.valued', sub: t('axr.gate.valuedSub', { n: fmt.number(valued), total: fmt.number(scripts), p: papers.length }), done: processed || (papers.length > 0 && valued >= scripts), note: t('axr.gate.auto') },
    { title: 'axr.gate.moderated', sub: t('axr.gate.moderatedSub', { n: modDone, p: papers.length }), done: processed || (papers.length > 0 && modDone === papers.length), note: t('axr.gate.auto') },
    { title: 'axr.gate.processed', sub: t('axr.gate.processedSub'), done: processed, action: btn('axr.gate.run', () => sessionStep(s.id, 'process')) },
    {
      title: 'axr.gate.principal',
      sub: s.approvalRequired ? t('axr.gate.principalSub') : t('axr.gate.notRequired'),
      approval: true,
      done: principalDone,
      note: s.approvalRequestedAt ? t('axr.gate.awaiting') : undefined,
      action: s.approvalRequestedAt ? (canApprove ? btn('axr.gate.approve', () => approvalStep(s.id, 'approve')) : undefined) : btn('axr.gate.request', () => approvalStep(s.id, 'request-approval')),
    },
    {
      title: 'axr.gate.workflow',
      sub: gate?.required ? t('axr.gate.workflowSub') : t('axr.gate.notRequired'),
      approval: true,
      done: workflowDone,
      note: gate?.request?.status === 'pending' ? t('axr.gate.awaiting') : undefined,
      action:
        gate?.request?.status === 'pending' ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/workflows">{t('axr.gate.openInbox')}</Link>
          </Button>
        ) : (
          btn('axr.gate.request', () => requestPublishApproval(s.id))
        ),
    },
    { title: 'axr.gate.publish', sub: t('axr.gate.publishSub'), done: published, action: btn('axr.gate.publish', () => sessionStep(s.id, 'publish')) },
    { title: 'axr.gate.lock', sub: t('axr.gate.lockSub'), done: s.status === 'locked', action: btn('axr.gate.lock', () => sessionStep(s.id, 'lock')) },
  ];
  const cur = gates.findIndex((g) => !g.done);
  const doneCount = gates.filter((g) => g.done).length;
  const subjects = s.subjects ?? [];

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <StatTile icon={<UserCheck />} label={t('axr.ex.kpi.reg')} value={`${pct(counts.registered, counts.registrations)}%`} caption={t('axr.ex.kpi.regSub', { n: fmt.number(counts.registered), total: fmt.number(counts.registrations) })} bar={<Progress value={pct(counts.registered, counts.registrations)} className="h-1.5" />} />
        <StatTile icon={<Ticket />} label={t('axr.ex.kpi.tickets')} value={fmt.number(counts.tickets - counts.blocked)} caption={t('axr.ex.kpi.ticketsSub', { n: counts.blocked })} tone={counts.blocked ? 'warning' : 'default'} />
        <StatTile icon={<Layers />} label={t('axr.ex.kpi.valuation')} value={`${pct(valued, scripts)}%`} caption={t('axr.ex.kpi.valuationSub', { n: fmt.number(valued), total: fmt.number(scripts) })} bar={<Progress value={pct(valued, scripts)} className="h-1.5" />} />
        <StatTile icon={<ClipboardList />} label={t('axr.ex.kpi.moderation')} value={fmt.number(modPending)} caption={t('axr.ex.kpi.moderationSub', { n: papers.length })} tone={modPending ? 'warning' : 'default'} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('axr.ex.papers')} subtitle={t('axr.ex.papersSub')} padded={false}>
          {papers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">{t('axr.ex.noPapers')}</p>
          ) : (
            <ul className="divide-y" data-testid="paper-progress">
              {papers.map((p, i) => {
                const st = states[i];
                const v = pct(Math.min(p.entered ?? 0, p.enrolled ?? 0), p.enrolled ?? 0);
                return (
                  <li key={p.id}>
                    <Link href={`/exams/${s.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 hover:bg-muted/60 sm:grid-cols-[minmax(0,1.3fr)_minmax(120px,1fr)_auto]">
                      <span className="min-w-0">
                        <b className="block truncate text-sm font-[550]">{p.subject}</b>
                        <small className="text-xs text-muted-foreground">
                          {p.section} · {fmt.date(p.examDate, 'short')}
                        </small>
                      </span>
                      <span className="col-span-2 row-start-2 flex flex-col gap-1 sm:col-span-1 sm:row-start-auto">
                        <span className="flex items-center gap-2">
                          <Progress value={v} className="h-1.5 flex-1" aria-label={p.subject} />
                          <span className="w-9 text-right text-xs tabular-nums">{v}%</span>
                        </span>
                        <small className="text-xs text-muted-foreground tabular-nums">{t('axr.ex.scripts', { n: p.entered ?? 0, total: p.enrolled ?? 0 })}</small>
                      </span>
                      <span className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                        <StatusPill tone={STATE_TONE[st]}>{t(`axr.ex.st.${st}` as MessageKey)}</StatusPill>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={t('axr.ex.pass')} subtitle={t('axr.ex.passSub')}>
          {subjects.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t('axr.ex.passNone')}</p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="pass-chart">
              {subjects.map((x) => {
                const v = pct(x.passed, x.students);
                return (
                  <li key={x.subjectId}>
                    <Link href={`/exams/${s.id}`} aria-label={t('axr.ex.passRow', { subject: x.subject, pct: v, n: x.passed, total: x.students })} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                      <span className="truncate text-[13px]">{x.subject}</span>
                      <span className="h-5 overflow-hidden rounded bg-muted">
                        <span className={cn('block h-full rounded', v < 60 ? 'bg-amber' : 'bg-teal')} style={{ width: `${v}%` }} />
                      </span>
                      <span className="text-right text-[13px] font-semibold tabular-nums">{v}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t('axr.gates', { name: s.name })} subtitle={t('axr.gatesSub')} action={<StatusPill tone={doneCount === gates.length ? 'success' : 'info'}>{t('axr.gatesCount', { n: doneCount, total: gates.length })}</StatusPill>} padded={false}>
        <ol className="py-1" data-testid="publish-gates">
          {gates.map((g, i) => {
            const state = g.done ? 'done' : i === cur ? 'cur' : 'lock';
            return (
              <li key={g.title} className={cn('flex items-start gap-3 px-5 py-3', state === 'cur' && 'bg-teal-soft/40')}>
                <span className={cn('mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold', state === 'done' && 'border-teal bg-teal text-white', state === 'cur' && 'border-teal bg-card text-teal-ink', state === 'lock' && 'bg-muted text-muted-foreground')}>
                  {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'lock' ? <Lock className="size-3" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm font-[550]">{t(g.title)}</b>
                    {g.approval && (
                      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                        <ShieldCheck className="size-3" /> {t('axr.gate.approvalGate')}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-muted-foreground">{g.sub}</div>
                  {state === 'cur' && g.note && <div className="mt-1 text-xs text-amber-ink">{g.note}</div>}
                </div>
                <div className="shrink-0 self-center">{state === 'done' ? <StatusPill tone="success">{t('axr.gate.done')}</StatusPill> : state === 'cur' ? g.action ?? null : <span className="text-xs text-muted-foreground">{t('axr.gate.locked')}</span>}</div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
