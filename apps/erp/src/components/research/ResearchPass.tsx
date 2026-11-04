'use client';

import { BadgeIndianRupee, FileSpreadsheet, Link2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addByDoi, claimIncentive, refreshPendingDois } from '@/app/(dashboard)/research/actions';
import { FormDialog } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { Card, StatGrid, StatTile, useToast } from '@/components/ui';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface NirfParams {
  toYear: number;
  years: { fy: string; calendarYear: number; faculty: number; papers: number; citations: number; researchPaise: number; consultancyPaise: number }[];
  facultyAverage: number;
  pu: { papers: number; perFaculty: number };
  qp: { citations: number; perPaper: number };
  fppp: { researchLakhsPerYear: number; consultancyLakhsPerYear: number; perFacultyLakhs: number };
  ipr: { published: number; granted: number };
}
export interface NbaReport {
  years: { label: string; year: string; journals: number; conferences: number; books: number; indexed: number; phdAwarded: number; phdGuiding: number; sponsoredProjects: number; sponsoredLakhs: number; consultancyProjects: number; consultancyLakhs: number; patentsFiled: number; patentsGranted: number; eventsOrganised: number }[];
  sponsoredLakhsTotal: number;
  consultancyLakhsTotal: number;
}
export interface AisheReport {
  year: string;
  asOn: string;
  enrolment: { department: string; total: number; female: number; fullTime: number; partTime: number; general: number; sc: number; st: number; obc: number; ews: number }[];
  awarded: { department: string; total: number; female: number }[];
  fellowships: { fellowship: string; agency: string; n: number }[];
}
export interface GrantStatement {
  grant: { id: string; agency: string; scheme: string; sanctionRef: string | null; project: string; pi: string; startsOn: string; endsOn: string; status: string };
  period: { from: string; to: string };
  sanctionedPaise: number;
  releasedPaise: number;
  releasesRecorded: boolean;
  pendingReleasePaise: number;
  spentPaise: number;
  unspentPaise: number;
  overheadPct: number;
  overheadPaise: number;
  heads: { head: string; sanctionedPaise: number; spentPaise: number; spentInPeriodPaise: number; balancePaise: number }[];
  unheadedSpentPaise: number;
  releases: { instalment: number; releasedOn: string; receivedOn: string | null; amountPaise: number; reference: string | null }[];
  uc: { openingPaise: number; receivedPaise: number; availablePaise: number; spentPaise: number; closingPaise: number };
}

const linkBtn = 'inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent';

