import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import type { Metadata } from 'next';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { StatusPill } from '@/components/admissions/Chips';
import { Card } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import { APPLICATION_STATUSES, type ApplicationRow, type CycleRow } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.tab.applications') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ cycle?: string; status?: string; q?: string }> }) {
  await requireSection('admissions');
  const sp = await searchParams;
  const cycle = sp.cycle && UUID.test(sp.cycle) ? sp.cycle : '';
  const status = (APPLICATION_STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as string) : '';
  const q = new URLSearchParams();
  if (cycle) q.set('cycleId', cycle);
  if (status) q.set('status', status);
  if (sp.q?.trim()) q.set('q', sp.q.trim().slice(0, 60));
  const [apps, cycles] = await Promise.all([load(() => api<ApplicationRow[]>(`/v1/admissions/applications?${q}`)), load(() => api<CycleRow[]>('/v1/admissions/cycles'))]);
  const { t, locale } = await getI18n();
  const keep = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...(cycle ? { cycle } : {}), ...(status ? { status } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return `/admissions/applications${s ? `?${s}` : ''}`;
  };
  return (
    <>
      <PageHeader title={t('adm.tab.applications')} subtitle={t('adm.apps.subtitle')} />
      <AdmissionsTabs current="applications" />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1.5, alignItems: 'center' }}>
        <UrlSelect label={t('adm.cycle')} param="cycle" value={cycle} options={[{ value: '', label: t('adm.allCycles') }, ...(cycles.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
          <LinkButton size="small" href={keep({ status: '' })} variant={status ? 'outlined' : 'contained'}>
            {t('adm.allStatuses')}
          </LinkButton>
          {APPLICATION_STATUSES.map((s) => (
            <LinkButton key={s} size="small" href={keep({ status: s })} variant={status === s ? 'contained' : 'outlined'}>
              {t(`adm.app.${s}` as MessageKey)}
            </LinkButton>
          ))}
        </Stack>
      </Stack>
      {apps.error !== undefined ? (
        <ErrorState message={apps.error} />
      ) : apps.data!.length === 0 ? (
        <EmptyState icon={<HowToRegOutlined />} title={t('adm.apps.none')} testId="no-applications">
          {t('adm.apps.noneBody')}
        </EmptyState>
      ) : (
        <Card padded={false} testId="applications" sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('adm.col.applicant')}</TableCell>
                <TableCell>{t('adm.cycle')}</TableCell>
                <TableCell>{t('adm.col.status')}</TableCell>
                <TableCell>{t('adm.col.fee')}</TableCell>
                <TableCell align="right">{t('adm.col.merit')}</TableCell>
                <TableCell>{t('adm.col.submitted')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {apps.data!.map((a) => (
                <TableRow key={a.id} hover data-testid="application-row">
                  <TableCell>
                    <Typography component={NextLink} href={`/admissions/applications/${a.id}`} variant="subtitle2" sx={{ color: 'primary.main', textDecoration: 'none' }}>
                      {a.applicantName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {a.applicationNo} · {a.phone}
                    </Typography>
                  </TableCell>
                  <TableCell>{a.cycleName}</TableCell>
                  <TableCell>
                    <StatusPill kind="application" status={a.status} />
                  </TableCell>
                  <TableCell>{t(`adm.fee.${a.feeStatus}` as MessageKey)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {a.meritScore === null ? '–' : `${a.meritScore}${a.meritRank ? ` (#${a.meritRank})` : ''}`}
                  </TableCell>
                  <TableCell>{formatDate(a.submittedAt.slice(0, 10), 'short', locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
