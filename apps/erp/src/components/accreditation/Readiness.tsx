'use client';

import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, ClipboardCheck, FileWarning, ShieldCheck } from 'lucide-react';
import NextLink from 'next/link';
import { useTransition } from 'react';
import { sendReminders } from '@/app/(dashboard)/accreditation/actions';
import { Button } from '@/components/kx';
import { Card, StatGrid, StatTile, StatusPill, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { Gap, Readiness as ReadinessData } from '@/lib/accreditation-ui';
import { fig } from '@/lib/accreditation-ui';
import { cn } from '@/lib/utils';
import { Gauge, NAAC_BANDS, Ring } from './charts';

/** The reasons a metric is incomplete, in words. */
export function useGapWords() {
  const { t } = useI18n();
  return (reasons: string[]) =>
    reasons
      .map((r) => (r.startsWith('years:') ? t('acx.gap.years', { years: r.slice(6).split(',').join(', ') }) : t(`acx.gap.${r}` as MessageKey)))
      .join(' · ');
}

/**
 * The executive readiness view: the estimate (NAAC CGPA and binary readiness, NBA marks, NIRF score), completeness,
 * each criterion with its owners and due dates, the largest gaps, and reminders for overdue work.
 */
export function Readiness({ r, fw, canManage }: { r: ReadinessData; fw: string; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const gapWords = useGapWords();
  const e = r.estimate;
  const scored = e.scoring !== 'none';
  const open = r.tasks.filter((x) => x.status !== 'approved');
  const overdue = r.tasks.filter((x) => x.overdue);
  const dvvOpen = (r.dvv.open ?? 0) + (r.dvv.rejected ?? 0);
  const crit = r.criteria.filter((c) => c.id !== 'EP');
  const ep = r.criteria.find((c) => c.id === 'EP');
  const next = e.scoring === 'naac' && e.value !== null ? [...NAAC_BANDS].reverse().find(([at]) => at > (e.value ?? 0)) : undefined;
  const metricHref = (code: string) => `/accreditation/${fw}/metrics/${encodeURIComponent(code)}?cycle=${r.cycle}`;
  const remind = () =>
    start(async () => {
      const res = await sendReminders(fw, r.cycle);
      if (res.ok) toast.success(t('acx.r.reminded', { n: res.data.sent }));
      else toast.error(res.error);
    });
  const estimateTile =
    e.scoring === 'naac'
      ? { value: fig(e.value), unit: e.grade ?? '', caption: t('acx.r.floorLine', { value: fig(e.floor), grade: e.floorGrade ?? '-' }) }
      : e.scoring === 'nba'
        ? { value: fig(e.value, 1), unit: t('acx.r.ofMarks', { max: e.max }), caption: t('acx.r.nbaCaption') }
        : e.scoring === 'nirf'
          ? { value: fig(e.value, 1), unit: t('acx.r.of100'), caption: t('acx.r.nirfCaption') }
          : { value: `${Math.round(r.completeness.percent)}%`, unit: '', caption: t('acx.r.returnCaption') };

  return (
    <div className="flex flex-col gap-4" data-testid="acx-readiness">
      <StatGrid>
        <StatTile label={t(scored ? (`acx.r.est.${e.scoring}` as MessageKey) : 'acx.r.est.none')} value={estimateTile.value} unit={estimateTile.unit} caption={estimateTile.caption} icon={<ShieldCheck />} testId="acx-estimate" />
        <StatTile label={t('acx.r.completeness')} value={`${Math.round(r.completeness.percent)}%`} caption={t('acx.r.metricsDone', { n: r.completeness.complete, total: r.completeness.total })} icon={<ClipboardCheck />} />
        <StatTile label={t('acx.r.tasks')} value={open.length} caption={t('acx.r.overdueN', { n: overdue.length })} tone={overdue.length ? 'warning' : 'default'} icon={<CalendarClock />} />
        <StatTile label={t('acx.r.dvvOpen')} value={dvvOpen} caption={t('acx.r.dvvCaption', { answered: r.dvv.answered ?? 0, accepted: r.dvv.accepted ?? 0 })} tone={dvvOpen ? 'warning' : 'default'} icon={<FileWarning />} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title={t('acx.r.criteria')}
          subtitle={t('acx.r.criteriaSub')}
          action={
            canManage ? (
              <Button size="small" variant="outlined" startIcon={<BellRing />} disabled={pending || overdue.length + open.length === 0} onClick={remind} data-testid="acx-remind">
                {t('acx.r.remind')}
              </Button>
            ) : undefined
          }
          testId="acx-criteria"
        >
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
            {[...(ep ? [ep] : []), ...crit].map((c) => (
              <NextLink
                key={c.id}
                href={`/accreditation/${fw}?cycle=${r.cycle}&tab=criteria#c-${c.id}`}
                className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-3 no-underline transition-colors hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Ring value={c.completeness} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {c.id === 'EP' ? t('acx.r.ep') : `${t('acx.r.criterion')} ${c.id}`} · {t('acx.r.metricsOf', { n: c.complete, total: c.metrics })}
                  </span>
                  <b className="text-[13px] leading-[1.3] font-[550] text-foreground">{c.title}</b>
                  {scored && c.id !== 'EP' && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {e.scoring === 'naac' ? t('acx.r.gp', { score: fig(c.score), floor: fig(c.floor) }) : t('acx.r.marks', { score: fig(c.score, 1), max: c.max })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{c.owners.length ? c.owners.join(', ') : t('acx.r.noOwner')}</span>
                  {(c.nextDue || c.overdue > 0) && (
                    <span className="flex flex-wrap gap-1 pt-0.5">
                      {c.overdue > 0 && <StatusPill tone="danger">{t('acx.r.overdueN', { n: c.overdue })}</StatusPill>}
                      {c.nextDue && <StatusPill tone="info">{t('acx.r.due', { date: fmt.date(c.nextDue) })}</StatusPill>}
                    </span>
                  )}
                </span>
              </NextLink>
            ))}
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {e.scoring === 'naac' && e.value !== null && (
            <Card title={t('acx.r.cgpa')} subtitle={t('acx.r.cgpaSub')} testId="acx-gauge">
              <Gauge value={e.value} caption={t('acx.r.gradeLine', { grade: e.grade ?? '-' })} label={`${t('acx.r.cgpa')} ${fmt.number(e.value, { maximumFractionDigits: 2 })} · ${e.grade}`} />
              {next && <p className="m-0 mt-3 rounded-lg bg-amber-soft px-3 py-2.5 text-[12.5px] text-amber-ink">{t('acx.r.toNext', { gap: fmt.number(Math.max(0, next[0] - e.value), { maximumFractionDigits: 2 }), grade: next[1], at: next[0] })}</p>}
            </Card>
          )}
          {(e.scoring === 'nba' || e.scoring === 'nirf') && e.value !== null && (
            <Card title={t(`acx.r.est.${e.scoring}` as MessageKey)} subtitle={t(e.scoring === 'nba' ? 'acx.r.nbaCaption' : 'acx.r.nirfCaption')}>
              <Gauge value={e.value} max={e.max} ticks={false} caption={e.scoring === 'nba' ? t('acx.r.ofMarks', { max: e.max }) : t('acx.r.of100')} label={`${fig(e.value, 1)} / ${e.max}`} />
              <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
                {crit.map((c) => (
                  <li key={c.id} className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2 text-xs">
                    <span className="font-semibold">{c.id}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.min(100, (100 * (c.score ?? 0)) / Math.max(1, c.max))}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {fig(c.score, 1)} / {c.max}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {e.binary && (
            <Card title={t('acx.r.binary')} subtitle={t('acx.r.binarySub')} testId="acx-binary">
              <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] font-semibold', e.binary.ready ? 'bg-teal-soft text-teal-ink' : 'bg-amber-soft text-amber-ink')}>
                {e.binary.ready ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                {e.binary.ready ? t('acx.r.binaryReady') : t('acx.r.binaryNot')}
              </div>
              {!e.binary.ready && (
                <ul className="m-0 mt-2 grid list-disc gap-1 pl-5 text-[12.5px] text-muted-foreground">
                  {e.binary.reasons.map((x) => {
                    const [code, arg = ''] = x.split(':');
                    return <li key={x}>{t(`acx.bin.${code}` as MessageKey, { n: arg, codes: arg.split(',').join(', ') })}</li>;
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      <Card title={t('acx.r.gaps')} subtitle={t('acx.r.gapsSub', { n: r.gaps.length })} padded={false} testId="acx-gaps">
        {r.gaps.length === 0 ? (
          <p className="m-0 px-[18px] pb-4 text-[13px] text-muted-foreground">{t('acx.r.noGaps')}</p>
        ) : (
          <ul className="m-0 mt-2 max-h-[420px] list-none overflow-y-auto p-0">
            {r.gaps.slice(0, 30).map((g: Gap) => (
              <li key={g.code} className="flex items-center gap-3 border-t px-[18px] py-2.5">
                <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4', g.completeness === 0 ? 'bg-red-soft text-red-ink' : 'bg-amber-soft text-amber-ink')}>
                  <AlertTriangle />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">
                    {g.code} {g.title}
                  </b>
                  <span className="block truncate text-xs text-muted-foreground">
                    {gapWords(g.reasons)}
                    {g.owner ? ` · ${g.owner}` : ''}
                    {g.dueOn ? ` · ${t('acx.r.due', { date: fmt.date(g.dueOn) })}` : ''}
                  </span>
                </span>
                <span className="hidden w-16 text-right text-xs tabular-nums text-muted-foreground sm:block">{g.completeness}%</span>
                <NextLink href={metricHref(g.code)} className="inline-flex h-8 shrink-0 items-center rounded-md border bg-card px-2.5 text-[12.5px] font-medium no-underline hover:bg-accent">
                  {t('acx.r.open')}
                </NextLink>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
