'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { ArrowRight, Check, ListOrdered, Send, Sparkles, Users } from 'lucide-react';
import { cycleAction, promoteWaitlist, publishMeritList, setApplicationStatus } from '@/app/(dashboard)/admissions/actions';
import { StatusPill as AppStatus } from '@/components/admissions/Chips';
import { Button } from '@/components/shadcn/button';
import { Card, Sheet, StatusPill, useToast } from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/shadcn/table';
import { initials } from '@/components/initials';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ApplicationRow, MeritListDetail } from '@/lib/admissions';
import { cn } from '@/lib/utils';

export interface QuotaView {
  seats: number;
  generalSeats: number;
  generalLeft: number;
  quotas: { category: string; reservedSeats: number; taken: number; left: number }[];
}
export interface FlowCycle {
  id: string;
  name: string;
  status: string;
  seats: number;
  merit: MeritListDetail | null;
  quota: QuotaView | null;
}
export interface FlowEnquiry {
  id: string;
  name: string;
  programName: string | null;
  source: string;
}

const STEPS = 8;
const norm = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

/** Where an application stands on the 8-step admission path (1 = applied … 7 = enrolled); -1 once it has dropped out. */
export function stageOf(a: Pick<ApplicationRow, 'status' | 'meritRank'>): number {
  switch (a.status) {
    case 'submitted':
      return 1;
    case 'under_review':
    case 'correction_requested':
      return 2;
    case 'eligible':
      return a.meritRank == null ? 3 : 4;
    case 'waitlisted':
      return 4;
    case 'offered':
      return 5;
    case 'accepted':
      return 6;
    case 'enrolled':
      return 7;
    default:
      return -1;
  }
}

function Avatar({ name, size = 'size-6' }: { name: string; size?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-teal-soft text-[10px] font-semibold text-teal-ink', size)}>
      {initials(name)}
    </span>
  );
}

