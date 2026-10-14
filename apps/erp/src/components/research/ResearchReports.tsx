'use client';

import { BookUser, Download, FileSpreadsheet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { importOrcid } from '@/app/(dashboard)/research/actions';
import { FormDialog } from '@/components/ops/kit';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, EmptyState, StatGrid, StatTile, useToast, type Column } from '@/components/ui';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface FacultyRow {
  id: string;
  name: string;
  publications: number;
  citations: number;
}
export interface Profile {
  person: { name: string; department: string | null };
  summary: { publications: number; indexed: number; citations: number; hIndex: number; i10: number; retracted: number; projects: number; grantLakhs: number; patents: number; patentsGranted: number; consultancyLakhs: number; recognitions: number; scholars: number; scholarsAwarded: number };
  publications: { id: string; title: string; kind: string; venue: string; year: number; doi: string | null; indexed: string; citations: number; status: string }[];
}
export interface NirfRp {
  toYear: number;
  years: { fy: string; sponsoredProjects: number; agencies: number; sponsoredRupees: number; consultancyProjects: number; clients: number; consultancyRupees: number; trainingPrograms: number; trainees: number; trainingRupees: number }[];
  calendar: { year: number; indexed: number; publications: number; citations: number; patentsPublished: number; patentsGranted: number; licenceRupees: number }[];
}
export interface NaacC3 {
  cycle: string;
  years: string[];
  rows: { key: string; label: string; values: (number | null)[] }[];
}