/** Adds a publication from its DOI, with the details typed in when the registry is offline; and fills in pending ones. */
export function DoiAdd() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button variant="outline" className="h-9" onClick={() => setOpen(true)} data-testid="doi-add">
        <Link2 className="size-4" aria-hidden />
        {t('rsp.doi.button')}
      </Button>
      <Button
        variant="outline"
        className="h-9"
        disabled={busy}
        data-testid="doi-refresh"
        onClick={() =>
          start(async () => {
            const r = await refreshPendingDois();
            if (r.ok) toast.success(r.data.registryOffline ? t('rsp.doi.stillOffline') : t('rsp.doi.refreshed', { n: r.data.updated, left: r.data.stillPending }));
            else toast.error(r.error);
            router.refresh();
          })
        }
      >
        <RefreshCw className="size-4" aria-hidden />
        {t('rsp.doi.refresh')}
      </Button>
      {open && (
        <FormDialog
          title={t('rsp.doi.title')}
          intro={<p className="m-0 text-[13px] text-muted-foreground">{t('rsp.doi.intro')}</p>}
          fields={[
            { name: 'doi', label: t('rsx.col.doi'), required: true },
            { name: 'title', label: t('rsp.doi.fallbackTitle') },
            { name: 'venue', label: t('rsx.col.venue') },
            { name: 'year', label: t('rsx.col.year'), kind: 'number' },
          ]}
          submitLabel={t('rsp.doi.add')}
          onSubmit={async (v) => {
            const r = await addByDoi(v);
            if (r.ok) toast.success(r.data.lookup === 'offline' ? t('rsp.doi.pending', { title: r.data.title }) : t('rsp.doi.added', { title: r.data.title }));
            return r;
          }}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** A teacher claims an incentive under a scheme for their own paper or patent; the amount is worked out by the scheme. */
export function ClaimIncentive({ schemes, publications, patents }: { schemes: { value: string; label: string; kind: string }[]; publications: { value: string; label: string }[]; patents: { value: string; label: string }[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (!schemes.length) return null;
  return (
    <>
      <Button className="h-9" onClick={() => setOpen(true)} data-testid="claim-incentive">
        <BadgeIndianRupee className="size-4" aria-hidden />
        {t('rsp.claim.button')}
      </Button>
      {open && (
        <FormDialog
          title={t('rsp.claim.title')}
          intro={<p className="m-0 text-[13px] text-muted-foreground">{t('rsp.claim.intro')}</p>}
          fields={[
            { name: 'schemeId', label: t('rsp.col.scheme'), kind: 'select', required: true, options: schemes },
            { name: 'subject', label: t('rsp.claim.for'), kind: 'select', required: true, options: [...publications.map((p) => ({ value: `publication:${p.value}`, label: p.label })), ...patents.map((p) => ({ value: `patent:${p.value}`, label: `${t('rsp.claim.patent')}: ${p.label}` }))] },
          ]}
          submitLabel={t('rsp.claim.submit')}
          onSubmit={async (v) => {
            const r = await claimIncentive(v);
            if (r.ok) toast.success(t('rsp.claim.done', { amount: fmt.rupees(r.data.amountPaise) }));
            return r;
          }}
          onClose={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Grid({ head, rows, testId, min = 560 }: { head: string[]; rows: (string | number)[][]; testId: string; min?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ minWidth: min }} data-testid={testId}>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            {head.map((h, i) => (
              <th key={h + i} className={`py-2 pr-3 font-medium ${i ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="py-2 pr-3 text-left font-normal">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="py-2 pr-3 text-right tabular-nums">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** NIRF RP ratios, NBA criterion 5, AISHE Ph.D. tables and a grant's statement with its utilisation certificate figures. */
export function ResearchPassReports({ params, nba, aishe, grants, grantId, statement }: { params: NirfParams; nba: NbaReport; aishe: AisheReport; grants: { value: string; label: string }[]; grantId: string | null; statement: GrantStatement | null }) {
  const { t, fmt } = useI18n();
  const n = (v: number) => fmt.number(v);
  const rs = (p: number) => fmt.rupees(p);
  const nbaRows: [MessageKey, (y: NbaReport['years'][number]) => number][] = [
    ['rsp.nba.journals', (y) => y.journals],
    ['rsp.nba.conferences', (y) => y.conferences],
    ['rsp.nba.books', (y) => y.books],
    ['rsp.nba.indexed', (y) => y.indexed],
    ['rsp.nba.phdAwarded', (y) => y.phdAwarded],
    ['rsp.nba.phdGuiding', (y) => y.phdGuiding],
    ['rsp.nba.sponsoredProjects', (y) => y.sponsoredProjects],
    ['rsp.nba.sponsoredLakhs', (y) => y.sponsoredLakhs],
    ['rsp.nba.consultancyProjects', (y) => y.consultancyProjects],
    ['rsp.nba.consultancyLakhs', (y) => y.consultancyLakhs],
    ['rsp.nba.patentsFiled', (y) => y.patentsFiled],
    ['rsp.nba.patentsGranted', (y) => y.patentsGranted],
    ['rsp.nba.events', (y) => y.eventsOrganised],
  ];
  return (
    <>
      <Card>
        <h2 className="m-0 mb-1 text-base font-semibold">{t('rsp.nirf.title', { from: params.years[0]?.fy ?? '', to: params.years.at(-1)?.fy ?? '' })}</h2>
        <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('rsp.nirf.intro', { faculty: params.facultyAverage })}</p>
        <StatGrid min={170}>
          <StatTile label={t('rsp.nirf.pu')} value={n(params.pu.perFaculty)} caption={t('rsp.nirf.puCaption', { n: params.pu.papers })} testId="rsp-pu" />
          <StatTile label={t('rsp.nirf.qp')} value={n(params.qp.perPaper)} caption={t('rsp.nirf.qpCaption', { n: params.qp.citations })} testId="rsp-qp" />
          <StatTile label={t('rsp.nirf.fppp')} value={n(params.fppp.perFacultyLakhs)} caption={t('rsp.nirf.fpppCaption', { research: params.fppp.researchLakhsPerYear, consultancy: params.fppp.consultancyLakhsPerYear })} testId="rsp-fppp" />
          <StatTile label={t('rsp.nirf.ipr')} value={`${params.ipr.published} / ${params.ipr.granted}`} caption={t('rsp.nirf.iprCaption')} testId="rsp-ipr" />
        </StatGrid>
        <div className="mt-4">
          <Grid testId="rsp-nirf-years" head={[t('rsx.rep.item'), ...params.years.map((y) => y.fy)]} rows={[[t('rsp.nirf.faculty'), ...params.years.map((y) => n(y.faculty))], [t('rsp.nirf.papers'), ...params.years.map((y) => n(y.papers))], [t('rsp.nirf.citations'), ...params.years.map((y) => n(y.citations))], [t('rsp.nirf.research'), ...params.years.map((y) => rs(y.researchPaise))], [t('rsp.nirf.consultancy'), ...params.years.map((y) => rs(y.consultancyPaise))]]} />
        </div>
        <p className="mt-3 mb-0 text-xs text-muted-foreground">{t('rsp.nirf.note')}</p>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="m-0 mr-auto text-base font-semibold">{t('rsp.nba.title')}</h2>
          <a href={`/api/download?kind=research&id=nba-aishe&year=${aishe.year.slice(0, 4)}`} className={linkBtn} data-testid="rsp-nba-xlsx">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
            {t('rsx.rep.excel')}
          </a>
        </div>
        <Grid testId="rsp-nba" head={[t('rsx.rep.item'), ...nba.years.map((y) => `${y.label} ${y.year}`)]} rows={nbaRows.map(([k, f]) => [t(k), ...nba.years.map((y) => n(f(y)))])} />
        <p className="mt-3 mb-0 text-xs text-muted-foreground">{t('rsp.nba.note', { sponsored: nba.sponsoredLakhsTotal, consultancy: nba.consultancyLakhsTotal })}</p>
      </Card>

      <Card>
        <h2 className="m-0 mb-1 text-base font-semibold">{t('rsp.aishe.title', { year: aishe.year })}</h2>
        <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('rsp.aishe.asOn', { date: fmt.date(aishe.asOn, 'short') })}</p>
        <Grid
          testId="rsp-aishe"
          min={640}
          head={[t('rsx.col.department'), t('rsp.aishe.total'), t('rsp.aishe.women'), t('rsp.aishe.fullTime'), t('rsp.aishe.partTime'), t('rsp.aishe.general'), t('rsp.aishe.sc'), t('rsp.aishe.st'), t('rsp.aishe.obc'), t('rsp.aishe.ews')]}
          rows={aishe.enrolment.map((r) => [r.department, n(r.total), n(r.female), n(r.fullTime), n(r.partTime), n(r.general), n(r.sc), n(r.st), n(r.obc), n(r.ews)])}
        />
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
          <Grid testId="rsp-aishe-awarded" min={240} head={[t('rsp.aishe.awarded'), t('rsp.aishe.total'), t('rsp.aishe.women')]} rows={aishe.awarded.map((r) => [r.department, n(r.total), n(r.female)])} />
          <Grid testId="rsp-aishe-fellowships" min={240} head={[t('rsp.aishe.fellowships'), t('rsp.aishe.scholars')]} rows={aishe.fellowships.map((f) => [`${t(`rk.o.research-scholars.fellowship.${f.fellowship}` as MessageKey)}${f.agency ? ` (${f.agency})` : ''}`, n(f.n)])} />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <h2 className="m-0 mr-auto text-base font-semibold">{t('rsp.gs.title')}</h2>
          {grants.length > 0 && <UrlSelect label={t('rsx.col.grant')} value={grantId ? `view=reports&grant=${grantId}` : ''} options={grants.map((g) => ({ value: `view=reports&grant=${g.value}`, label: g.label }))} minWidth={260} testId="rsp-grant" />}
          {statement && (
            <a href={`/api/download?kind=research&id=grant-statement&grant=${statement.grant.id}`} className={linkBtn} data-testid="rsp-gs-xlsx">
              <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
              {t('rsp.gs.uc')}
            </a>
          )}
        </div>
        {!statement ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t('rsp.gs.none')}</p>
        ) : (
          <>
            <p className="m-0 mb-3 text-[13px] text-muted-foreground">
              {statement.grant.project} · {statement.grant.pi} · {t('rsp.gs.period', { from: fmt.date(statement.period.from, 'short'), to: fmt.date(statement.period.to, 'short') })}
            </p>
            {!statement.releasesRecorded && <p className="m-0 mb-3 text-[13px] text-amber-ink">{t('rsp.gs.noReleases')}</p>}
            <StatGrid min={150}>
              <StatTile label={t('rsx.col.sanctioned')} value={fmt.rupeesShort(statement.sanctionedPaise)} />
              <StatTile label={t('rsp.col.released')} value={fmt.rupeesShort(statement.releasedPaise)} caption={t('rsp.gs.pending', { amount: fmt.rupeesShort(statement.pendingReleasePaise) })} />
              <StatTile label={t('rsx.col.spent')} value={fmt.rupeesShort(statement.spentPaise)} caption={t('rsp.gs.unspent', { amount: fmt.rupeesShort(statement.unspentPaise) })} testId="rsp-gs-spent" />
              <StatTile label={t('rsp.col.overhead')} value={fmt.rupeesShort(statement.overheadPaise)} caption={t('rsp.gs.overheadPct', { pct: statement.overheadPct })} />
            </StatGrid>
            <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
              <Grid
                testId="rsp-gs-uc"
                min={280}
                head={[t('rsp.gs.ucTitle'), t('rsx.col.amount')]}
                rows={[
                  [t('rsp.gs.opening'), rs(statement.uc.openingPaise)],
                  [t('rsp.gs.received'), rs(statement.uc.receivedPaise)],
                  [t('rsp.gs.available'), rs(statement.uc.availablePaise)],
                  [t('rsp.gs.spentPeriod'), rs(statement.uc.spentPaise)],
                  [t('rsp.gs.closing'), rs(statement.uc.closingPaise)],
                ]}
              />
              <Grid testId="rsp-gs-heads" min={300} head={[t('rsp.col.head'), t('rsx.col.sanctioned'), t('rsx.col.spent'), t('rsx.col.balance')]} rows={statement.heads.map((h) => [t(`rk.o.grant-heads.head.${h.head}` as MessageKey), rs(h.sanctionedPaise), rs(h.spentPaise), rs(h.balancePaise)])} />
            </div>
          </>
        )}
      </Card>
    </>
  );
}