/** The guided admissions page: 8-step stepper with real counts, a pipeline board with an applicant sheet, and the rank list with seat allotment. */
export function AdmissionsFlow({ enquiryTotal, enquiries, apps, cycles, enquiryBoard }: { enquiryTotal: number; enquiries: FlowEnquiry[]; apps: ApplicationRow[]; cycles: FlowCycle[]; enquiryBoard: ReactNode }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const byStage = useMemo(() => {
    const m: ApplicationRow[][] = Array.from({ length: STEPS }, () => []);
    for (const a of apps) {
      const s = stageOf(a);
      if (s > 0) m[s].push(a);
    }
    return m;
  }, [apps]);
  // Reached = at this step or beyond, so the stepper reads as a funnel.
  const reached = useMemo(() => {
    const r = Array.from({ length: STEPS }, (_, i) => (i === 0 ? Math.max(enquiryTotal, apps.length) : byStage.slice(i).reduce((n, l) => n + l.length, 0)));
    return r;
  }, [byStage, enquiryTotal, apps.length]);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState<ApplicationRow | null>(null);
  const [cycleId, setCycleId] = useState(cycles.find((c) => c.merit)?.id ?? cycles[0]?.id ?? '');
  const cycle = cycles.find((c) => c.id === cycleId);
  const name = (i: number) => t(`axr.step.${i}` as MessageKey);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg?: (d: unknown) => string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg ? okMsg(res.data) : t('axr.act.done'));
        router.refresh();
      } else toast.error(res.error ?? '');
    });

  const appById = useMemo(() => new Map(apps.map((a) => [a.id, a])), [apps]);
  const quotaCats = new Set((cycle?.quota?.quotas ?? []).map((q) => norm(q.category)));

  return (
    <div className="flex flex-col gap-4">
      <Card padded>
        <div role="list" aria-label={t('axr.adm.flow')} className="-mx-1 flex snap-x gap-0 overflow-x-auto pb-1">
          {Array.from({ length: STEPS }, (_, i) => {
            const done = i < step;
            const cur = i === step;
            return (
              <button
                key={i}
                type="button"
                role="listitem"
                aria-current={cur ? 'step' : undefined}
                onClick={() => setStep(i)}
                data-testid={`adm-step-${i}`}
                className="group relative flex min-w-[112px] flex-1 snap-start flex-col items-start gap-1 rounded-lg px-1 pt-1 pb-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex w-full items-center">
                  <span
                    className={cn(
                      'z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                      done && 'border-teal bg-teal text-white',
                      cur && 'border-teal bg-teal-soft text-teal-ink ring-4 ring-teal-soft',
                      !done && !cur && 'bg-card text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {i < STEPS - 1 && <span aria-hidden className={cn('mx-1 h-0.5 flex-1 rounded', done ? 'bg-teal' : 'bg-border')} />}
                </span>
                <b className={cn('text-[13px] leading-tight font-[550]', cur ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')}>{name(i)}</b>
                <small className="text-xs text-muted-foreground tabular-nums">{fmt.number(reached[i])}</small>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex gap-3 rounded-xl border border-teal/25 bg-teal-soft/60 p-3.5 text-sm">
          <Sparkles className="mt-0.5 size-[18px] shrink-0 text-teal-ink" aria-hidden />
          <div className="min-w-0">
            <b className="font-semibold">{t('axr.stepOf', { n: step + 1, name: name(step) })}</b>
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              {t(`axr.help.${step}` as MessageKey)} {t('axr.reached', { n: fmt.number(reached[step]) })}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {step === 4 && cycle?.merit && !cycle.merit.publishedAt && (
                <Button size="sm" disabled={pending} onClick={() => run(() => publishMeritList(cycle.merit!.id))}>
                  <Send /> {t('axr.act.publish')}
                </Button>
              )}
              {step === 5 && cycle && (
                <Button size="sm" disabled={pending} onClick={() => run(() => promoteWaitlist(cycle.id), (d) => t('axr.promoted', { n: (d as { promoted?: number })?.promoted ?? 0 }))}>
                  <Users /> {t('axr.act.promote')}
                </Button>
              )}
              {step < STEPS - 1 && (
                <Button size="sm" variant={step === 4 || step === 5 ? 'outline' : 'default'} onClick={() => setStep(step + 1)}>
                  {t('axr.continueTo', { name: name(step + 1) })} <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {step === 0 && (
        <Card title={t('axr.enquiries')} subtitle={t('axr.enquiriesSub')}>
          {enquiryBoard}
        </Card>
      )}

      <Card title={t('axr.pipeline')} subtitle={t('axr.pipelineSub')}>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" data-testid="adm-board">
          {Array.from({ length: STEPS }, (_, i) => {
            const items = i === 0 ? enquiries.map((e) => ({ id: e.id, name: e.name, line: [e.programName, t(`adm.source.${e.source}` as MessageKey)].filter(Boolean).join(' · '), app: null as ApplicationRow | null })) : byStage[i].map((a) => ({ id: a.id, name: a.applicantName, line: [a.cycleName, a.applicationNo].join(' · '), app: a }));
            const count = i === 0 ? enquiryTotal : byStage[i].length;
            return (
              <section key={i} aria-label={name(i)} className={cn('flex w-[220px] shrink-0 flex-col rounded-xl border bg-muted/50 p-2.5', i === step && 'border-teal/60 bg-teal-soft/40')}>
                <button type="button" onClick={() => setStep(i)} className="flex items-center justify-between gap-2 rounded-md text-left text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <span className="truncate">{name(i)}</span>
                  <span className="rounded-full border bg-card px-2 text-xs tabular-nums">{fmt.number(count)}</span>
                </button>
                <div className="mt-0.5 mb-2 text-xs text-muted-foreground">{i === 0 ? t('axr.allSources') : t('axr.fromPrev', { pct: reached[i - 1] ? Math.round((reached[i] / reached[i - 1]) * 100) : 0 })}</div>
                <div className="flex flex-col gap-1.5">
                  {items.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => (c.app ? setOpen(c.app) : setStep(0))}
                      className="rounded-lg border bg-card p-2 text-left text-xs shadow-[var(--shadow-card)] transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-2">
                        <Avatar name={c.name} size="size-[22px]" />
                        <b className="truncate text-[13px] font-[550]">{c.name}</b>
                      </span>
                      <span className="mt-1 block truncate text-muted-foreground">{c.line}</span>
                    </button>
                  ))}
                  {items.length === 0 && <div className="py-3 text-center text-xs text-muted-foreground">{t('axr.emptyCol')}</div>}
                  {count > Math.min(4, items.length) && items.length > 0 && (
                    <Link href={i === 0 ? '/admissions' : '/admissions/applications'} className="mt-1 text-xs text-muted-foreground hover:text-foreground">
                      {t('axr.more', { n: fmt.number(count - Math.min(4, items.length)) })}
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </Card>

      <Card
        title={cycle ? t('axr.rank.title', { cycle: cycle.name }) : t('axr.step.4')}
        subtitle={cycle?.merit ? t('axr.rank.sub', { v: cycle.merit.version, seats: cycle.merit.seats, ranked: cycle.merit.entries.length }) : undefined}
        action={
          cycles.length > 1 ? (
            <div role="tablist" aria-label={t('axr.rank.cycle')} className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
              {cycles.map((c) => (
                <button key={c.id} role="tab" type="button" aria-selected={c.id === cycleId} onClick={() => setCycleId(c.id)} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', c.id === cycleId ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                  {c.name}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {!cycle ? (
          <p className="text-sm text-muted-foreground">{t('axr.noCycles')}</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {cycle.quota && (
                <>
                  <span className="text-xs text-muted-foreground">{t('axr.rank.matrix')}:</span>
                  <span className="rounded-full border px-2 py-0.5 text-xs">{t('axr.rank.general', { n: cycle.quota.generalLeft })}</span>
                  {cycle.quota.quotas.map((q) => (
                    <span key={q.category} className="rounded-full border border-teal/40 px-2 py-0.5 text-xs text-teal-ink">
                      {t('axr.rank.quota', { cat: q.category, left: q.left, seats: q.reservedSeats })}
                    </span>
                  ))}
                </>
              )}
              <span className="ml-auto flex flex-wrap gap-2">
                {cycle.merit?.publishedAt && <StatusPill tone="success">{t('axr.act.published', { date: fmt.date(cycle.merit.publishedAt.slice(0, 10), 'short') })}</StatusPill>}
                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => cycleAction(cycle.id, 'generate'))}>
                  <ListOrdered /> {t('axr.act.generate')}
                </Button>
                {cycle.merit && !cycle.merit.publishedAt && (
                  <Button size="sm" disabled={pending} onClick={() => run(() => publishMeritList(cycle.merit!.id))}>
                    <Send /> {t('axr.act.publish')}
                  </Button>
                )}
              </span>
            </div>
            {!cycle.merit || cycle.merit.entries.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">{t('axr.rank.none')}</p>
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <Table data-testid="rank-list">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('axr.col.rank')}</TableHead>
                      <TableHead>{t('axr.col.applicant')}</TableHead>
                      <TableHead className="text-right">{t('axr.col.score')}</TableHead>
                      <TableHead>{t('axr.col.category')}</TableHead>
                      <TableHead>{t('axr.col.quota')}</TableHead>
                      <TableHead>{t('axr.col.status')}</TableHead>
                      <TableHead className="text-right">{t('axr.col.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...cycle.merit.entries]
                      .sort((a, b) => a.rank - b.rank)
                      .slice(0, 50)
                      .map((e) => {
                        const a = appById.get(e.applicationId);
                        const status = a?.status ?? e.status ?? 'eligible';
                        const cat = a?.category ?? null;
                        const reserved = !!cat && quotaCats.has(norm(cat));
                        const label = e.applicantName ?? a?.applicantName ?? '';
                        return (
                          <TableRow key={e.applicationId}>
                            <TableCell className="font-semibold tabular-nums">#{e.rank}</TableCell>
                            <TableCell>
                              <button type="button" onClick={() => a && setOpen(a)} className="flex items-center gap-2 text-left">
                                <Avatar name={label} size="size-7" />
                                <span className="min-w-0">
                                  <b className="block truncate font-[550]">{label}</b>
                                  <small className="text-xs text-muted-foreground">{e.applicationNo ?? a?.applicationNo}</small>
                                </span>
                              </button>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{fmt.number(e.score, { maximumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              <span className={cn('rounded-full border px-2 py-0.5 text-xs', reserved && 'border-teal text-teal-ink')}>{cat ?? t('axr.cat.none')}</span>
                            </TableCell>
                            <TableCell>{reserved ? <StatusPill tone="live">{t('axr.quota.reserved')}</StatusPill> : <span className="text-xs text-muted-foreground">{t('axr.quota.general')}</span>}</TableCell>
                            <TableCell>
                              <AppStatus kind="application" status={status} />
                            </TableCell>
                            <TableCell className="text-right">
                              {status === 'eligible' || status === 'waitlisted' ? (
                                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setApplicationStatus(e.applicationId, 'offered'))}>
                                  {t('axr.act.offer')}
                                </Button>
                              ) : status === 'offered' ? (
                                <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setApplicationStatus(e.applicationId, 'accepted'))}>
                                  {t('axr.act.confirm')}
                                </Button>
                              ) : (
                                <Link href={`/admissions/applications/${e.applicationId}`} className="text-xs text-muted-foreground hover:text-foreground">
                                  {t('axr.act.open')}
                                </Link>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </Card>

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.applicantName ?? ''}
        subtitle={open ? name(Math.max(0, stageOf(open))) : undefined}
        actions={
          open ? (
            <Button asChild>
              <Link href={`/admissions/applications/${open.id}`}>
                {t('axr.act.open')} <ArrowRight />
              </Link>
            </Button>
          ) : undefined
        }
      >
        {open && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm" data-testid="applicant-sheet">
            {(
              [
                ['axr.sheet.no', open.applicationNo],
                ['axr.sheet.stage', <AppStatus key="s" kind="application" status={open.status} />],
                ['axr.sheet.cycle', open.cycleName],
                ['axr.sheet.phone', open.phone],
                ['axr.sheet.score', open.meritScore == null ? '—' : fmt.number(open.meritScore, { maximumFractionDigits: 2 })],
                ['axr.sheet.rank', open.meritRank == null ? '—' : `#${open.meritRank}`],
                ['axr.sheet.category', open.category ?? t('axr.cat.none')],
                ['axr.sheet.fee', t(`adm.fee.${open.feeStatus}` as MessageKey)],
                ['axr.sheet.submitted', fmt.date(open.submittedAt.slice(0, 10), 'short')],
              ] as [MessageKey, ReactNode][]
            ).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t(k)}</dt>
                <dd className="mt-0.5 truncate font-[550]">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </Sheet>
    </div>
  );
}