/** A teacher's ORCID works imported into publications (the research office may import for any teacher). */
export function OrcidImport({ faculty }: { faculty: { value: string; label: string }[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-9" onClick={() => setOpen(true)} data-testid="orcid-import">
        <BookUser className="size-4" aria-hidden />
        {t('rsx.orcid.button')}
      </Button>
      {open && (
        <FormDialog
          title={t('rsx.orcid.title')}
          intro={<p className="m-0 text-[13px] text-muted-foreground">{t('rsx.orcid.intro')}</p>}
          fields={[
            { name: 'orcid', label: t('rsx.orcid.id'), required: true },
            { name: 'ownerUserId', label: t('rsx.orcid.teacher'), kind: 'select', options: faculty },
          ]}
          submitLabel={t('rsx.orcid.run')}
          onSubmit={async (v) => {
            const r = await importOrcid(v);
            if (r.ok) toast.success(t('rsx.orcid.done', { added: r.data.added, skipped: r.data.skipped }));
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

const lakh = (rupees: number) => Math.round((rupees / 1e5) * 100) / 100;

/** Research reports: a faculty member's research profile, NIRF research and professional practice data, and NAAC criterion 3 year by year. */
export function ResearchReports({ faculty, userId, profile, nirf, naac }: { faculty: FacultyRow[]; userId: string | null; profile: Profile | null; nirf: NirfRp; naac: NaacC3 }) {
  const { t, fmt } = useI18n();
  const pubCols: Column<Profile['publications'][number]>[] = [
    { id: 'title', header: t('rsx.col.title'), rowHeader: true, cell: (p) => <span className="block max-w-[420px] whitespace-normal">{p.title}</span>, sort: (p) => p.title },
    { id: 'venue', header: t('rsx.col.venue'), hideBelow: 'md', cell: (p) => p.venue, sort: (p) => p.venue },
    { id: 'year', header: t('rsx.col.year'), cell: (p) => p.year, sort: (p) => p.year },
    { id: 'indexed', header: t('rsx.col.indexed'), hideBelow: 'sm', cell: (p) => p.indexed || '-' },
    { id: 'citations', header: t('rsx.col.citations'), align: 'right', cell: (p) => fmt.number(p.citations), sort: (p) => p.citations },
    { id: 'status', header: t('rsx.col.status'), hideBelow: 'sm', cell: (p) => t(`rk.o.research-publications.status.${p.status}` as MessageKey) },
  ];
  const s = profile?.summary;
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="rsx-profile">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <h2 id="rsx-profile" className="m-0 mr-auto text-base font-semibold">
            {t('rsx.rep.profile')}
          </h2>
          <UrlSelect label={t('rsx.rep.teacher')} value={userId ? `view=reports&user=${userId}` : ''} options={faculty.map((f) => ({ value: `view=reports&user=${f.id}`, label: `${f.name} (${f.publications})` }))} minWidth={260} testId="rsx-teacher" />
          {userId && (
            <a href={`/api/download?kind=research&id=profile&user=${userId}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent" data-testid="rsx-profile-xlsx">
              <Download className="size-4 text-muted-foreground" aria-hidden />
              {t('rsx.rep.excel')}
            </a>
          )}
        </div>
        {!profile || !s ? (
          <EmptyState icon={<BookUser />} title={t('rsx.rep.pick')}>
            {t('rsx.rep.pickBody')}
          </EmptyState>
        ) : (
          <>
            <p className="m-0 mb-3 text-[13px] text-muted-foreground">
              {profile.person.name}
              {profile.person.department ? ` · ${profile.person.department}` : ''}
            </p>
            <StatGrid min={150}>
              <StatTile label={t('rsx.rep.publications')} value={fmt.number(s.publications)} caption={t('rsx.rep.indexedOf', { n: s.indexed })} />
              <StatTile label={t('rsx.rep.citations')} value={fmt.number(s.citations)} caption={t('rsx.rep.i10', { n: s.i10 })} />
              <StatTile label={t('rsx.rep.hIndex')} value={fmt.number(s.hIndex)} />
              <StatTile label={t('rsx.rep.grants')} value={fmt.number(s.grantLakhs)} caption={t('rsx.rep.projects', { n: s.projects })} />
              <StatTile label={t('rsx.rep.patents')} value={`${s.patents} / ${s.patentsGranted}`} caption={t('rsx.rep.patentsCaption')} />
              <StatTile label={t('rsx.rep.scholars')} value={`${s.scholars} / ${s.scholarsAwarded}`} caption={t('rsx.rep.scholarsCaption')} />
            </StatGrid>
            {s.retracted > 0 && <p className="mt-3 mb-0 text-[13px] text-amber-ink">{t('rsx.rep.retracted', { n: s.retracted })}</p>}
            <div className="mt-4">
              <DataTable rows={profile.publications} columns={pubCols} rowId={(p) => p.id} label={t('rsx.rep.publications')} exportName="research-profile" empty={t('rsx.empty.publications')} />
            </div>
          </>
        )}
      </section>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="m-0 mr-auto text-base font-semibold">{t('rsx.rep.nirf', { from: nirf.years[0]?.fy ?? '', to: nirf.years.at(-1)?.fy ?? '' })}</h2>
          <a href={`/api/download?kind=research&id=nirf-rp&toYear=${nirf.toYear}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent" data-testid="rsx-nirf-xlsx">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden />
            {t('rsx.rep.excel')}
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]" data-testid="rsx-nirf">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t('rsx.rep.item')}</th>
                {nirf.years.map((y) => (
                  <th key={y.fy} className="py-2 pr-3 text-right font-medium">
                    {y.fy}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['rsx.rep.sponsoredProjects', (y) => fmt.number(y.sponsoredProjects)],
                  ['rsx.rep.agencies', (y) => fmt.number(y.agencies)],
                  ['rsx.rep.sponsoredAmount', (y) => fmt.number(lakh(y.sponsoredRupees))],
                  ['rsx.rep.consultancyProjects', (y) => fmt.number(y.consultancyProjects)],
                  ['rsx.rep.clients', (y) => fmt.number(y.clients)],
                  ['rsx.rep.consultancyAmount', (y) => fmt.number(lakh(y.consultancyRupees))],
                  ['rsx.rep.edp', (y) => `${fmt.number(y.trainingPrograms)} / ${fmt.number(y.trainees)}`],
                  ['rsx.rep.edpAmount', (y) => fmt.number(lakh(y.trainingRupees))],
                ] as [MessageKey, (y: NirfRp['years'][number]) => string][]
              ).map(([k, f]) => (
                <tr key={k} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {t(k)}
                  </th>
                  {nirf.years.map((y) => (
                    <td key={y.fy} className="py-2 pr-3 text-right tabular-nums">
                      {f(y)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 mb-0 text-xs text-muted-foreground">{t('rsx.rep.nirfNote')}</p>
      </Card>

      <Card>
        <h2 className="m-0 mb-3 text-base font-semibold">{t('rsx.rep.naac', { cycle: naac.cycle })}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]" data-testid="rsx-naac">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t('rsx.rep.metric')}</th>
                {naac.years.map((y) => (
                  <th key={y} className="py-2 pr-3 text-right font-medium">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {naac.rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {t(`rsx.c3.${r.key}` as MessageKey)}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={naac.years[i]} className="py-2 pr-3 text-right tabular-nums">
                      {v === null ? '-' : fmt.number(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
