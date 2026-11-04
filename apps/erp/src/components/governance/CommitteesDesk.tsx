'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, ShieldPlus } from 'lucide-react';
import { useTransition } from 'react';
import { setupStatutory } from '@/app/(dashboard)/governance/pass-actions';
import { Button } from '@/components/kx';
import { Grid, useToast } from '@/components/ops/kit';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { issueWords } from '@/components/governance/words';
import type { CommitteeCompliance, Compliance } from '@/lib/governance-pass';

/**
 * Each committee in office against what its regulation asks: members and women, what the composition lacks, meetings
 * held against the year's norm so far, minutes waiting for approval, and open or overdue actions. Required statutory
 * committees not yet constituted are listed with a button that sets them up.
 */
export function CommitteesDesk({ data }: { data: Compliance }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const setup = () =>
    start(async () => {
      const r = await setupStatutory();
      toast(r.ok ? t('gp.c.setupDone', { n: (r.data as { created: string[] }).created.length }) : r.error);
      router.refresh();
    });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[760px] text-[13px] leading-[19px] text-muted-foreground">{t('gp.c.hint', { year: data.year.label })}</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/download?kind=governance-atr" className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent" data-testid="gov-atr">
            <Download className="size-4 text-muted-foreground" aria-hidden />
            {t('gp.c.atr')}
          </a>
          {data.missing.length > 0 && (
            <Button variant="contained" startIcon={<ShieldPlus className="size-4" />} onClick={setup} disabled={pending} data-testid="gov-setup">
              {t('gp.c.setup')}
            </Button>
          )}
        </div>
      </div>
      {data.missing.length > 0 && (
        <Card className="mb-4">
          <h2 className="m-0 mb-2 text-[15px] font-semibold">{t('gp.c.missingTitle')}</h2>
          <ul className="m-0 list-none p-0 text-[13px]" data-testid="gov-missing">
            {data.missing.map((m) => (
              <li key={m.kind} className="mb-1.5">
                <b className="font-[550]">{t(`gp.kind.${m.kind}` as MessageKey)}</b>
                <span className="text-muted-foreground"> · {t(`gp.basis.${m.kind}` as MessageKey)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Grid<CommitteeCompliance>
        testId="gov-committees-table"
        exportName="committees"
        empty={t('gp.c.empty')}
        rows={data.committees}
        cols={[
          { label: t('gp.col.committee'), cell: (r) => <Link href={`/governance/committees/${r.id}`} className="font-[550]">{r.name}</Link>, sort: (r) => r.name },
          { label: t('gp.col.status'), cell: (r) => <StatusPill tone={r.status === 'ok' ? 'success' : 'warning'}>{t(`gp.c.st.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status },
          { label: t('gp.col.members'), num: true, cell: (r) => `${fmt.number(r.members)} (${t('gp.c.women', { n: r.women })})`, sort: (r) => r.members },
          { label: t('gp.col.composition'), wrap: true, cell: (r) => (r.issues.length ? r.issues.map((i) => issueWords(t, i)).join('; ') : <span className="text-green-ink">{t('gp.c.compositionOk')}</span>), sort: (r) => r.issues.length },
          { label: t('gp.col.meetings'), num: true, cell: (r) => (r.meetingsNorm ? t('gp.c.meetingsOf', { held: r.meetingsHeld, expected: r.meetingsExpected, norm: r.meetingsNorm }) : fmt.number(r.meetingsHeld)), sort: (r) => r.meetingsHeld },
          { label: t('gp.col.last'), cell: (r) => (r.lastMeetingOn ? fmt.date(r.lastMeetingOn, 'short') : '-'), sort: (r) => r.lastMeetingOn ?? '' },
          { label: t('gp.col.minutesPending'), num: true, cell: (r) => fmt.number(r.minutesPending), sort: (r) => r.minutesPending },
          { label: t('gp.col.actions'), num: true, cell: (r) => (r.overdueActions ? t('gp.c.actionsOverdue', { open: r.openActions, overdue: r.overdueActions }) : fmt.number(r.openActions)), sort: (r) => r.overdueActions * 1000 + r.openActions },
        ]}
      />
      {toastNode}
    </>
  );
}
