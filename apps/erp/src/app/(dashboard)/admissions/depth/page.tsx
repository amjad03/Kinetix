import type { Metadata } from 'next';
import Link from 'next/link';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.depth') };
}

interface Roi {
  rows: { channel: string; leads: number; applied: number; enrolled: number; spendPaise: number; costPerLeadPaise: number | null; costPerEnrolmentPaise: number | null; roiPct: number | null }[];
}
interface Connector { id: string; kind: string; name: string; active: boolean; events: Record<string, number> }
interface Payout { id: string; agentName: string; paidOn: string; grossPaise: number; tdsPaise: number; netPaise: number }
interface Cycle { id: string; name: string }
interface RankRow { applicationId: string; name: string; category: string | null; indexMark: number | null; overallRank: number; categoryRank: number | null }
interface SeatRow { option: string; category: string; seats: number; held: number; left: number }
interface Round { id: string; roundNo: number; status: string; responses: Record<string, number> }

const rupees = (paise: number | null) => (paise === null ? '-' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100));

/** Index-mark rank lists, seat matrix and CAP rounds for a cycle, plus lead sources, ROI and agent payouts. */
export default async function DepthPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  await requireSection('admissions');
  const { cycle } = await searchParams;
  const [roi, connectors, payouts, cycles] = await Promise.all([
    load(() => api<Roi>('/v1/admissions/source-roi')),
    load(() => api<Connector[]>('/v1/admissions/lead-connectors')),
    load(() => api<Payout[]>('/v1/admissions/payouts')),
    load(() => api<Cycle[]>('/v1/admissions/cycles')),
  ]);
  const picked = cycle && /^[0-9a-f-]{36}$/i.test(cycle) ? cycle : cycles.data?.[0]?.id;
  const [rank, seats, rounds] = picked
    ? await Promise.all([
        load(() => api<{ rows: RankRow[] }>(`/v1/admissions/cycles/${picked}/rank-list`)),
        load(() => api<SeatRow[]>(`/v1/admissions/cycles/${picked}/seat-matrix`)),
        load(() => api<Round[]>(`/v1/admissions/cycles/${picked}/rounds`)),
      ])
    : [null, null, null];
  const { t } = await getI18n();
  const err = roi.error ?? connectors.error ?? payouts.error ?? cycles.error;
  return (
    <>
      <PageHeader title={t('adm.tab.depth')} subtitle={t('ad.subtitle')} />
      <AdmissionsTabs current="depth" />
      {err !== undefined ? (
        <ErrorState message={err} />
      ) : (
        <Stack spacing={3}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <SectionTitle>{t('ad.roi.title')}</SectionTitle>
            <Typography variant="body2" color="text.secondary">{t('ad.roi.help')}</Typography>
            {roi.data!.rows.length === 0 ? (
              <Typography sx={{ mt: 1 }}>{t('ad.roi.empty')}</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['channel', 'leads', 'applied', 'enrolled', 'spend', 'cpl', 'cpe', 'roi'].map((k) => (
                      <TableCell key={k}>{t(`ad.roi.${k}` as 'ad.roi.channel')}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {roi.data!.rows.map((r) => (
                    <TableRow key={r.channel}>
                      <TableCell>{r.channel}</TableCell>
                      <TableCell>{r.leads}</TableCell>
                      <TableCell>{r.applied}</TableCell>
                      <TableCell>{r.enrolled}</TableCell>
                      <TableCell>{rupees(r.spendPaise)}</TableCell>
                      <TableCell>{rupees(r.costPerLeadPaise)}</TableCell>
                      <TableCell>{rupees(r.costPerEnrolmentPaise)}</TableCell>
                      <TableCell>{r.roiPct === null ? '-' : `${r.roiPct}%`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <SectionTitle>{t('ad.conn.title')}</SectionTitle>
            <Typography variant="body2" color="text.secondary">{t('ad.conn.help')}</Typography>
            {connectors.data!.length === 0 ? (
              <Typography sx={{ mt: 1 }}>{t('ad.conn.empty')}</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('ad.conn.name')}</TableCell>
                    <TableCell>{t('ad.conn.kind')}</TableCell>
                    <TableCell>{t('ad.conn.active')}</TableCell>
                    <TableCell>{t('ad.conn.received')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {connectors.data!.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{t(`ad.kind.${c.kind}` as 'ad.kind.meta')}</TableCell>
                      <TableCell>{c.active ? t('ad.yes') : t('ad.no')}</TableCell>
                      <TableCell>{c.events.ok ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <SectionTitle>{t('ad.pay.title')}</SectionTitle>
            {payouts.data!.length === 0 ? (
              <Typography>{t('ad.pay.empty')}</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['agent', 'paidOn', 'gross', 'tds', 'net'].map((k) => (
                      <TableCell key={k}>{t(`ad.pay.${k}` as 'ad.pay.agent')}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payouts.data!.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.agentName}</TableCell>
                      <TableCell>{p.paidOn}</TableCell>
                      <TableCell>{rupees(p.grossPaise)}</TableCell>
                      <TableCell>{rupees(p.tdsPaise)}</TableCell>
                      <TableCell>{rupees(p.netPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          {cycles.data!.length > 0 && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <SectionTitle>{t('ad.cycle.pick')}</SectionTitle>
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', mb: 2 }}>
                {cycles.data!.map((c) => (
                  <Link key={c.id} href={`/admissions/depth?cycle=${c.id}`} style={{ fontWeight: c.id === picked ? 700 : 400 }}>
                    {c.name}
                  </Link>
                ))}
              </Stack>

              <SectionTitle>{t('ad.rank.title')}</SectionTitle>
              {!rank?.data || rank.data.rows.length === 0 ? (
                <Typography>{t('ad.rank.empty')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('ad.rank.rank')}</TableCell>
                      <TableCell>{t('ad.rank.name')}</TableCell>
                      <TableCell>{t('ad.rank.category')}</TableCell>
                      <TableCell>{t('ad.rank.index')}</TableCell>
                      <TableCell>{t('ad.rank.catRank')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rank.data.rows.map((r) => (
                      <TableRow key={r.applicationId}>
                        <TableCell>{r.overallRank}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.category ?? '-'}</TableCell>
                        <TableCell>{r.indexMark}</TableCell>
                        <TableCell>{r.categoryRank ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <SectionTitle>{t('ad.seats.title')}</SectionTitle>
              {!seats?.data || seats.data.length === 0 ? (
                <Typography>{t('ad.seats.empty')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('ad.seats.option')}</TableCell>
                      <TableCell>{t('ad.seats.category')}</TableCell>
                      <TableCell>{t('ad.seats.total')}</TableCell>
                      <TableCell>{t('ad.seats.held')}</TableCell>
                      <TableCell>{t('ad.seats.left')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {seats.data.map((s) => (
                      <TableRow key={`${s.option}-${s.category}`}>
                        <TableCell>{s.option}</TableCell>
                        <TableCell>{s.category === 'merit' ? t('ad.seats.merit') : s.category.toUpperCase()}</TableCell>
                        <TableCell>{s.seats}</TableCell>
                        <TableCell>{s.held}</TableCell>
                        <TableCell>{s.left}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <SectionTitle>{t('ad.rounds.title')}</SectionTitle>
              {!rounds?.data || rounds.data.length === 0 ? (
                <Typography>{t('ad.rounds.empty')}</Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell />
                      <TableCell>{t('ad.rounds.status')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rounds.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{t('ad.rounds.no', { n: r.roundNo })}</TableCell>
                        <TableCell>{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>
          )}
        </Stack>
      )}
    </>
  );
}
